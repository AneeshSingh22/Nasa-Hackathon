import { MU_EARTH, R_EARTH } from './constants';
import { dot, elementsFromState, type Vec3 } from './orbit';

/**
 * Ascent guidance: the flight plan a launch vehicle actually follows.
 *
 * Written analytically rather than tuned, because tuning it by hand did not
 * converge. The failure mode was instructive and is worth recording: an
 * autopilot that burns continuously until periapsis rises wastes almost all of
 * its margin pushing apoapsis to thousands of kilometres, then arrives back in
 * the atmosphere at orbital speed with an empty tank. The vehicle was never
 * short of delta-v — it had nearly 1 900 m/s spare — it was pointing it in the
 * wrong direction.
 *
 * The real technique, which every launch vehicle and every Kerbal player uses,
 * has three phases:
 *
 * 1. **Gravity turn.** Climb vertically to clear the dense air, then pitch
 *    over smoothly, trading vertical speed for horizontal. Thrust is aimed
 *    along the vehicle's own velocity so no energy is spent turning.
 * 2. **Cut and coast.** The moment apoapsis reaches the target altitude, stop
 *    burning. Continuing lifts apoapsis higher, which costs propellant and
 *    buys nothing — the vehicle is already going to arrive at the right
 *    height.
 * 3. **Circularise at apoapsis.** At the top of the arc, burn horizontally to
 *    raise periapsis. This is a small burn: from a 0 x 180 km trajectory it
 *    costs about 55 m/s, because vis-viva says apoapsis speed on that ellipse
 *    is 7 746 m/s against 7 800 m/s circular.
 *
 * The third number is the one that makes the whole thing work. Circularisation
 * is cheap *if it happens at apoapsis*, and ruinously expensive anywhere else.
 *
 * Sources: the vis-viva equation for the burn cost, and the standard gravity
 * turn profile described in launch-vehicle guidance literature and in KSP
 * ascent practice (pitch over early, hold prograde, cut at target apoapsis,
 * circularise at the top).
 */

/** Phases of the ascent, in order. */
export type AscentPhase =
  | 'vertical'
  | 'gravity-turn'
  | 'coast'
  | 'circularise'
  | 'orbit';

export interface GuidanceState {
  readonly phase: AscentPhase;
  /** Commanded pitch above the local horizon. radians */
  readonly pitch: number;
  /** Commanded throttle, 0..1. */
  readonly throttle: number;
  /** One short line explaining what the vehicle should be doing and why. */
  readonly instruction: string;
}

export interface GuidanceInput {
  readonly altitude: number;
  /** Apoapsis altitude, or null on an escape or purely ballistic reading. */
  readonly apoapsis: number | null;
  readonly periapsis: number | null;
  readonly verticalSpeed: number;
  readonly horizontalSpeed: number;
  readonly dynamicPressure: number;
  /** Position and velocity, for the time-to-apoapsis estimate. */
  readonly position: Vec3;
  readonly velocity: Vec3;
  /**
   * Whether the circularisation burn is already under way. Once it starts it
   * runs until the orbit is made: re-deciding every step on a threshold the
   * burn itself moves made the autopilot flick between coasting and burning.
   */
  readonly circularising?: boolean;
}

/** Altitude at which the gravity turn begins. m */
export const TURN_START_ALTITUDE = 1_500;

/**
 * Altitude at which the turn is complete and the vehicle flies horizontally.
 *
 * Chosen so the vehicle is near-horizontal by the time it leaves the
 * appreciable atmosphere, which is what keeps angle of attack near zero
 * through max-Q.
 */
export const TURN_END_ALTITUDE = 65_000;

/** Seconds before apoapsis at which the circularisation burn starts. */
export const CIRCULARISE_LEAD = 30;

/** Dynamic pressure above which the vehicle throttles back. Pa */
export const MAX_Q_THROTTLE_THRESHOLD = 24_000;
/** Throttle held through max-Q. Real vehicles use roughly 55-70%. */
export const MAX_Q_THROTTLE = 0.6;

/**
 * The gravity turn pitch programme.
 *
 * A cosine-shaped ramp from vertical to horizontal. The shape matters: a
 * linear ramp holds the vehicle too steep for too long and wastes propellant
 * lifting altitude it will not keep, while pitching over too fast drives it
 * into dense air at high speed.
 */
export function turnPitch(altitude: number): number {
  if (altitude <= TURN_START_ALTITUDE) return Math.PI / 2;
  if (altitude >= TURN_END_ALTITUDE) return 0;
  const progress = (altitude - TURN_START_ALTITUDE)
    / (TURN_END_ALTITUDE - TURN_START_ALTITUDE);
  // cos ramps slowly at first and steeply later, which is the shape a real
  // gravity turn follows as aerodynamic forces fall away.
  return (Math.PI / 2) * Math.cos(progress * Math.PI / 2);
}

/**
 * Speed needed for a circular orbit at a given altitude.
 *
 * v = sqrt(mu / r). The textbook result, and the number the circularisation
 * burn is aiming at.
 */
export function circularSpeedAt(altitude: number): number {
  return Math.sqrt(MU_EARTH / (R_EARTH + altitude));
}

/**
 * Speed at apoapsis on an ellipse with the given apsides.
 *
 * Vis-viva: v = sqrt(mu * (2/r - 1/a)) evaluated at r = apoapsis.
 */
export function apoapsisSpeed(periapsisAltitude: number, apoapsisAltitude: number): number {
  const rp = R_EARTH + periapsisAltitude;
  const ra = R_EARTH + apoapsisAltitude;
  const semiMajor = (rp + ra) / 2;
  return Math.sqrt(MU_EARTH * (2 / ra - 1 / semiMajor));
}

/**
 * Delta-v to circularise at apoapsis.
 *
 * The difference between circular speed there and the speed the vehicle will
 * actually have when it arrives. Small — tens of metres per second — which is
 * precisely why the burn must happen at apoapsis and not on the way up.
 */
export function circularisationDeltaV(
  periapsisAltitude: number,
  apoapsisAltitude: number,
): number {
  return circularSpeedAt(apoapsisAltitude)
    - apoapsisSpeed(periapsisAltitude, apoapsisAltitude);
}

/**
 * Seconds until the vehicle reaches apoapsis, from Kepler's equation.
 *
 * An earlier version divided vertical speed by gravity, which is the answer
 * for a ball thrown straight up and badly wrong for a vehicle near orbital
 * speed: its sideways motion curves its path round the planet and cancels most
 * of gravity. At 7 600 m/s the effective gravity is about 0.4 m/s^2, not 9.2,
 * so the vehicle was really ~250 s from apoapsis while the guidance believed it
 * was 11 s away — and dithered between coasting and burning for minutes.
 *
 * This is the textbook route: orbital elements from the state vector, true
 * anomaly from the current radius, eccentric anomaly, then mean anomaly; the
 * time to apoapsis is the mean anomaly still to sweep to pi, divided by the
 * mean motion. Exact for a Kepler orbit, which is what the vehicle is on
 * whenever the engines are off.
 */
export function timeToApoapsis(input: GuidanceInput): number {
  const elements = elementsFromState({ position: input.position, velocity: input.velocity });
  const { semiMajorAxis: a, eccentricity: e, radius: r } = elements;
  // Open trajectories have no apoapsis; near-circular ones are always at it.
  if (!(a > 0) || e >= 1) return Infinity;
  if (e < 1e-6) return 0;
  // Already past the top of the arc: apoapsis is behind, not ahead.
  if (dot(input.position, input.velocity) <= 0) return 0;

  const cosNu = Math.max(-1, Math.min(1, ((a * (1 - e * e)) / r - 1) / e));
  const nu = Math.acos(cosNu); // 0..pi on the climbing half of the orbit
  const eccentricAnomaly = 2 * Math.atan(Math.sqrt((1 - e) / (1 + e)) * Math.tan(nu / 2));
  const meanAnomaly = eccentricAnomaly - e * Math.sin(eccentricAnomaly);
  const meanMotion = Math.sqrt(MU_EARTH / (a * a * a));
  return Math.max(0, (Math.PI - meanAnomaly) / meanMotion);
}

/**
 * Flight path angle: where the vehicle is actually going, as opposed to where
 * it is pointing. Holding the nose here means thrusting along the velocity,
 * which is the cheapest place to put it.
 */
export function flightPathAngle(input: GuidanceInput): number {
  return Math.atan2(input.verticalSpeed, Math.max(1, input.horizontalSpeed));
}

/**
 * Work out what the vehicle should be doing right now.
 *
 * Pure: state in, commands out. The HUD's guidance cue and any autopilot read
 * the same function, so what the player is told and what an autopilot would do
 * cannot drift apart.
 */
export function guide(input: GuidanceInput, targetAltitude: number): GuidanceState {
  const apoapsis = input.apoapsis ?? 0;
  const periapsis = input.periapsis ?? Number.NEGATIVE_INFINITY;

  // Already there.
  if (periapsis >= targetAltitude * 0.92 && apoapsis >= targetAltitude * 0.92) {
    return {
      phase: 'orbit',
      pitch: flightPathAngle(input),
      throttle: 0,
      instruction: 'Orbit achieved. Engines off.',
    };
  }

  // Straight up until clear of the thickest air.
  if (input.altitude < TURN_START_ALTITUDE) {
    return {
      phase: 'vertical',
      pitch: Math.PI / 2,
      throttle: 1,
      instruction: 'Climb vertically to clear the dense air.',
    };
  }

  // Apoapsis is high enough: stop burning and coast up to it. Burning on is
  // the mistake that strands a vehicle with a full-looking tank.
  //
  // The tolerance matters. Closed-loop steering settles slightly *below* the
  // target — it is correcting toward it, not overshooting — so an exact
  // comparison never fires and the vehicle burns on through the top of its
  // own arc, sinking while it does. Accept anything within 5%.
  // Also cut once periapsis itself is up: at that point the vehicle is in a
  // stable orbit and every further second of thrust only raises apoapsis,
  // which is what turned a 169 x 180 km target into 169 x 1 897 km.
  if (periapsis >= targetAltitude * 0.9) {
    return {
      phase: 'orbit',
      pitch: flightPathAngle(input),
      throttle: 0,
      instruction: 'Periapsis is up. Engines off — you are in orbit.',
    };
  }

  if (apoapsis >= targetAltitude * 0.95 || input.circularising) {
    const seconds = timeToApoapsis(input);
    const needed = circularisationDeltaV(Math.max(0, periapsis), apoapsis);

    // Start a little before apoapsis so the finite burn straddles the top,
    // which is how it best approximates the instantaneous manoeuvre the maths
    // assumes. Once started, keep going: the guard against flicking back to a
    // coast is the `circularising` flag, not a threshold.
    if (input.circularising || seconds < CIRCULARISE_LEAD || input.verticalSpeed <= 0) {
      return {
        phase: 'circularise',
        // Hold vertical speed near zero, so the thrust goes into horizontal
        // speed — which raises periapsis — rather than lifting apoapsis.
        pitch: Math.max(-0.15, Math.min(0.3, -input.verticalSpeed / 400)),
        throttle: 1,
        instruction: `Circularise: about ${needed.toFixed(0)} m/s to raise periapsis.`,
      };
    }

    return {
      phase: 'coast',
      // Nose on prograde so the vehicle is not held across the airflow if it
      // is still low enough for that to matter.
      pitch: flightPathAngle(input),
      throttle: 0,
      instruction: `Coast to apoapsis — about ${Math.round(seconds)} seconds.`,
    };
  }

  // The gravity turn itself.
  //
  // An open-loop pitch schedule cannot work for every vehicle: a heavy stack
  // and a light one need different profiles, and a fixed ramp that suits one
  // flies the other into the ground or into a 4 000 km apoapsis. The schedule
  // is therefore a *baseline* that is corrected against the thing actually
  // being steered — apoapsis. If apoapsis is lagging the target the nose comes
  // up; if it is running ahead the nose drops and the energy goes sideways
  // instead. This is closed-loop guidance, and it is why real vehicles do not
  // fly a stored pitch table.
  const throttle = input.dynamicPressure > MAX_Q_THROTTLE_THRESHOLD
    ? MAX_Q_THROTTLE
    : 1;

  // The pitch schedule is driven by how much of orbital speed the vehicle has
  // built, not by its altitude and not by apoapsis.
  //
  // Apoapsis is the wrong variable to steer on. Early in the flight it always
  // lags the target, so correcting on it pitches the nose up and the vehicle
  // climbs almost vertically — it arrives at 171 km with 1 400 m/s of
  // horizontal speed and no way to make up the other 6 400. Orbit is speed;
  // altitude is a by-product. Steering on the fraction of orbital speed
  // achieved pitches over exactly as fast as the vehicle can afford.
  // Steering on speed alone deadlocks: the vehicle will not pitch over until
  // it is fast, and it cannot get fast without pitching over, so it flies
  // straight up at 84 degrees and coasts to apoapsis ballistically. The
  // schedule must therefore pitch over on its own, with speed as a correction
  // rather than as the driver.
  //
  // Altitude is the independent variable, as it is in a published pitch
  // programme, and the ramp is tuned so the vehicle is near-horizontal by the
  // time the air no longer matters.
  const baseline = turnPitch(input.altitude);

  // Correction: if horizontal speed is lagging what this altitude implies,
  // lower the nose to put more thrust into it. Bounded tightly so it trims the
  // schedule rather than replacing it.
  const orbitalSpeed = circularSpeedAt(targetAltitude);
  const expectedFraction = Math.min(1, input.altitude / TURN_END_ALTITUDE);
  const actualFraction = input.horizontalSpeed / orbitalSpeed;
  const lag = expectedFraction - actualFraction;
  const correction = Math.max(-0.25, Math.min(0.25, -lag * 0.5));
  let pitch = baseline + correction;

  // No altitude floor. An earlier version held the nose up below 40 km to stop
  // the vehicle pitching into the ground; what it actually did was prevent the
  // turn from ever starting, so the vehicle passed 40 km with 221 m/s of
  // horizontal speed and coasted to apoapsis almost ballistically. The speed
  // loop already keeps the nose high when speed is low, because that is the
  // same condition.

  // Apoapsis sets a floor, not the schedule.
  //
  // Going flat at 86 km with apoapsis at 99 km means the vehicle stops
  // climbing before the arc it is on reaches orbit altitude, so it sinks back
  // into the atmosphere while burning. Hold a few degrees of nose-up until
  // apoapsis is within reach of the target; the floor fades out as it gets
  // there, so the vehicle is flying level by the time it matters.
  const apoapsisShortfall = (targetAltitude - apoapsis) / targetAltitude;
  if (apoapsisShortfall > 0) {
    // Up to 20 degrees when apoapsis is far short, nothing when it is there.
    pitch = Math.max(pitch, Math.min(0.35, apoapsisShortfall * 0.6));
  } else {
    // Apoapsis is already past the target, so nose *below* the horizon. This
    // is the manoeuvre that stops a vehicle flinging itself into a 2 000 km
    // ellipse: thrust slightly downward holds apoapsis steady while horizontal
    // speed keeps building, which is what raises periapsis to meet it.
    pitch = Math.min(pitch, Math.max(-0.12, apoapsisShortfall * 0.5));
  }

  // A little below the horizon is allowed once apoapsis is high enough; far
  // below is not, because it drives the vehicle back into the atmosphere.
  pitch = Math.max(-0.15, Math.min(Math.PI / 2, pitch));

  return {
    phase: 'gravity-turn',
    pitch,
    throttle,
    instruction: throttle < 1
      ? 'Throttle back through maximum dynamic pressure.'
      : 'Pitch over: trade climb for horizontal speed.',
  };
}

/** Build a guidance input from the pieces the flight model already produces. */
export function guidanceInput(
  altitude: number,
  apoapsis: number | null,
  periapsis: number | null,
  verticalSpeed: number,
  horizontalSpeed: number,
  dynamicPressure: number,
  position: Vec3,
  velocity: Vec3,
  circularising = false,
): GuidanceInput {
  return {
    altitude, apoapsis, periapsis, verticalSpeed, horizontalSpeed,
    dynamicPressure, position, velocity, circularising,
  };
}
