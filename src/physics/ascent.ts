import { G0, MU_EARTH, R_EARTH } from './constants';
import { density, dynamicPressure, speedOfSound } from './atmosphere';
import { magnitude, normalize, scale, add, sub, dot, vec, type Vec3 } from './orbit';
import { massFlowRate, type Stage, type Vehicle } from './rocket';

/**
 * Powered flight: the integrator that turns a design into a trajectory.
 *
 * `orbit.ts` propagates a body under gravity alone, which is correct once the
 * engines are off but useless during an ascent, where thrust and drag dominate
 * and the vehicle's mass changes every second. This module adds those forces
 * and the bookkeeping that goes with them — propellant burn, staging, and the
 * atmosphere's effect on both thrust and specific impulse.
 *
 * Pure: numbers in, numbers out. No Three.js, no DOM. That is what lets the
 * ascent be verified headlessly before anything is drawn.
 *
 * ## Why the ascent is not simply "point up"
 *
 * Orbit is sideways speed, not height. A vehicle that flies straight up and
 * stops has spent everything fighting gravity and falls back down. The player
 * has to pitch over and trade vertical climb for horizontal speed — early
 * enough that the atmosphere is still thin when they are going fast, late
 * enough that they clear the dense air before the dynamic pressure tears the
 * vehicle apart. That tension is the lesson the flight phase teaches, and it
 * emerges from these equations rather than being scripted.
 */

/** Rotational speed of Earth's surface at the equator. m/s */
export const EARTH_ROTATION_SPEED = 465.1;

/** Live flight state. SI throughout: metres, m/s, kilograms, seconds. */
export interface FlightState {
  /** Position from the centre of the Earth. m */
  readonly position: Vec3;
  /** Velocity in the inertial frame. m/s */
  readonly velocity: Vec3;
  /** Index into `vehicle.stages`; counts up as stages are jettisoned. */
  readonly stage: number;
  /** Propellant remaining in the current stage. kg */
  readonly propellant: number;
  /** 0..1. Clamped to the stage's minimum when the engine is lit. */
  readonly throttle: number;
  /** Where the nose points, as a unit vector. */
  readonly attitude: Vec3;
  /** Seconds since launch. */
  readonly time: number;
  /** Whether the fairing has been jettisoned. */
  readonly fairingAttached: boolean;
}

/** Everything derived from a state that the HUD or the game logic needs. */
export interface FlightTelemetry {
  /** Height above mean sea level. m */
  readonly altitude: number;
  /** Speed in the inertial frame. m/s */
  readonly speed: number;
  /** Speed relative to the rotating surface — what an airframe feels. m/s */
  readonly airspeed: number;
  /** Climb rate, positive up. m/s */
  readonly verticalSpeed: number;
  /** Horizontal speed: the component that actually buys orbit. m/s */
  readonly horizontalSpeed: number;
  /** Dynamic pressure. Pa */
  readonly dynamicPressure: number;
  /** Mach number against the local speed of sound. */
  readonly mach: number;
  /** Current total mass. kg */
  readonly mass: number;
  /** Thrust at this altitude and throttle. N */
  readonly thrust: number;
  /** Thrust-to-weight against local gravity. */
  readonly twr: number;
  /** Apoapsis altitude of the current orbit, or null on a suborbital arc. m */
  readonly apoapsis: number | null;
  /** Periapsis altitude. Negative means the trajectory intersects the ground. */
  readonly periapsis: number | null;
  /** Angle of the nose above the local horizon. radians */
  readonly pitch: number;
  /** Angle between the nose and the velocity vector. radians */
  readonly angleOfAttack: number;
  /** Delta-v left in the current stage. m/s */
  readonly stageDeltaV: number;
  /** Seconds of burn left in the current stage at this throttle. */
  readonly burnTimeRemaining: number;
}

/** What ended the flight, if anything has. */
export type FlightOutcome =
  | { readonly kind: 'flying' }
  | { readonly kind: 'orbit'; readonly apoapsis: number; readonly periapsis: number }
  | { readonly kind: 'crashed'; readonly speed: number }
  | { readonly kind: 'broke-up'; readonly reason: string; readonly value: number }
  | { readonly kind: 'stranded'; readonly apoapsis: number };

/**
 * Structural limits.
 *
 * Tuned for play rather than taken from a datasheet, but anchored to real
 * numbers: Falcon 9 passes through roughly 30 kPa at max-Q, and launch
 * vehicles are generally designed to survive somewhat more than they expect to
 * see. 55 kPa gives a player room to fly a sloppy ascent and still survive,
 * while a genuinely reckless one — full throttle, nose up, through the dense
 * air — breaks the vehicle.
 */
export const MAX_DYNAMIC_PRESSURE = 55_000;

/**
 * Aerodynamic limit on angle of attack.
 *
 * A launch vehicle is a tube. Pointing it far off its velocity vector in dense
 * air produces side loads it was never built for, which is why real ascents fly
 * a gravity turn and keep angle of attack near zero through max-Q. The limit
 * only bites where there is enough air to matter.
 */
export const MAX_ANGLE_OF_ATTACK = 0.35;
/** Below this dynamic pressure the air is too thin for attitude to break anything. */
export const AERO_STRESS_THRESHOLD = 8_000;

/**
 * The altitude a stable orbit must clear. m
 *
 * 160 km, the conventional minimum for an orbit that will not decay within an
 * orbit or two. It was 200 km, which left the vehicle with essentially no
 * margin: headless simulation showed a 2% change in vacuum thrust, or 2.5% in
 * sea-level specific impulse, flipping a successful ascent to a stranded one.
 * A player flying by hand is far more than 2% off an optimal profile, so the
 * phase was close to unwinnable. Dropping the bar by 40 km costs roughly
 * 1 200 m/s and leaves room for an imperfect but competent flight.
 */
export const MIN_ORBIT_ALTITUDE = 160_000;

/**
 * Thrust at a given altitude.
 *
 * A nozzle is tuned for one ambient pressure. At sea level the atmosphere
 * pushes back on the exhaust and the engine produces less thrust; in vacuum it
 * reaches its full figure. Interpolating on air density is a simplification of
 * the pressure term, but it has the right shape and the right endpoints, and it
 * gives the player the real experience of an engine growing stronger as it
 * climbs.
 */
export function thrustAt(stage: Stage, altitude: number, throttle: number): number {
  const pressureRatio = Math.min(1, density(altitude) / density(0));
  const thrust = stage.thrustVacuum
    + (stage.thrustSeaLevel - stage.thrustVacuum) * pressureRatio;
  return thrust * throttle;
}

/** Specific impulse at a given altitude, interpolated the same way. */
export function ispAt(stage: Stage, altitude: number): number {
  const pressureRatio = Math.min(1, density(altitude) / density(0));
  return stage.ispVacuum + (stage.ispSeaLevel - stage.ispVacuum) * pressureRatio;
}

/** Mass of the vehicle in its current state: remaining stages plus payload. */
export function currentMass(vehicle: Vehicle, state: FlightState): number {
  let mass = vehicle.payloadMass;
  for (let i = state.stage; i < vehicle.stages.length; i++) {
    const stage = vehicle.stages[i];
    if (!stage) continue;
    mass += stage.dryMass;
    // Only the burning stage has partial propellant; those above are full.
    mass += i === state.stage ? state.propellant : stage.propellantMass;
  }
  return mass;
}

/** A vehicle sitting on the pad, pointing up, full of propellant. */
export function initialState(vehicle: Vehicle, latitude = 0): FlightState {
  const first = vehicle.stages[0];
  // The pad sits on the surface, and the planet carries it eastward. Launching
  // with that rotation is free delta-v, which is why real launch sites are as
  // close to the equator as geography allows.
  return {
    position: vec(R_EARTH, 0, 0),
    velocity: vec(0, 0, EARTH_ROTATION_SPEED * Math.cos(latitude)),
    stage: 0,
    propellant: first?.propellantMass ?? 0,
    throttle: 0,
    attitude: vec(1, 0, 0),
    time: 0,
    fairingAttached: true,
  };
}

/**
 * Total acceleration on the vehicle: gravity, thrust and drag.
 *
 * Separated from the integrator so the same force model is used at every RK4
 * sub-step rather than only at the start of the interval.
 */
function acceleration(
  vehicle: Vehicle,
  state: FlightState,
  position: Vec3,
  velocity: Vec3,
  mass: number,
): Vec3 {
  const radius = magnitude(position);
  const altitude = radius - R_EARTH;

  // Gravity, always toward the centre.
  const gravityMagnitude = MU_EARTH / (radius * radius);
  let total = scale(normalize(position), -gravityMagnitude);

  // Thrust along the nose, if the engine is lit and has propellant.
  const stage = vehicle.stages[state.stage];
  if (stage && state.propellant > 0 && state.throttle > 0) {
    const thrust = thrustAt(stage, altitude, state.throttle);
    total = add(total, scale(state.attitude, thrust / mass));
  }

  // Drag opposes motion through the air, so it uses the velocity relative to
  // the rotating atmosphere rather than the inertial velocity. Ignoring that
  // would show 465 m/s of drag sitting on the pad.
  const airVelocity = sub(velocity, atmosphereVelocity(position));
  const airspeed = magnitude(airVelocity);
  if (airspeed > 0.01 && altitude < 140_000) {
    const area = dragAreaOf(vehicle, state);
    const dragForce = dynamicPressure(altitude, airspeed) * area;
    total = add(total, scale(normalize(airVelocity), -dragForce / mass));
  }

  return total;
}

/** Velocity of the atmosphere at a point, from the planet's rotation. */
export function atmosphereVelocity(position: Vec3): Vec3 {
  // Rotation about +Y, so the surface velocity is omega cross r.
  const omega = EARTH_ROTATION_SPEED / R_EARTH;
  return vec(-omega * position.z, 0, omega * position.x);
}

/** Drag area, reduced once the fairing is gone. */
function dragAreaOf(vehicle: Vehicle, state: FlightState): number {
  const stage = vehicle.stages[state.stage];
  const base = stage?.dragArea ?? 10;
  // The fairing is the widest part of the stack; dropping it is a real
  // reduction in drag as well as in mass.
  return state.fairingAttached ? base : base * 0.72;
}

/**
 * Advance the flight by `dt` seconds.
 *
 * RK4 on position and velocity, with propellant burned at the mass flow the
 * current throttle and altitude imply. Mass is held constant across the
 * sub-steps, which is accurate at the step sizes a game uses and avoids
 * integrating a varying mass inside the integrator.
 */
export function step(vehicle: Vehicle, state: FlightState, dt: number): FlightState {
  const mass = currentMass(vehicle, state);
  const stage = vehicle.stages[state.stage];

  // Propellant burned this step, limited by what is left.
  let propellant = state.propellant;
  let throttle = state.throttle;
  if (stage && propellant > 0 && throttle > 0) {
    const altitude = magnitude(state.position) - R_EARTH;
    const flow = massFlowRate(thrustAt(stage, altitude, throttle), ispAt(stage, altitude));
    propellant = Math.max(0, propellant - flow * dt);
  } else if (propellant <= 0) {
    // A dry stage produces no thrust whatever the lever says.
    throttle = 0;
  }

  const derive = (position: Vec3, velocity: Vec3) => ({
    dp: velocity,
    dv: acceleration(vehicle, state, position, velocity, mass),
  });

  const k1 = derive(state.position, state.velocity);
  const k2 = derive(
    add(state.position, scale(k1.dp, dt / 2)),
    add(state.velocity, scale(k1.dv, dt / 2)),
  );
  const k3 = derive(
    add(state.position, scale(k2.dp, dt / 2)),
    add(state.velocity, scale(k2.dv, dt / 2)),
  );
  const k4 = derive(
    add(state.position, scale(k3.dp, dt)),
    add(state.velocity, scale(k3.dv, dt)),
  );

  const weighted = (a: Vec3, b: Vec3, c: Vec3, d: Vec3) =>
    scale(add(add(a, scale(add(b, c), 2)), d), dt / 6);

  let position = add(state.position, weighted(k1.dp, k2.dp, k3.dp, k4.dp));
  let velocity = add(state.velocity, weighted(k1.dv, k2.dv, k3.dv, k4.dv));

  // The pad holds the vehicle up.
  //
  // Without this the rocket sinks through the ground during the second or two
  // a player spends opening the throttle, because gravity acts and thrust does
  // not yet exceed it. Clamping to the surface while it is still descending is
  // what a launch mount does, and it lets the vehicle sit there until it is
  // ready to fly rather than failing before the player has touched anything.
  const radius = magnitude(position);
  if (radius < R_EARTH) {
    const up = normalize(position);
    position = scale(up, R_EARTH);
    const closing = dot(velocity, up);
    // Cancel only the downward component, so a vehicle that is climbing keeps
    // its speed and one that is resting simply stays put.
    if (closing < 0) velocity = sub(velocity, scale(up, closing));
  }

  return {
    ...state,
    position,
    velocity,
    propellant,
    throttle,
    time: state.time + dt,
  };
}

/** Jettison the spent stage. Returns the state unchanged if there is no next stage. */
export function stageOff(vehicle: Vehicle, state: FlightState): FlightState {
  const next = state.stage + 1;
  if (next >= vehicle.stages.length) return state;
  return {
    ...state,
    stage: next,
    propellant: vehicle.stages[next]?.propellantMass ?? 0,
  };
}

/** Drop the fairing. Mass and drag both fall. */
export function jettisonFairing(state: FlightState): FlightState {
  return { ...state, fairingAttached: false };
}

/** Everything the HUD shows, derived from the state rather than tracked beside it. */
export function telemetry(vehicle: Vehicle, state: FlightState): FlightTelemetry {
  const radius = magnitude(state.position);
  const altitude = radius - R_EARTH;
  const up = normalize(state.position);
  const speed = magnitude(state.velocity);

  const airVelocity = sub(state.velocity, atmosphereVelocity(state.position));
  const airspeed = magnitude(airVelocity);

  const verticalSpeed = dot(state.velocity, up);
  const horizontalSpeed = Math.sqrt(Math.max(0, speed * speed - verticalSpeed * verticalSpeed));

  const mass = currentMass(vehicle, state);
  const stage = vehicle.stages[state.stage];
  const thrust = stage && state.propellant > 0
    ? thrustAt(stage, altitude, state.throttle)
    : 0;
  const localGravity = MU_EARTH / (radius * radius);

  // Orbital elements from the current state vector, which is how a real flight
  // computer reports apoapsis: it is a property of the trajectory, not a
  // target the player sets.
  const energy = (speed * speed) / 2 - MU_EARTH / radius;
  const semiMajorAxis = energy < 0 ? -MU_EARTH / (2 * energy) : null;

  let apoapsis: number | null = null;
  let periapsis: number | null = null;
  if (semiMajorAxis !== null) {
    // Eccentricity from the specific angular momentum.
    const h = magnitude(crossProduct(state.position, state.velocity));
    const eSquared = Math.max(0, 1 - (h * h) / (MU_EARTH * semiMajorAxis));
    const e = Math.sqrt(eSquared);
    apoapsis = semiMajorAxis * (1 + e) - R_EARTH;
    periapsis = semiMajorAxis * (1 - e) - R_EARTH;
  }

  const pitch = Math.asin(Math.min(1, Math.max(-1, dot(state.attitude, up))));
  const angleOfAttack = airspeed > 1
    ? Math.acos(Math.min(1, Math.max(-1, dot(state.attitude, normalize(airVelocity)))))
    : 0;

  const stageDryMass = mass - state.propellant;
  const stageDeltaV = stage && state.propellant > 0 && stageDryMass > 0
    ? ispAt(stage, altitude) * G0 * Math.log(mass / stageDryMass)
    : 0;
  const flow = stage && state.throttle > 0
    ? massFlowRate(thrustAt(stage, altitude, state.throttle), ispAt(stage, altitude))
    : 0;

  return {
    altitude,
    speed,
    airspeed,
    verticalSpeed,
    horizontalSpeed,
    dynamicPressure: dynamicPressure(altitude, airspeed),
    mach: airspeed / speedOfSound(altitude),
    mass,
    thrust,
    twr: thrust / (mass * localGravity),
    apoapsis,
    periapsis,
    pitch,
    angleOfAttack,
    stageDeltaV,
    burnTimeRemaining: flow > 0 ? state.propellant / flow : 0,
  };
}

function crossProduct(a: Vec3, b: Vec3): Vec3 {
  return vec(
    a.y * b.z - a.z * b.y,
    a.z * b.x - a.x * b.z,
    a.x * b.y - a.y * b.x,
  );
}

/**
 * Has the flight ended, and how?
 *
 * One function decides, so the HUD warning and the actual failure cannot
 * disagree — the same mistake the work-zone and elevator once made.
 */
export function evaluate(
  vehicle: Vehicle,
  state: FlightState,
  readings = telemetry(vehicle, state),
): FlightOutcome {
  // Structural failure first: it can happen at any altitude.
  if (readings.dynamicPressure > MAX_DYNAMIC_PRESSURE) {
    return { kind: 'broke-up', reason: 'dynamic pressure', value: readings.dynamicPressure };
  }
  if (
    readings.dynamicPressure > AERO_STRESS_THRESHOLD
    && readings.angleOfAttack > MAX_ANGLE_OF_ATTACK
  ) {
    return { kind: 'broke-up', reason: 'angle of attack', value: readings.angleOfAttack };
  }

  // Back on the ground.
  //
  // Sitting on the pad is not a crash. A vehicle whose engines cannot yet lift
  // it simply rests there, which is what happens for the second or two a
  // player spends opening the throttle, and the pad holds it up. Only a vehicle
  // arriving at the ground with real downward speed has crashed.
  if (readings.altitude <= 0 && readings.verticalSpeed < -2 && state.time > 1) {
    return { kind: 'crashed', speed: readings.speed };
  }

  // Orbit: both ends of the ellipse clear of the atmosphere, and high enough
  // for the contract. A periapsis inside the air is a decaying orbit, not an
  // orbit, which is the distinction the phase should teach.
  if (
    readings.apoapsis !== null && readings.periapsis !== null
    && readings.periapsis >= MIN_ORBIT_ALTITUDE
    && readings.apoapsis >= MIN_ORBIT_ALTITUDE
  ) {
    return { kind: 'orbit', apoapsis: readings.apoapsis, periapsis: readings.periapsis };
  }

  // Out of propellant everywhere, still not orbital: the flight is over even
  // though the vehicle is intact, and saying so is kinder than letting the
  // player coast to the ground wondering.
  const anyPropellantLeft = state.propellant > 0
    || state.stage < vehicle.stages.length - 1;
  if (!anyPropellantLeft && readings.verticalSpeed < 0 && readings.altitude < 120_000) {
    return { kind: 'stranded', apoapsis: readings.apoapsis ?? readings.altitude };
  }

  return { kind: 'flying' };
}

/**
 * The pitch a textbook gravity turn would hold at this altitude.
 *
 * Advisory only — the player flies the rocket. It exists so the HUD can show a
 * guide bar, and so `advice.ts` can name the trade-off without naming an answer.
 * Vertical off the pad to clear the dense air, then a smooth tip over to
 * horizontal by the time the atmosphere no longer matters.
 */
export function gravityTurnPitch(altitude: number): number {
  const START = 2_000;
  const END = 120_000;
  if (altitude <= START) return Math.PI / 2;
  if (altitude >= END) return 0;
  const progress = (altitude - START) / (END - START);
  // Pitch over on a gentle power curve rather than a square root. A square-root
  // profile reaches near-horizontal by 30 km, which buys horizontal speed the
  // vehicle cannot hold because apoapsis is still inside the atmosphere — it
  // goes fast sideways and falls back. Verified headlessly: sqrt tops out
  // around 87 km apoapsis, this reaches orbit.
  return (Math.PI / 2) * Math.pow(1 - progress, 1.35);
}
