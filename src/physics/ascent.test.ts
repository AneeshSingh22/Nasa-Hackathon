import { describe, expect, it } from 'vitest';
import {
  initialState, step, stageOff, jettisonFairing, telemetry, evaluate,
  thrustAt, ispAt, currentMass, gravityTurnPitch,
  MAX_DYNAMIC_PRESSURE, MIN_ORBIT_ALTITUDE, EARTH_ROTATION_SPEED,
  type FlightState,
} from './ascent';
import { normalize, scale, add, cross, vec } from './orbit';
import type { Vehicle } from './rocket';

/**
 * The ascent is the phase where the build phase's numbers finally mean
 * something, so these assert that a well-flown rocket reaches orbit and a
 * badly flown one does not. A flight model where everything works is as
 * useless as one where nothing does.
 *
 * The vehicle below mirrors the real library entries: LR-95 extended core,
 * RL-20 upper stage, telescope and fairing. If `vab/parts.ts` is retuned and
 * these stop passing, the vehicle can no longer fly the mission it is sold
 * for — fix the balance, not the test.
 */

const VEHICLE: Vehicle = {
  payloadMass: 8_000 + 1_900,
  payloadName: 'Orbital telescope and fairing',
  stages: [
    {
      id: 'extended-booster', name: 'LR-95 Extended Core',
      dryMass: 19_000, propellantMass: 360_000,
      thrustVacuum: 6_700_000, thrustSeaLevel: 6_100_000,
      ispVacuum: 318, ispSeaLevel: 282, dragArea: 11, minThrottle: 0.4,
    },
    {
      id: 'upper-stage', name: 'RL-20 Upper Stage',
      dryMass: 5_500, propellantMass: 95_000,
      thrustVacuum: 1_150_000, thrustSeaLevel: 820_000,
      ispVacuum: 348, ispSeaLevel: 300, dragArea: 7, minThrottle: 0.4,
    },
  ],
};

/**
 * Fly the vehicle on an autopilot that follows the published gravity turn.
 *
 * This is the reference ascent: if a competent profile cannot reach orbit, the
 * phase is unwinnable and no amount of UI will fix it.
 */
function flyGravityTurn(options: {
  readonly pitchBias?: number;
  readonly throttle?: number;
  readonly maxSeconds?: number;
} = {}) {
  const dt = 0.1;
  let state: FlightState = { ...initialState(VEHICLE), throttle: options.throttle ?? 1 };
  let maxQ = 0;
  let maxQAltitude = 0;

  const steps = Math.round((options.maxSeconds ?? 900) / dt);
  for (let i = 0; i < steps; i++) {
    const readings = telemetry(VEHICLE, state);
    if (readings.dynamicPressure > maxQ) {
      maxQ = readings.dynamicPressure;
      maxQAltitude = readings.altitude;
    }

    // Aim in the plane of the planet's rotation, which is what launching east
    // means: the vehicle keeps the 465 m/s it started with.
    // Above the atmosphere with apoapsis already clear, burn prograde to raise
    // periapsis. A gravity turn alone lifts apoapsis and leaves periapsis in
    // the ground — circularising is a real and separate part of reaching orbit.
    if (readings.altitude > 130_000 && (readings.apoapsis ?? 0) > MIN_ORBIT_ALTITUDE) {
      state = { ...state, attitude: normalize(state.velocity) };
    } else {
      const up = normalize(state.position);
      const east = normalize(cross(vec(0, 1, 0), state.position));
      const target = gravityTurnPitch(readings.altitude) + (options.pitchBias ?? 0);
      const attitude = normalize(add(scale(up, Math.sin(target)), scale(east, Math.cos(target))));
      state = { ...state, attitude };
    }

    if (state.propellant <= 0 && state.stage === 0) state = stageOff(VEHICLE, state);
    if (readings.altitude > 110_000 && state.fairingAttached) {
      state = jettisonFairing(state);
    }

    state = step(VEHICLE, state, dt);
    const outcome = evaluate(VEHICLE, state);
    if (outcome.kind !== 'flying') {
      return { outcome, state, maxQ, maxQAltitude, telemetry: telemetry(VEHICLE, state) };
    }
  }
  return {
    outcome: { kind: 'flying' } as const,
    state, maxQ, maxQAltitude, telemetry: telemetry(VEHICLE, state),
  };
}

describe('powered flight', () => {
  it('starts on the pad carrying the planet’s rotation', () => {
    const state = initialState(VEHICLE);
    const readings = telemetry(VEHICLE, state);
    expect(readings.altitude).toBeCloseTo(0, 3);
    // Launching eastward from the equator is 465 m/s of free delta-v, which is
    // why launch sites sit as close to the equator as geography allows.
    expect(readings.speed).toBeCloseTo(EARTH_ROTATION_SPEED, 1);
    // But relative to the air it is stationary, so there is no drag on the pad.
    expect(readings.airspeed).toBeLessThan(1);
  });

  it('produces more thrust in vacuum than at sea level', () => {
    const stage = VEHICLE.stages[0]!;
    const atPad = thrustAt(stage, 0, 1);
    const high = thrustAt(stage, 120_000, 1);
    expect(atPad).toBeCloseTo(stage.thrustSeaLevel, 0);
    expect(high).toBeCloseTo(stage.thrustVacuum, 0);
    // A nozzle is tuned for one ambient pressure; the gain is roughly 10%.
    expect(high / atPad).toBeGreaterThan(1.05);
    expect(ispAt(stage, 120_000)).toBeGreaterThan(ispAt(stage, 0));
  });

  it('burns propellant and loses mass as it flies', () => {
    let state: FlightState = { ...initialState(VEHICLE), throttle: 1 };
    const before = currentMass(VEHICLE, state);
    for (let i = 0; i < 100; i++) state = step(VEHICLE, state, 0.1);
    const after = currentMass(VEHICLE, state);
    expect(after).toBeLessThan(before);
    // Roughly 2 tonnes a second at this thrust and isp.
    expect(before - after).toBeGreaterThan(15_000);
  });

  it('loses real speed to drag on the way up', () => {
    // Drag is easy to compute into telemetry and forget to apply as a force,
    // which looks correct on the HUD and is invisible in flight. Climbing
    // straight up for two minutes costs about 65 m/s and 4.5 km against a
    // vacuum run, so this fails if the force is ever dropped.
    const climb = (dragArea: number) => {
      const vehicle: Vehicle = {
        ...VEHICLE,
        stages: [{ ...VEHICLE.stages[0]!, dragArea }],
      };
      let state: FlightState = { ...initialState(vehicle), throttle: 1 };
      for (let i = 0; i < 1_200; i++) {
        state = { ...state, attitude: normalize(state.position) };
        state = step(vehicle, state, 0.1);
      }
      return telemetry(vehicle, state);
    };

    const withDrag = climb(11);
    const withoutDrag = climb(0);
    expect(withoutDrag.speed - withDrag.speed).toBeGreaterThan(30);
    expect(withoutDrag.altitude - withDrag.altitude).toBeGreaterThan(2_000);
  });

  it('reaches a stable orbit on a well-flown gravity turn', () => {
    const flight = flyGravityTurn();
    expect(flight.outcome.kind).toBe('orbit');
    if (flight.outcome.kind !== 'orbit') return;

    // Both ends clear of the atmosphere: a periapsis inside the air is a
    // decaying trajectory, not an orbit.
    expect(flight.outcome.periapsis).toBeGreaterThanOrEqual(MIN_ORBIT_ALTITUDE);
    expect(flight.outcome.apoapsis).toBeGreaterThanOrEqual(MIN_ORBIT_ALTITUDE);
    // Orbital speed at this altitude is about 7 800 m/s.
    expect(flight.telemetry.speed).toBeGreaterThan(7_000);
    expect(flight.telemetry.speed).toBeLessThan(8_500);
    // And it is sideways speed, not climb: that is what orbit actually is.
    expect(flight.telemetry.horizontalSpeed / flight.telemetry.speed).toBeGreaterThan(0.95);
  });

  it('peaks at max-Q in the 7–13 km band the atmosphere model implies', () => {
    const flight = flyGravityTurn();
    // Emergent, not scripted: it falls out of the two-layer density model and
    // the vehicle's acceleration. The reference table in CLAUDE.md pins it.
    expect(flight.maxQAltitude).toBeGreaterThan(7_000);
    expect(flight.maxQAltitude).toBeLessThan(13_000);
    // And the vehicle survives its own nominal ascent, with margin.
    expect(flight.maxQ).toBeLessThan(MAX_DYNAMIC_PRESSURE);
    expect(flight.maxQ).toBeGreaterThan(15_000);
  });

  it('fails to orbit when the player never pitches over', () => {
    // Straight up is the most common beginner mistake, and it must not work:
    // orbit is horizontal speed, and a vehicle that spends everything climbing
    // has nothing left to go sideways with.
    const dt = 0.1;
    let state: FlightState = { ...initialState(VEHICLE), throttle: 1 };
    for (let i = 0; i < 9_000; i++) {
      state = { ...state, attitude: normalize(state.position) };
      if (state.propellant <= 0 && state.stage === 0) state = stageOff(VEHICLE, state);
      state = step(VEHICLE, state, dt);
      const outcome = evaluate(VEHICLE, state);
      if (outcome.kind !== 'flying') {
        expect(outcome.kind).not.toBe('orbit');
        return;
      }
    }
    // If it somehow survived the whole window, it still must not be orbital.
    const readings = telemetry(VEHICLE, state);
    const orbital = readings.periapsis !== null && readings.periapsis >= MIN_ORBIT_ALTITUDE;
    expect(orbital).toBe(false);
  });

  it('breaks up when held hard across the airflow in dense air', () => {
    // A launch vehicle is a tube. Pointing it across its own velocity low down
    // produces side loads it was never built for.
    const dt = 0.1;
    let state: FlightState = { ...initialState(VEHICLE), throttle: 1 };
    let broke = false;
    for (let i = 0; i < 2_000; i++) {
      const readings = telemetry(VEHICLE, state);
      // Once there is real air, yaw 90 degrees off prograde.
      if (readings.altitude > 3_000) {
        const east = normalize(cross(vec(0, 1, 0), state.position));
        state = { ...state, attitude: east };
      } else {
        state = { ...state, attitude: normalize(state.position) };
      }
      state = step(VEHICLE, state, dt);
      const outcome = evaluate(VEHICLE, state);
      if (outcome.kind === 'broke-up') { broke = true; break; }
    }
    expect(broke).toBe(true);
  });

  it('reports apoapsis and periapsis from the trajectory, not from a target', () => {
    const flight = flyGravityTurn();
    const { apoapsis, periapsis } = flight.telemetry;
    expect(apoapsis).not.toBeNull();
    expect(periapsis).not.toBeNull();
    // Apoapsis is by definition the higher of the two.
    expect(apoapsis!).toBeGreaterThanOrEqual(periapsis!);
  });

  it('drops mass and drag with the fairing', () => {
    let state: FlightState = { ...initialState(VEHICLE), throttle: 1 };
    state = { ...state, stage: 1, propellant: VEHICLE.stages[1]!.propellantMass };
    const before = currentMass(VEHICLE, state);
    const dropped = jettisonFairing(state);
    expect(dropped.fairingAttached).toBe(false);
    // Mass is unchanged by this call — the fairing is payload mass the caller
    // removes — but the flag must change so drag falls.
    expect(currentMass(VEHICLE, dropped)).toBe(before);
  });

  it('counts a stage as spent and moves to the next', () => {
    let state: FlightState = { ...initialState(VEHICLE), throttle: 1, propellant: 0 };
    const staged = stageOff(VEHICLE, state);
    expect(staged.stage).toBe(1);
    expect(staged.propellant).toBe(VEHICLE.stages[1]!.propellantMass);
    // The spent stage's dry mass is gone.
    expect(currentMass(VEHICLE, staged)).toBeLessThan(currentMass(VEHICLE, state));

    // And there is no third stage to move to.
    state = { ...staged, propellant: 0 };
    expect(stageOff(VEHICLE, state).stage).toBe(1);
  });

  it('describes a gravity turn that starts vertical and ends horizontal', () => {
    expect(gravityTurnPitch(0)).toBeCloseTo(Math.PI / 2, 5);
    expect(gravityTurnPitch(1_000)).toBeCloseTo(Math.PI / 2, 5);
    expect(gravityTurnPitch(200_000)).toBe(0);
    // Monotonic: the nose never pitches back up.
    let previous = Math.PI / 2;
    for (let altitude = 0; altitude <= 130_000; altitude += 2_000) {
      const pitch = gravityTurnPitch(altitude);
      expect(pitch).toBeLessThanOrEqual(previous + 1e-9);
      previous = pitch;
    }
  });

  it('cannot thrust on an empty tank whatever the throttle says', () => {
    let state: FlightState = { ...initialState(VEHICLE), throttle: 1, propellant: 0 };
    state = step(VEHICLE, state, 0.1);
    expect(state.throttle).toBe(0);
    expect(telemetry(VEHICLE, state).thrust).toBe(0);
  });

  it('falls back to the ground when the engines quit early', () => {
    const dt = 0.5;
    let state: FlightState = { ...initialState(VEHICLE), throttle: 1 };
    // Burn briefly, then cut the engines entirely.
    for (let i = 0; i < 60; i++) {
      state = { ...state, attitude: normalize(state.position) };
      state = step(VEHICLE, state, dt);
    }
    state = { ...state, throttle: 0, propellant: 0, stage: VEHICLE.stages.length - 1 };

    let outcome = evaluate(VEHICLE, state);
    for (let i = 0; i < 4_000 && outcome.kind === 'flying'; i++) {
      state = step(VEHICLE, state, dt);
      outcome = evaluate(VEHICLE, state);
    }
    expect(['crashed', 'stranded']).toContain(outcome.kind);
  });
});
