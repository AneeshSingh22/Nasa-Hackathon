import {
  initialState, step, stageOff, jettisonFairing, telemetry, evaluate, EARTH_ROTATION_SPEED,
  type FlightState, type FlightTelemetry, type FlightOutcome, eastAt,
} from '../physics/ascent';
import { guide, guidanceInput, type GuidanceState } from '../physics/guidance';
import { normalize } from '../physics/orbit';
import { R_EARTH, G0 } from '../physics/constants';
import type { Vehicle } from '../physics/rocket';
import type { ControlAction } from './controls';

/**
 * The launch phase: simulation and controls, and nothing else.
 *
 * It owns no rendering and no DOM. The window view and the instrument panel
 * both read `snapshot` and draw themselves, which is what lets the whole
 * flight be driven headlessly in tests — including the claim that matters
 * most, that the autopilot actually reaches orbit.
 *
 * ## The ignition sequence
 *
 * The vehicle sits clamped on the pad until the player commits to launch. A
 * previous version started the simulation immediately with the throttle at
 * zero: a player who opened it to 32% saw the engine clamp to its 40% minimum,
 * produce less thrust than the vehicle weighs, and sit on the pad with nothing
 * on screen saying why. Now IGNITION runs a short countdown and lights the
 * engines at full thrust, which is how every launch actually begins, and the
 * simulation does not advance until then.
 *
 * ## What the player controls
 *
 * Pitch, throttle, staging and the fairing. Not roll or yaw: a launch ascent
 * genuinely is a pitch programme, every real vehicle flies it that way, and
 * two more axes would bury the lesson under flight-sim controls.
 */

/**
 * Orbit the guidance aims for. m
 *
 * Above the 200 km floor with room to spare, because the guidance stops
 * burning once periapsis is within 10% of its target; aimed at exactly 200 it
 * would stop at 180 and never count as an orbit.
 */
export const TARGET_ORBIT = 230_000;

/** Seconds from IGNITION to lift-off. */
export const COUNTDOWN_SECONDS = 3;

/** How fast the nose swings under full input. rad/s */
const PITCH_RATE = 0.32;
/** How fast the throttle lever travels end to end. per second */
const THROTTLE_RATE = 0.7;
/** Fixed integrator step, so the physics is identical on any hardware. s */
const FIXED_STEP = 0.02;

export const TIME_SCALES = [1, 2, 4, 8] as const;
export type TimeScale = (typeof TIME_SCALES)[number];

export interface FlightSnapshot {
  readonly telemetry: FlightTelemetry;
  readonly outcome: FlightOutcome;
  readonly guidance: GuidanceState;
  readonly stage: number;
  readonly stageCount: number;
  /** Fraction of the current stage's propellant left, 0..1. */
  readonly propellantFraction: number;
  /** Throttle lever position, 0..1. */
  readonly throttle: number;
  /** Commanded nose angle above the horizon. radians */
  readonly pitch: number;
  readonly canStage: boolean;
  readonly canJettison: boolean;
  readonly fairingAttached: boolean;
  readonly autopilot: boolean;
  readonly timeScale: TimeScale;
  /** Seconds since lift-off; negative during the countdown. */
  readonly missionTime: number;
  readonly launched: boolean;
  /** True from IGNITION until lift-off. */
  readonly countingDown: boolean;
  /** Ground distance flown east of the pad. m */
  readonly downrange: number;
  /** 0..1 rumble, from thrust against weight plus aerodynamic buffeting. */
  readonly shake: number;
  readonly enginesLit: boolean;
}

export class FlightPhase {
  private state: FlightState;
  private outcome: FlightOutcome = { kind: 'flying' };
  private accumulator = 0;
  private scale: TimeScale = 1;
  private downrange = 0;
  private commandedPitch = Math.PI / 2;
  private throttle = 0;
  private autopilotOn = false;
  private peakQ = 0;
  private launched = false;
  /** Seconds remaining in the countdown, or null when not counting. */
  private countdown: number | null = null;
  /** Held inputs, -1..1, from the panel or the keyboard. */
  private pitchInput = 0;
  private throttleInput = 0;
  /**
   * Latched once the guidance calls for circularisation, so the burn runs to
   * completion instead of being re-decided on a threshold the burn itself
   * moves. Without it the autopilot flicked between coasting and burning.
   */
  private circularising = false;
  /** Set the first time the flight computer takes the controls. */
  private autopilotUsed = false;

  constructor(private readonly vehicle: Vehicle) {
    this.state = initialState(vehicle);
  }

  get finished(): boolean {
    return this.outcome.kind !== 'flying';
  }

  get peakDynamicPressure(): number {
    return this.peakQ;
  }

  /**
   * True if the pilot flew the whole ascent themselves. The autopilot is a
   * teaching tool, not a cheat, but flying it by hand earns a star of its own.
   */
  get handFlown(): boolean {
    return !this.autopilotUsed;
  }

  get snapshot(): FlightSnapshot {
    const readings = telemetry(this.vehicle, this.state);
    const stage = this.vehicle.stages[this.state.stage];
    const weight = readings.mass * G0;
    const enginesLit = this.launched && readings.thrust > 0;
    const thrustShare = enginesLit && weight > 0 ? Math.min(1, readings.thrust / (weight * 1.8)) : 0;
    const buffet = Math.min(1, readings.dynamicPressure / 28_000);

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
      pitch: this.commandedPitch,
      canStage: this.launched && this.state.stage < this.vehicle.stages.length - 1,
      // Dropping it in dense air would expose the payload it is there to protect.
      canJettison: this.state.fairingAttached && readings.altitude > 55_000,
      fairingAttached: this.state.fairingAttached,
      autopilot: this.autopilotOn,
      timeScale: this.scale,
      missionTime: this.countdown !== null ? -this.countdown : this.state.time,
      launched: this.launched,
      countingDown: this.countdown !== null,
      downrange: this.downrange,
      shake: Math.min(1, thrustShare * 0.7 + buffet * 0.6),
      enginesLit,
    };
  }

  private currentGuidance(readings: FlightTelemetry): GuidanceState {
    if (!this.launched) {
      return {
        phase: 'vertical',
        pitch: Math.PI / 2,
        throttle: 0,
        instruction: this.countdown !== null
          ? 'Countdown. Engines light at T-0.'
          : 'Press IGNITION to launch, or AUTO to let the flight computer fly.',
      };
    }
    return guide(guidanceInput(
      readings.altitude, readings.apoapsis, readings.periapsis,
      readings.verticalSpeed, readings.horizontalSpeed, readings.dynamicPressure,
      this.state.position, this.state.velocity, this.circularising,
    ), TARGET_ORBIT);
  }

  /**
   * Fire a one-shot control.
   *
   * One entry point for the panel and the keyboard, so a switch and its
   * shortcut cannot drift apart.
   */
  operate(action: ControlAction): void {
    switch (action) {
      case 'launch':
        this.ignite();
        break;
      case 'stage':
        this.stage();
        break;
      case 'jettison':
        this.jettison();
        break;
      case 'autopilot':
        this.autopilotOn = !this.autopilotOn;
        if (this.autopilotOn) this.autopilotUsed = true;
        // Handing over on the pad means "fly it for me", which starts with
        // lighting the engines.
        if (this.autopilotOn && !this.launched) this.ignite();
        break;
      case 'time-warp':
        if (this.launched) this.cycleTimeScale();
        break;
      // Held controls pressed once still do something sensible.
      case 'throttle-up':
      case 'throttle-down':
      case 'pitch-up':
      case 'pitch-down':
        this.hold(action, true);
        this.advanceInputs(0.15);
        this.hold(action, false);
        break;
    }
  }

  /**
   * Press or release a held control.
   *
   * Throttle and pitch act continuously while held, at a fixed rate per
   * second, so the response is the same at any frame rate.
   */
  hold(action: ControlAction, down: boolean): void {
    const value = down ? 1 : 0;
    switch (action) {
      case 'throttle-up': this.throttleInput = value; break;
      case 'throttle-down': this.throttleInput = -value; break;
      case 'pitch-up': this.pitchInput = value; break;
      case 'pitch-down': this.pitchInput = -value; break;
      default: return;
    }
    // Reaching for a control takes the vehicle back from the autopilot.
    // Fighting a flight computer for the throttle is the most confusing thing
    // a cockpit can do.
    if (down && this.autopilotOn && this.launched) this.autopilotOn = false;
  }

  cycleTimeScale(): TimeScale {
    const index = TIME_SCALES.indexOf(this.scale);
    this.scale = TIME_SCALES[(index + 1) % TIME_SCALES.length]!;
    return this.scale;
  }

  stage(): boolean {
    if (!this.launched || this.state.stage >= this.vehicle.stages.length - 1) return false;
    this.state = stageOff(this.vehicle, this.state);
    return true;
  }

  jettison(): boolean {
    if (!this.state.fairingAttached) return false;
    this.state = jettisonFairing(this.state);
    return true;
  }

  private ignite(): void {
    if (this.launched || this.countdown !== null) return;
    this.countdown = COUNTDOWN_SECONDS;
  }

  /** Advance by `dt` real seconds. */
  update(dt: number): void {
    if (this.finished) return;

    // The countdown runs in real time: warping a countdown is not a thing.
    if (this.countdown !== null) {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.countdown = null;
        this.launched = true;
        // Every launch lights at full thrust. Anything less and a heavy
        // vehicle sits on the pad burning propellant.
        this.throttle = 1;
      }
      return;
    }
    if (!this.launched) return;

    // Clamp so a stall — an alt-tab, a long frame — cannot spiral into
    // hundreds of catch-up steps at once.
    this.accumulator = Math.min(0.3, this.accumulator + dt * this.scale);
    while (this.accumulator >= FIXED_STEP) {
      this.accumulator -= FIXED_STEP;
      this.advance(FIXED_STEP);
      if (this.finished) break;
    }
  }

  private advanceInputs(dt: number): void {
    this.commandedPitch = clamp(
      this.commandedPitch + this.pitchInput * PITCH_RATE * dt, -Math.PI / 2, Math.PI / 2,
    );
    this.throttle = clamp(this.throttle + this.throttleInput * THROTTLE_RATE * dt, 0, 1);
  }

  private advance(dt: number): void {
    const readings = telemetry(this.vehicle, this.state);
    if (readings.dynamicPressure > this.peakQ) this.peakQ = readings.dynamicPressure;

    // The guidance runs every step whether or not it is flying the vehicle,
    // because its advice is on the panel either way and the burn latch must
    // track the same plan the pilot is being shown.
    const advice = this.currentGuidance(readings);
    if (advice.phase === 'circularise') this.circularising = true;
    if (advice.phase === 'orbit') this.circularising = false;

    if (this.autopilotOn) {
      const command = advice;
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
      this.advanceInputs(dt);
    }

    // Attitude from the commanded pitch, held relative to the local horizon so
    // the nose stays where it was put as the vehicle travels round the planet.
    const up = normalize(this.state.position);
    const east = eastAt(this.state.position);
    const sin = Math.sin(this.commandedPitch);
    const cos = Math.cos(this.commandedPitch);
    const attitude = normalize({
      x: up.x * sin + east.x * cos,
      y: up.y * sin + east.y * cos,
      z: up.z * sin + east.z * cos,
    });

    // A lit engine cannot idle below its minimum, which is why real vehicles
    // throttle to 55-60% rather than to nothing.
    const stage = this.vehicle.stages[this.state.stage];
    let throttle = this.throttle;
    if (stage && throttle > 0 && throttle < stage.minThrottle) throttle = stage.minThrottle;

    this.state = { ...this.state, attitude, throttle };

    this.state = step(this.vehicle, this.state, dt);
    this.downrange = groundDistance(this.state.position, this.state.time);
    this.outcome = evaluate(this.vehicle, this.state);
  }
}

/**
 * Distance over the ground from the pad, measured on the surface. m
 *
 * The simulation runs in an inertial frame, in which the pad itself is moving
 * east at 465 m/s with the planet's rotation. An earlier version accumulated
 * the vehicle's horizontal motion in that frame, so a vehicle sitting on the
 * pad "travelled" 465 metres a second across the ground and was out over the
 * ocean eight seconds after lift-off. Ground distance has to be taken against
 * the rotating surface: the vehicle's angle round the planet, minus the angle
 * the pad has turned through in the same time. Computed directly rather than
 * accumulated, so it cannot drift.
 */
export function groundDistance(position: { x: number; z: number }, time: number): number {
  const vehicleAngle = Math.atan2(position.z, position.x);
  const padAngle = (EARTH_ROTATION_SPEED / R_EARTH) * time;
  return (vehicleAngle - padAngle) * R_EARTH;
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
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
