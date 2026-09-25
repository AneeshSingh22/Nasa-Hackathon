import { describe, it, expect } from 'vitest';
import { G0, MU_EARTH, R_EARTH } from './constants';
import { density, dynamicPressure, speedOfSound } from './atmosphere';
import {
  elementsFromState,
  eccentricityVector,
  circularSpeed,
  hohmannTransfer,
  propagate,
  magnitude,
  vec,
} from './orbit';
import { deltaV, totalDeltaV, burnTime, liftoffMass, type Vehicle } from './rocket';
import { ATLAS_CLASS_TWO_STAGE } from '../content/vehicles';

/**
 * These tests check the simulation against published values. A physics bug
 * found here is a typo; the same bug found in week three is fatal, because
 * every balance decision made in between was tuned around it.
 */

describe('atmosphere', () => {
  it('matches the US Standard Atmosphere at sea level', () => {
    expect(density(0)).toBeCloseTo(1.225, 3);
  });

  it('tracks the US Standard Atmosphere within 12% through the stratosphere', () => {
    // Published US Standard Atmosphere 1976 values.
    const reference: Array<[number, number]> = [
      [11000, 0.3639],
      [20000, 0.08891],
      [32000, 0.01356],
    ];
    for (const [altitude, expected] of reference) {
      const error = Math.abs(density(altitude) - expected) / expected;
      expect(error, `at ${altitude} m`).toBeLessThan(0.12);
    }
  });

  it('decays monotonically and vanishes above the atmosphere', () => {
    let previous = density(0);
    for (let h = 1000; h <= 140000; h += 1000) {
      const current = density(h);
      expect(current).toBeLessThanOrEqual(previous);
      previous = current;
    }
    expect(density(140000)).toBe(0);
  });

  it('puts max-Q in the real 7-13 km band for a typical ascent', () => {
    // Sweep a plausible ascent speed profile and find where q peaks.
    let peakQ = 0;
    let peakAltitude = 0;
    for (let h = 0; h < 40000; h += 100) {
      // Rough but representative: speed climbing through the lower atmosphere.
      const speed = 60 + h * 0.055;
      const q = dynamicPressure(h, speed);
      if (q > peakQ) {
        peakQ = q;
        peakAltitude = h;
      }
    }
    expect(peakAltitude).toBeGreaterThan(6000);
    expect(peakAltitude).toBeLessThan(14000);
  });

  it('gives a sea-level speed of sound near 340 m/s', () => {
    expect(speedOfSound(0)).toBeGreaterThan(335);
    expect(speedOfSound(0)).toBeLessThan(345);
  });
});

describe('orbital mechanics', () => {
  it('gives the published circular speed and period at 400 km', () => {
    // The ISS orbits near 400 km at about 7.67 km/s with a ~92.5 minute period.
    const r = R_EARTH + 400_000;
    const v = circularSpeed(r);
    // sqrt(3.986004418e14 / 6.771e6) = 7672.6 m/s
    expect(v).toBeCloseTo(7672.6, 1);

    const elements = elementsFromState({
      position: vec(r, 0, 0),
      velocity: vec(0, v, 0),
    });
    expect(elements.period / 60).toBeGreaterThan(92);
    expect(elements.period / 60).toBeLessThan(93);
    expect(elements.eccentricity).toBeCloseTo(0, 6);
  });

  it('recovers apoapsis and periapsis of a known ellipse', () => {
    // Raise apoapsis to 2000 km from a 400 km circular orbit.
    const r1 = R_EARTH + 400_000;
    const r2 = R_EARTH + 2_000_000;
    const { first } = hohmannTransfer(r1, r2);

    const elements = elementsFromState({
      position: vec(r1, 0, 0),
      velocity: vec(0, circularSpeed(r1) + first, 0),
    });

    expect(elements.periapsis).toBeCloseTo(r1, -2);
    expect(elements.apoapsis).toBeCloseTo(r2, -2);
  });

  it('points the eccentricity vector at periapsis', () => {
    const r1 = R_EARTH + 400_000;
    const { first } = hohmannTransfer(r1, R_EARTH + 2_000_000);
    const e = eccentricityVector({
      position: vec(r1, 0, 0),
      velocity: vec(0, circularSpeed(r1) + first, 0),
    });
    // Periapsis is where we are, on the +x axis, so e should lie along +x.
    expect(Math.atan2(e.y, e.x)).toBeCloseTo(0, 6);
    expect(magnitude(e)).toBeCloseTo(0.1057, 3);
  });

  it('reproduces the textbook Hohmann transfer cost', () => {
    const { first, second, total } = hohmannTransfer(
      R_EARTH + 400_000,
      R_EARTH + 2_000_000,
    );
    expect(first).toBeCloseTo(395, 0);
    expect(second).toBeCloseTo(375, 0);
    expect(total).toBeCloseTo(770, 0);
  });

  it('conserves energy over a full orbit under RK4', () => {
    const r = R_EARTH + 400_000;
    let state = { position: vec(r, 0, 0), velocity: vec(0, circularSpeed(r), 0) };
    const initial = elementsFromState(state);

    // One full revolution in 10-second steps.
    const steps = Math.round(initial.period / 10);
    for (let i = 0; i < steps; i++) state = propagate(state, 10);

    const final = elementsFromState(state);
    const drift = Math.abs(final.energy - initial.energy) / Math.abs(initial.energy);
    expect(drift).toBeLessThan(1e-6);

    // And it should come back to roughly where it started.
    expect(magnitude(state.position)).toBeCloseTo(r, -3);
  });

  it('identifies escape trajectories', () => {
    const r = R_EARTH + 400_000;
    const escapeSpeed = Math.sqrt((2 * MU_EARTH) / r);
    const elements = elementsFromState({
      position: vec(r, 0, 0),
      velocity: vec(0, escapeSpeed * 1.01, 0),
    });
    expect(elements.eccentricity).toBeGreaterThan(1);
    expect(elements.apoapsis).toBe(Infinity);
    expect(elements.period).toBe(Infinity);
  });
});

describe('rocket equation', () => {
  it('matches a hand-computed delta-v', () => {
    // 2000 kg wet, 1400 kg dry, isp 320 s.
    // dv = 320 * 9.80665 * ln(2000/1400) = 1119 m/s
    expect(deltaV(2000, 1400, 320)).toBeCloseTo(1119, 0);
  });

  it('returns zero for a vehicle with no propellant', () => {
    expect(deltaV(1400, 1400, 320)).toBe(0);
  });

  it('scales with the natural log of the mass ratio, not linearly', () => {
    // Doubling the propellant does not double the delta-v. This is the single
    // most counter-intuitive fact in rocketry and the game must get it right.
    const single = deltaV(2000, 1000, 300);
    const double = deltaV(3000, 1000, 300);
    expect(double).toBeLessThan(single * 2);
    expect(double).toBeCloseTo(300 * G0 * Math.log(3), 0);
  });
});

describe('the campaign launch vehicle', () => {
  const vehicle: Vehicle = ATLAS_CLASS_TWO_STAGE;

  it('can actually reach low Earth orbit', () => {
    // LEO needs about 9,400 m/s including gravity and drag losses.
    const budget = totalDeltaV(vehicle);
    expect(budget).toBeGreaterThan(9400);
  });

  it('is not absurdly overpowered', () => {
    // An earlier iteration had 11,300 m/s and flung itself into a 6,000 km
    // ellipse on every profile, which made the flying meaningless.
    expect(totalDeltaV(vehicle)).toBeLessThan(11000);
  });

  it('can lift off the pad', () => {
    const mass = liftoffMass(vehicle);
    const first = vehicle.stages[0];
    expect(first).toBeDefined();
    if (!first) return;
    const twr = first.thrustSeaLevel / (mass * G0);
    // Falcon 9 lifts off near 1.4. Below 1.0 it does not move at all.
    expect(twr).toBeGreaterThan(1.15);
    expect(twr).toBeLessThan(1.8);
  });

  it('has a plausible first-stage burn time', () => {
    const first = vehicle.stages[0];
    expect(first).toBeDefined();
    if (!first) return;
    // Real first stages burn for roughly two to three minutes.
    const t = burnTime(first);
    expect(t).toBeGreaterThan(100);
    expect(t).toBeLessThan(220);
  });

  it('has an upper stage that can push its own stack', () => {
    const second = vehicle.stages[1];
    expect(second).toBeDefined();
    if (!second) return;
    const upperStackMass = second.dryMass + second.propellantMass + vehicle.payloadMass;
    const twr = second.thrustVacuum / (upperStackMass * G0);
    // Upper stages can be below 1.0 since they never lift from the ground,
    // but too low and the ascent bleeds delta-v to gravity losses.
    expect(twr).toBeGreaterThan(0.7);
  });
});
