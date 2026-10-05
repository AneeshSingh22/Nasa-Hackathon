import * as THREE from 'three';
import {
  initialState, step, stageOff, jettisonFairing, telemetry, evaluate,
  type FlightState, type FlightTelemetry, type FlightOutcome,
} from '../physics/ascent';
import { guide, guidanceInput, type GuidanceState } from '../physics/guidance';
import { normalize, cross, vec, magnitude } from '../physics/orbit';
import { R_EARTH } from '../physics/constants';
import type { Vehicle } from '../physics/rocket';
import { createCockpit, type CockpitRig } from './CockpitScene';

/**
 * The launch phase, start to finish.
 *
 * Owns the simulation, the cockpit scene and the player's inputs, and nothing
 * else: it does not touch the DOM, so the HUD reads a snapshot and draws
 * itself. That separation is what let the whole flight be verified headlessly
 * before any of it was wired up.
 *
 * ## What the player controls
 *
 * Pitch, throttle, staging, and when to drop the fairing. Not roll or yaw: a
 * launch ascent genuinely is a pitch programme, every real vehicle flies it
 * that way, and adding two more axes would bury the lesson under flight-sim
 * controls without teaching anything extra.
 *
 * ## Autopilot
 *
 * `physics/guidance.ts` can fly the vehicle, and the player can hand over to
 * it. That is not a cheat: the guidance is the *answer* to the phase, and
 * being able to watch a correct ascent and then try to match it by hand is how
 * most people learn what the gravity turn is actually doing. The HUD shows the
 * same guidance line whether or not the autopilot is engaged, so a manual
 * pilot is being taught rather than left guessing.
 */

/** Target orbit the guidance aims for. m */
export const TARGET_ORBIT = 180_000;

/** How fast the nose swings under full input. rad/s */
const PITCH_RATE = 0.35;
/** How fast the throttle lever moves. per second */
const THROTTLE_RATE = 0.8;
/** Fixed integrator step, so physics is identical on any hardware. s */
const FIXED_STEP = 0.02;

export const TIME_SCALES = [1, 2, 4, 8] as const;
export type TimeScale = (typeof TIME_SCALES)[number];

export interface FlightInputs {
  /** -1 to 1. Positive raises the nose. */
  pitch: number;
  /** -1 to 1. Positive opens the throttle. */
  throttleChange: number;
}

export interface FlightSnapshot {
  readonly telemetry: FlightTelemetry;
  readonly outcome: FlightOutcome;
  readonly guidance: GuidanceState;
  readonly stage: number;
  readonly stageCount: number;
  /** Fraction of the current stage's propellant left, 0..1. */
  readonly propellantFraction: number;
  readonly throttle: number;
  readonly canStage: boolean;
  readonly canJettison: boolean;
  readonly autopilot: boolean;
  readonly timeScale: TimeScale;
  readonly time: number;
}

export class FlightPhase {
  readonly cockpit: CockpitRig;
  readonly inputs: FlightInputs = { pitch: 0, throttleChange: 0 };

  private state: FlightState;
  private outcome: FlightOutcome = { kind: 'flying' };
  private accumulator = 0;
  private scale: TimeScale = 1;
  private downrange = 0;
  private commandedPitch = Math.PI / 2;
  private throttle = 0;
  private autopilotOn = false;
  private peakQ = 0;

  constructor(private readonly vehicle: Vehicle) {
    this.state = initialState(vehicle);
    this.cockpit = createCockpit();
    this.syncCockpit();
  }

  get finished(): boolean {
    return this.outcome.kind !== 'flying';
  }

  get peakDynamicPressure(): number {
    return this.peakQ;
  }

  get snapshot(): FlightSnapshot {
    const readings = telemetry(this.vehicle, this.state);
    const stage = this.vehicle.stages[this.state.stage];
    return {
      telemetry: readings,
      outcome: this.outcome,
      guidance: this.currentGuidance(readings),
      stage: this.state.stage,
      stageCount: this.vehicle.stages.length,
      propellantFraction: stage && stage.propellantMass > 0
        ? this.state.propellant / stage.propellantMass
        : 0,
      throttle: this.throttle,
      canStage: this.state.stage < this.vehicle.stages.length - 1,
      // Dropping it in dense air would destroy the payload it protects.
      canJettison: this.state.fairingAttached && readings.altitude > 55_000,
      autopilot: this.autopilotOn,
      timeScale: this.scale,
      time: this.state.time,
    };
  }

  private currentGuidance(readings: FlightTelemetry): GuidanceState {
    return guide(guidanceInput(
      readings.altitude, readings.apoapsis, readings.periapsis,
      readings.verticalSpeed, readings.horizontalSpeed, readings.dynamicPressure,
      this.state.position, this.state.velocity,
    ), TARGET_ORBIT);
  }

  toggleAutopilot(): boolean {
    this.autopilotOn = !this.autopilotOn;
    return this.autopilotOn;
  }

  cycleTimeScale(): TimeScale {
    const index = TIME_SCALES.indexOf(this.scale);
    this.scale = TIME_SCALES[(index + 1) % TIME_SCALES.length]!;
    return this.scale;
  }

  stage(): boolean {
    if (this.state.stage >= this.vehicle.stages.length - 1) return false;
    this.state = stageOff(this.vehicle, this.state);
    return true;
  }

  jettison(): boolean {
    if (!this.state.fairingAttached) return false;
    this.state = jettisonFairing(this.state);
    return true;
  }

  update(dt: number): void {
    if (this.finished) return;
    // Clamp so a stall — an alt-tab, a long frame — cannot spiral into
    // hundreds of catch-up steps at once.
    this.accumulator = Math.min(0.3, this.accumulator + dt * this.scale);
    while (this.accumulator >= FIXED_STEP) {
      this.accumulator -= FIXED_STEP;
      this.advance(FIXED_STEP);
      if (this.finished) break;
    }
    this.syncCockpit();
  }

  private advance(dt: number): void {
    const readings = telemetry(this.vehicle, this.state);
    if (readings.dynamicPressure > this.peakQ) this.peakQ = readings.dynamicPressure;

    if (this.autopilotOn) {
      const command = this.currentGuidance(readings);
      this.commandedPitch = command.pitch;
      this.throttle = command.throttle;
      // The autopilot stages and drops the fairing too, or it would strand
      // itself on a spent stage while flying a perfect profile.
      if (this.state.propellant <= 0 && this.state.stage < this.vehicle.stages.length - 1) {
        this.state = stageOff(this.vehicle, this.state);
      }
      if (readings.altitude > 110_000 && this.state.fairingAttached) {
        this.state = jettisonFairing(this.state);
      }
    } else {
      this.commandedPitch = clamp(
        this.commandedPitch + this.inputs.pitch * PITCH_RATE * dt,
        -Math.PI / 2, Math.PI / 2,
      );
      this.throttle = clamp(
        this.throttle + this.inputs.throttleChange * THROTTLE_RATE * dt, 0, 1,
      );
    }

    // Build the attitude from the commanded pitch, held relative to the local
    // horizon so the nose stays where it was put as the vehicle travels round
    // the planet rather than drifting with the rotating local vertical.
    const up = normalize(this.state.position);
    const east = normalize(cross(vec(0, 1, 0), this.state.position));
    const attitude = normalize({
      x: up.x * Math.sin(this.commandedPitch) + east.x * Math.cos(this.commandedPitch),
      y: up.y * Math.sin(this.commandedPitch) + east.y * Math.cos(this.commandedPitch),
      z: up.z * Math.sin(this.commandedPitch) + east.z * Math.cos(this.commandedPitch),
    });

    // A lit engine cannot idle below its minimum, which is why real vehicles
    // throttle to 55-60% rather than to nothing.
    const stage = this.vehicle.stages[this.state.stage];
    let throttle = this.throttle;
    if (stage && throttle > 0 && throttle < stage.minThrottle) {
      throttle = stage.minThrottle;
    }

    this.state = { ...this.state, attitude, throttle };

    const before = this.state.position;
    this.state = step(this.vehicle, this.state, dt);

    const travelled = magnitude({
      x: this.state.position.x - before.x,
      y: this.state.position.y - before.y,
      z: this.state.position.z - before.z,
    });
    const altitude = magnitude(this.state.position) - R_EARTH;
    this.downrange += travelled * (R_EARTH / (R_EARTH + Math.max(0, altitude)));

    this.outcome = evaluate(this.vehicle, this.state);
  }

  private syncCockpit(): void {
    const readings = telemetry(this.vehicle, this.state);

    // Shake from what is actually happening to the vehicle: engine thrust
    // against its own weight, plus the buffeting of dynamic pressure. Both
    // fall away naturally — thrust at burnout, buffeting above the air — so
    // the player feels staging and max-Q without being told.
    const weight = readings.mass * 9.80665;
    const thrustShare = weight > 0 ? Math.min(1, readings.thrust / (weight * 2)) : 0;
    const buffet = Math.min(1, readings.dynamicPressure / 30_000);
    this.cockpit.shake(Math.min(1, thrustShare * 0.7 + buffet * 0.6), this.state.time);

    this.cockpit.update(
      readings.altitude,
      new THREE.Vector3(this.state.attitude.x, this.state.attitude.y, this.state.attitude.z),
      vec3(normalize(this.state.position)),
      this.downrange,
    );
  }

  dispose(): void {
    this.cockpit.dispose();
  }
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function vec3(v: { x: number; y: number; z: number }): THREE.Vector3 {
  return new THREE.Vector3(v.x, v.y, v.z);
}

/** A short, factual account of how the flight ended. */
export function outcomeReport(outcome: FlightOutcome): { title: string; text: string } {
  switch (outcome.kind) {
    case 'orbit':
      return {
        title: 'Orbit achieved',
        text: `The payload is in a stable orbit of ${(outcome.periapsis / 1000).toFixed(0)} `
          + `by ${(outcome.apoapsis / 1000).toFixed(0)} kilometres. Both ends clear the `
          + 'atmosphere, so it will stay there.',
      };
    case 'crashed':
      return {
        title: 'Vehicle lost',
        text: `It hit the ground at ${outcome.speed.toFixed(0)} metres per second. `
          + 'Orbit is sideways speed, not height: a vehicle that only climbs comes back down.',
      };
    case 'broke-up':
      return outcome.reason === 'dynamic pressure'
        ? {
          title: 'Structural failure',
          text: `The vehicle broke up under ${(outcome.value / 1000).toFixed(0)} kilopascals `
            + 'of dynamic pressure. Throttle back through the dense air, as every real '
            + 'launch does, and open up again above it.',
        }
        : {
          title: 'Structural failure',
          text: 'The vehicle broke up: it was held too far across the airflow with air '
            + 'still around it. Keep the nose near prograde until the atmosphere thins.',
        };
    case 'stranded':
      return {
        title: 'Short of orbit',
        text: `Propellant ran out with apoapsis at ${(outcome.apoapsis / 1000).toFixed(0)} `
          + 'kilometres. Either the vehicle needed more delta-v, or the ascent spent it '
          + 'climbing instead of building horizontal speed.',
      };
    default:
      return { title: 'In flight', text: '' };
  }
}
