// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FlightPhase, outcomeReport, TARGET_ORBIT } from './FlightPhase';
import { vehicleFromParts } from './vehicle';
import { PART_LIBRARY } from '../vab/parts';

/**
 * The playable flight.
 *
 * `guidance.test.ts` proves the flight plan reaches orbit against the raw
 * integrator. These assert that the phase the player actually drives behaves
 * the same way: the autopilot flies it, the controls move what they say they
 * move, and the simulation does not depend on frame rate.
 */

const part = (id: string) => PART_LIBRARY.find(p => p.id === id)!;

function vehicle(booster = 'extended-booster', upper = 'upper-stage', payload = 'telescope') {
  return vehicleFromParts([part(booster), part(upper), part(payload), part('fairing')])!;
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
    closePath() {}, fill() {}, stroke() {}, fillText() {}, arc() {},
    createLinearGradient: () => ({ addColorStop() {} }),
    getImageData: () => ({ data: new Uint8ClampedArray(256), width: 8, height: 8 }),
    createImageData: () => ({ data: new Uint8ClampedArray(256), width: 8, height: 8 }),
    putImageData() {},
  } as unknown as RenderingContext);
});

describe('the flight phase', () => {
  it('starts on the pad with the engines off', () => {
    const flight = new FlightPhase(vehicle());
    const snap = flight.snapshot;
    expect(snap.telemetry.altitude).toBeCloseTo(0, 2);
    expect(snap.throttle).toBe(0);
    expect(snap.stage).toBe(0);
    expect(snap.propellantFraction).toBeCloseTo(1, 3);
    expect(flight.finished).toBe(false);
  });

  it('flies to orbit under its own autopilot', () => {
    // The whole point of the phase. If this fails the game is unwinnable.
    const flight = new FlightPhase(vehicle());
    flight.toggleAutopilot();

    for (let i = 0; i < 400_000 && !flight.finished; i++) flight.update(0.02);

    expect(flight.snapshot.outcome.kind).toBe('orbit');
    const outcome = flight.snapshot.outcome;
    if (outcome.kind !== 'orbit') return;
    expect(outcome.periapsis).toBeGreaterThan(150_000);
  });

  it('opens and closes the throttle on the control axis', () => {
    // Open the throttle fully first so the vehicle actually leaves the pad —
    // a rocket held at idle simply sits there and the flight ends on the
    // ground, which is correct physics but tells us nothing about the lever.
    const flight = new FlightPhase(vehicle());
    flight.inputs.throttleChange = 1;
    for (let i = 0; i < 120; i++) flight.update(0.02);
    const opened = flight.snapshot.throttle;
    expect(opened).toBeCloseTo(1, 2);
    expect(flight.finished).toBe(false);

    flight.inputs.throttleChange = -1;
    for (let i = 0; i < 30; i++) flight.update(0.02);
    // Closing must actually move the lever, not merely stop opening it.
    expect(flight.snapshot.throttle).toBeLessThan(opened - 0.1);
  });

  it('does not let the player stage past the last stage', () => {
    const flight = new FlightPhase(vehicle());
    expect(flight.stage()).toBe(true);
    expect(flight.snapshot.stage).toBe(1);
    // There is no third stage to drop to.
    expect(flight.stage()).toBe(false);
    expect(flight.snapshot.stage).toBe(1);
  });

  it('refuses to drop the fairing in dense air', () => {
    // It is there to protect the payload through exactly that air.
    const flight = new FlightPhase(vehicle());
    expect(flight.snapshot.canJettison).toBe(false);
  });

  it('runs the same simulation whatever the frame rate', () => {
    // A fixed integrator step is what makes the flight fair and verifiable.
    // If this drifts, a player on a fast machine flies a different rocket.
    const steady = new FlightPhase(vehicle());
    const stuttering = new FlightPhase(vehicle());
    steady.toggleAutopilot();
    stuttering.toggleAutopilot();

    for (let i = 0; i < 3_000; i++) steady.update(1 / 60);
    // Same total time, wildly uneven frames.
    for (let i = 0; i < 1_000; i++) stuttering.update(3 / 60);

    const a = steady.snapshot.telemetry;
    const b = stuttering.snapshot.telemetry;
    expect(b.altitude).toBeCloseTo(a.altitude, -2);
    expect(b.speed).toBeCloseTo(a.speed, -1);
  });

  it('reports every ending in terms the player can act on', () => {
    for (const outcome of [
      { kind: 'orbit', apoapsis: 190_000, periapsis: 175_000 },
      { kind: 'crashed', speed: 1_200 },
      { kind: 'broke-up', reason: 'dynamic pressure', value: 60_000 },
      { kind: 'broke-up', reason: 'angle of attack', value: 0.6 },
      { kind: 'stranded', apoapsis: 95_000 },
    ] as const) {
      const report = outcomeReport(outcome);
      expect(report.title.length).toBeGreaterThan(0);
      // Every failure explains what to do differently, not just what happened.
      expect(report.text.length).toBeGreaterThan(40);
    }
  });

  it('aims at an orbit above the altitude a stable orbit needs', () => {
    expect(TARGET_ORBIT).toBeGreaterThan(160_000);
  });
});
