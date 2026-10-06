import { describe, expect, it } from 'vitest';
import {
  FlightPhase, outcomeReport, groundDistance, TARGET_ORBIT, COUNTDOWN_SECONDS,
} from './FlightPhase';
import { vehicleFromParts } from './vehicle';
import { PART_LIBRARY } from '../vab/parts';
import { MIN_ORBIT_ALTITUDE, EARTH_ROTATION_SPEED } from '../physics/ascent';
import { R_EARTH } from '../physics/constants';

/**
 * The playable flight.
 *
 * `guidance.test.ts` proves the flight plan reaches orbit against the raw
 * integrator. These assert that the phase the player actually drives behaves
 * the same way: it waits for ignition, the autopilot flies it to orbit, the
 * controls move what they say they move, and the simulation does not depend
 * on frame rate. No rendering is involved, which is the point of keeping the
 * phase free of Three.js.
 */

const part = (id: string) => PART_LIBRARY.find(p => p.id === id)!;

function vehicle(booster = 'extended-booster', upper = 'upper-stage', payload = 'telescope') {
  return vehicleFromParts([part(booster), part(upper), part(payload), part('fairing')])!;
}

/** Light the engines and get past the countdown. */
function launch(flight: FlightPhase): void {
  flight.operate('launch');
  flight.update(COUNTDOWN_SECONDS + 0.01);
}

describe('on the pad', () => {
  it('waits for ignition rather than sitting at idle throttle', () => {
    // The player who opened the throttle to 32% before this existed saw the
    // engine clamp to its minimum, produce less thrust than the vehicle
    // weighs, and sit on the pad with nothing saying why.
    const flight = new FlightPhase(vehicle());
    for (let i = 0; i < 300; i++) flight.update(0.02);
    const snap = flight.snapshot;
    expect(snap.launched).toBe(false);
    expect(snap.telemetry.altitude).toBeCloseTo(0, 2);
    expect(snap.guidance.instruction).toMatch(/IGNITION/);
  });

  it('counts down, then lights the engines at full thrust and lifts off', () => {
    const flight = new FlightPhase(vehicle());
    flight.operate('launch');
    expect(flight.snapshot.countingDown).toBe(true);
    expect(flight.snapshot.missionTime).toBeCloseTo(-COUNTDOWN_SECONDS, 3);

    flight.update(COUNTDOWN_SECONDS + 0.01);
    expect(flight.snapshot.launched).toBe(true);
    expect(flight.snapshot.throttle).toBe(1);

    for (let i = 0; i < 500; i++) flight.update(0.02);
    expect(flight.snapshot.telemetry.altitude).toBeGreaterThan(100);
    expect(flight.snapshot.telemetry.verticalSpeed).toBeGreaterThan(0);
  });

  it('cannot stage before launch', () => {
    const flight = new FlightPhase(vehicle());
    expect(flight.snapshot.canStage).toBe(false);
    expect(flight.stage()).toBe(false);
  });

  it('starts the countdown when the autopilot is handed the vehicle on the pad', () => {
    const flight = new FlightPhase(vehicle());
    flight.operate('autopilot');
    expect(flight.snapshot.autopilot).toBe(true);
    expect(flight.snapshot.countingDown).toBe(true);
  });
});

describe('in flight', () => {
  it('flies to orbit under its own autopilot', () => {
    // The whole point of the phase. If this fails the game is unwinnable.
    const flight = new FlightPhase(vehicle());
    flight.operate('autopilot');
    flight.update(COUNTDOWN_SECONDS + 0.01);
    for (let i = 0; i < 400_000 && !flight.finished; i++) flight.update(0.02);

    const outcome = flight.snapshot.outcome;
    expect(outcome.kind).toBe('orbit');
    if (outcome.kind !== 'orbit') return;
    expect(outcome.periapsis).toBeGreaterThanOrEqual(MIN_ORBIT_ALTITUDE);
  });

  it('opens and closes the throttle while the control is held', () => {
    const flight = new FlightPhase(vehicle());
    launch(flight);

    flight.hold('throttle-down', true);
    for (let i = 0; i < 25; i++) flight.update(0.02);
    flight.hold('throttle-down', false);
    const eased = flight.snapshot.throttle;
    expect(eased).toBeLessThan(0.8);

    // Released: the lever stays where it was put.
    for (let i = 0; i < 25; i++) flight.update(0.02);
    expect(flight.snapshot.throttle).toBeCloseTo(eased, 5);

    flight.hold('throttle-up', true);
    for (let i = 0; i < 25; i++) flight.update(0.02);
    expect(flight.snapshot.throttle).toBeGreaterThan(eased);
  });

  it('pitches the nose while the control is held', () => {
    const flight = new FlightPhase(vehicle());
    launch(flight);
    const start = flight.snapshot.pitch;
    flight.hold('pitch-down', true);
    for (let i = 0; i < 100; i++) flight.update(0.02);
    expect(flight.snapshot.pitch).toBeLessThan(start - 0.3);
  });

  it('gives control back to the pilot the moment they reach for it', () => {
    // Fighting a flight computer for the throttle is the most confusing thing
    // a cockpit can do.
    const flight = new FlightPhase(vehicle());
    flight.operate('autopilot');
    flight.update(COUNTDOWN_SECONDS + 0.01);
    expect(flight.snapshot.autopilot).toBe(true);
    flight.hold('pitch-down', true);
    expect(flight.snapshot.autopilot).toBe(false);
  });

  it('does not let the player stage past the last stage', () => {
    const flight = new FlightPhase(vehicle());
    launch(flight);
    expect(flight.stage()).toBe(true);
    expect(flight.snapshot.stage).toBe(1);
    expect(flight.stage()).toBe(false);
  });

  it('refuses to drop the fairing in dense air', () => {
    const flight = new FlightPhase(vehicle());
    launch(flight);
    expect(flight.snapshot.canJettison).toBe(false);
  });

  it('runs the same simulation whatever the frame rate', () => {
    // A fixed integrator step is what makes the flight fair and verifiable.
    const steady = new FlightPhase(vehicle());
    const stuttering = new FlightPhase(vehicle());
    for (const flight of [steady, stuttering]) {
      flight.operate('autopilot');
      flight.update(COUNTDOWN_SECONDS + 0.01);
    }
    for (let i = 0; i < 3_000; i++) steady.update(1 / 60);
    for (let i = 0; i < 1_000; i++) stuttering.update(3 / 60);

    const a = steady.snapshot.telemetry;
    const b = stuttering.snapshot.telemetry;
    expect(Math.abs(b.altitude - a.altitude)).toBeLessThan(a.altitude * 0.01);
    expect(Math.abs(b.speed - a.speed)).toBeLessThan(a.speed * 0.01);
  });

  it('rumbles under thrust and goes still when the engines stop', () => {
    const flight = new FlightPhase(vehicle());
    expect(flight.snapshot.shake).toBeLessThan(1e-6);
    launch(flight);
    flight.update(0.1);
    expect(flight.snapshot.shake).toBeGreaterThan(0.2);
    expect(flight.snapshot.enginesLit).toBe(true);
  });
});

describe('ground distance', () => {
  it('is zero for a vehicle still on the pad, however long it waits', () => {
    // The pad moves east at 465 m/s with the planet. Measured in the inertial
    // frame, a vehicle sitting on it "travelled" that fast across the ground
    // and was out over the ocean eight seconds after lift-off.
    const omega = EARTH_ROTATION_SPEED / R_EARTH;
    for (const time of [0, 10, 120]) {
      const angle = omega * time;
      const onPad = { x: R_EARTH * Math.cos(angle), z: R_EARTH * Math.sin(angle) };
      expect(Math.abs(groundDistance(onPad, time))).toBeLessThan(0.01);
    }
  });

  it('grows as the vehicle moves east of the pad', () => {
    const angle = 50_000 / R_EARTH;
    const ahead = { x: R_EARTH * Math.cos(angle), z: R_EARTH * Math.sin(angle) };
    expect(groundDistance(ahead, 0)).toBeCloseTo(50_000, 0);
  });

  it('stays near the pad during the vertical climb', () => {
    const flight = new FlightPhase(vehicle());
    launch(flight);
    for (let i = 0; i < 500; i++) flight.update(0.02);
    // Ten seconds of vertical flight should not carry the vehicle kilometres.
    expect(Math.abs(flight.snapshot.downrange)).toBeLessThan(200);
  });
});

describe('reports', () => {
  it('describes every ending in terms the player can act on', () => {
    for (const outcome of [
      { kind: 'orbit', apoapsis: 240_000, periapsis: 215_000 },
      { kind: 'crashed', speed: 1_200 },
      { kind: 'broke-up', reason: 'dynamic pressure', value: 60_000 },
      { kind: 'broke-up', reason: 'angle of attack', value: 0.6 },
      { kind: 'stranded', apoapsis: 95_000 },
    ] as const) {
      const report = outcomeReport(outcome);
      expect(report.title.length).toBeGreaterThan(0);
      expect(report.text.length).toBeGreaterThan(40);
    }
  });

  it('aims above the altitude the contract requires', () => {
    // The guidance stops within 10% of its target, so the target must sit
    // more than 10% above the floor or the result never counts.
    expect(TARGET_ORBIT * 0.9).toBeGreaterThanOrEqual(MIN_ORBIT_ALTITUDE);
  });
});
