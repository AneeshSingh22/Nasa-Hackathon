import { describe, expect, it } from 'vitest';
import {
  guide, guidanceInput, turnPitch, timeToApoapsis, circularSpeedAt, apoapsisSpeed,
  circularisationDeltaV, TURN_START_ALTITUDE, TURN_END_ALTITUDE,
} from './guidance';
import {
  initialState, step, stageOff, jettisonFairing, telemetry, evaluate,
  type FlightState, eastAt,
} from './ascent';
import { normalize, scale, add, vec, dot, propagate } from './orbit';
import { R_EARTH, MU_EARTH } from './constants';
import { vehicleFromParts } from '../flight/vehicle';
import { PART_LIBRARY } from '../vab/parts';
import type { Vehicle } from './rocket';

/**
 * Ascent guidance.
 *
 * The orbital mechanics here are textbook and must match published figures, so
 * those are asserted against closed-form results. The flight profile cannot be
 * checked that way, so it is flown: the test runs the guidance against the real
 * integrator and asserts the vehicle reaches orbit, which is the only claim
 * that matters.
 */

/** Matches FlightPhase.TARGET_ORBIT: above the 200 km floor with margin. */
const TARGET = 230_000;
const part = (id: string) => PART_LIBRARY.find(p => p.id === id)!;

function build(booster: string, upper: string, payload: string): Vehicle {
  return vehicleFromParts([part(booster), part(upper), part(payload), part('fairing')])!;
}

/** Fly a vehicle entirely under guidance and report how it ended. */
function fly(vehicle: Vehicle, maxSeconds = 6_000) {
  let state: FlightState = initialState(vehicle);
  let maxQ = 0;
  const phases = new Set<string>();

  const steps = Math.round(maxSeconds / 0.1);
  for (let i = 0; i < steps; i++) {
    const readings = telemetry(vehicle, state);
    if (readings.dynamicPressure > maxQ) maxQ = readings.dynamicPressure;

    const command = guide(guidanceInput(
      readings.altitude, readings.apoapsis, readings.periapsis,
      readings.verticalSpeed, readings.horizontalSpeed, readings.dynamicPressure,
      state.position, state.velocity,
    ), TARGET);
    phases.add(command.phase);

    const up = normalize(state.position);
    const east = eastAt(state.position);
    const attitude = normalize(add(
      scale(up, Math.sin(command.pitch)),
      scale(east, Math.cos(command.pitch)),
    ));
    state = { ...state, attitude, throttle: command.throttle };

    if (state.propellant <= 0 && state.stage === 0) state = stageOff(vehicle, state);
    if (readings.altitude > 110_000 && state.fairingAttached) {
      state = jettisonFairing(state);
    }

    state = step(vehicle, state, 0.1);
    const outcome = evaluate(vehicle, state);
    if (outcome.kind !== 'flying') {
      return { outcome, state, maxQ, phases, telemetry: telemetry(vehicle, state) };
    }
  }
  return {
    outcome: { kind: 'flying' } as const,
    state, maxQ, phases, telemetry: telemetry(vehicle, state),
  };
}

describe('orbital mechanics', () => {
  it('matches the closed-form circular speed', () => {
    // v = sqrt(mu / r). The reference table pins 400 km at 7 672.6 m/s.
    expect(circularSpeedAt(400_000)).toBeCloseTo(
      Math.sqrt(MU_EARTH / (R_EARTH + 400_000)), 6,
    );
    expect(circularSpeedAt(400_000)).toBeCloseTo(7672.6, 0);
    // Lower orbits are faster.
    expect(circularSpeedAt(160_000)).toBeGreaterThan(circularSpeedAt(400_000));
  });

  it('matches vis-viva at apoapsis', () => {
    // On an ellipse the vehicle is slowest at apoapsis, and slower the more
    // eccentric the orbit is.
    const shallow = apoapsisSpeed(150_000, 180_000);
    const steep = apoapsisSpeed(0, 180_000);
    expect(shallow).toBeGreaterThan(steep);
    // A circular orbit is the degenerate case: apoapsis speed is circular speed.
    expect(apoapsisSpeed(180_000, 180_000)).toBeCloseTo(circularSpeedAt(180_000), 6);
  });

  it('prices circularisation in tens of metres per second, not thousands', () => {
    // This is the number the whole flight plan turns on. Burning continuously
    // on the way up wastes margin; arriving at apoapsis and burning there is
    // nearly free by comparison.
    const cost = circularisationDeltaV(0, 180_000);
    expect(cost).toBeGreaterThan(30);
    expect(cost).toBeLessThan(90);
    // And it falls as the trajectory gets closer to circular already.
    expect(circularisationDeltaV(150_000, 180_000)).toBeLessThan(cost);
  });
});

describe('time to apoapsis', () => {
  it('solves Kepler’s equation rather than dividing by gravity', () => {
    // At orbital speed the vehicle's sideways motion cancels most of gravity,
    // so "vertical speed over g" is badly wrong. Here: a 7 600 m/s vehicle at
    // 188 km climbing at 166 m/s, from the flight that exposed the bug.
    const r = R_EARTH + 188_000;
    const input = {
      altitude: 188_000, apoapsis: 219_000, periapsis: -431_000,
      verticalSpeed: 166, horizontalSpeed: 7_590, dynamicPressure: 0,
      position: vec(r, 0, 0), velocity: vec(166, 0, 7_590),
    };
    const naive = 166 / (MU_EARTH / (r * r));
    const kepler = timeToApoapsis(input);
    // The naive figure was about 18 s; the true one is well over a minute.
    expect(naive).toBeLessThan(20);
    expect(kepler).toBeGreaterThan(100);

    // Cross-check by propagating: the vehicle should be at the top of its arc
    // (vertical speed through zero) after almost exactly that long.
    let state = { position: input.position, velocity: input.velocity };
    const dt = 0.5;
    let t = 0;
    while (t < kepler) { state = propagate(state, dt); t += dt; }
    const climbing = dot(normalize(state.position), state.velocity);
    expect(Math.abs(climbing)).toBeLessThan(2);
  });

  it('is zero once the vehicle is past the top of its arc', () => {
    const r = R_EARTH + 200_000;
    expect(timeToApoapsis({
      altitude: 200_000, apoapsis: 210_000, periapsis: 0,
      verticalSpeed: -50, horizontalSpeed: 7_700, dynamicPressure: 0,
      position: vec(r, 0, 0), velocity: vec(-50, 0, 7_700),
    })).toBe(0);
  });
});

describe('the pitch programme', () => {
  it('starts vertical and ends horizontal', () => {
    expect(turnPitch(0)).toBeCloseTo(Math.PI / 2, 6);
    expect(turnPitch(TURN_START_ALTITUDE)).toBeCloseTo(Math.PI / 2, 6);
    expect(turnPitch(TURN_END_ALTITUDE)).toBe(0);
    expect(turnPitch(200_000)).toBe(0);
  });

  it('never pitches back up on the way', () => {
    let previous = Math.PI / 2;
    for (let altitude = 0; altitude <= TURN_END_ALTITUDE; altitude += 1_000) {
      const pitch = turnPitch(altitude);
      expect(pitch).toBeLessThanOrEqual(previous + 1e-9);
      previous = pitch;
    }
  });
});

describe('guidance phases', () => {
  const base = {
    altitude: 500, apoapsis: 1_000, periapsis: -6_000_000,
    verticalSpeed: 100, horizontalSpeed: 10, dynamicPressure: 1_000,
    position: vec(R_EARTH + 500, 0, 0), velocity: vec(100, 0, 10),
  };

  it('climbs vertically off the pad', () => {
    const command = guide(base, TARGET);
    expect(command.phase).toBe('vertical');
    expect(command.pitch).toBeCloseTo(Math.PI / 2, 6);
    expect(command.throttle).toBe(1);
  });

  it('throttles back through maximum dynamic pressure', () => {
    // Every real launch does this, and it is what keeps a high-thrust vehicle
    // from breaking itself in the dense air.
    const command = guide({ ...base, altitude: 11_000, dynamicPressure: 40_000 }, TARGET);
    expect(command.phase).toBe('gravity-turn');
    expect(command.throttle).toBeLessThan(1);
    expect(command.instruction).toMatch(/dynamic pressure/i);
  });

  it('cuts the engines once apoapsis reaches the target', () => {
    // The single most important rule in the plan: burning on past this point
    // raises apoapsis, costs propellant, and buys nothing.
    // Position and velocity must agree with the speeds quoted: the time to
    // apoapsis is now solved from the actual orbit, not from vertical speed.
    const command = guide({
      ...base, altitude: 100_000, apoapsis: TARGET, periapsis: -1_000_000,
      verticalSpeed: 400, horizontalSpeed: 5_000, dynamicPressure: 0,
      position: vec(R_EARTH + 100_000, 0, 0), velocity: vec(400, 0, 5_000),
    }, TARGET);
    expect(command.phase).toBe('coast');
    expect(command.throttle).toBe(0);
  });

  it('burns horizontally at apoapsis, not on the way up', () => {
    const command = guide({
      ...base, altitude: TARGET - 1_000, apoapsis: TARGET, periapsis: -1_000_000,
      verticalSpeed: 2, horizontalSpeed: 7_000, dynamicPressure: 0,
      position: vec(R_EARTH + TARGET - 1_000, 0, 0), velocity: vec(2, 0, 7_000),
    }, TARGET);
    expect(command.phase).toBe('circularise');
    // Thrust into horizontal speed: the nose holds vertical speed near zero,
    // which at 2 m/s of climb means a hair below the horizon.
    expect(Math.abs(command.pitch)).toBeLessThan(0.01);
    expect(command.throttle).toBe(1);
    expect(command.instruction).toMatch(/\d+ m\/s/);
  });

  it('shuts down once the orbit is made', () => {
    const command = guide({
      ...base, altitude: TARGET, apoapsis: TARGET + 2_000, periapsis: TARGET - 2_000,
      verticalSpeed: 0, horizontalSpeed: 7_800, dynamicPressure: 0,
    }, TARGET);
    expect(command.phase).toBe('orbit');
    expect(command.throttle).toBe(0);
  });
});

describe('flying the plan', () => {
  it('puts a well-matched vehicle into a stable orbit', () => {
    const flight = fly(build('extended-booster', 'upper-stage', 'telescope'));

    expect(flight.outcome.kind).toBe('orbit');
    if (flight.outcome.kind !== 'orbit') return;
    expect(flight.outcome.periapsis).toBeGreaterThan(160_000);
    // And it got there by going sideways, which is what orbit is.
    expect(flight.telemetry.horizontalSpeed / flight.telemetry.speed)
      .toBeGreaterThan(0.95);
  });

  it('walks through the phases in order rather than skipping to the end', () => {
    const flight = fly(build('extended-booster', 'upper-stage', 'telescope'));
    expect(flight.phases.has('vertical')).toBe(true);
    expect(flight.phases.has('gravity-turn')).toBe(true);
    // Coasting is the phase that makes the plan efficient; a flight that never
    // coasts is burning continuously and wasting its margin.
    expect(flight.phases.has('coast')).toBe(true);
  });

  it('survives its own ascent, with max-Q inside the expected band', () => {
    const flight = fly(build('extended-booster', 'upper-stage', 'telescope'));
    // The reference table puts max-Q between 7 and 13 km; the guidance must
    // not fly a profile that moves it or exceeds the structural limit.
    expect(flight.maxQ).toBeLessThan(55_000);
    expect(flight.maxQ).toBeGreaterThan(10_000);
  });

  it('cannot carry the heaviest payload to orbit on the smallest booster', () => {
    // The build phase sells the laboratory as having almost no margin. If this
    // starts passing, that warning has become a lie and the balance is wrong.
    const flight = fly(build('solid-booster', 'kerolox-upper', 'science-lab'));
    expect(flight.outcome.kind).not.toBe('orbit');
  });

  it('rewards a better vehicle with a better outcome', () => {
    const cheap = fly(build('solid-booster', 'kerolox-upper', 'telescope'));
    const good = fly(build('extended-booster', 'upper-stage', 'telescope'));

    expect(good.outcome.kind).toBe('orbit');
    expect(cheap.outcome.kind).not.toBe('orbit');
  });
});
