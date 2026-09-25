import { MU_EARTH, R_EARTH } from './constants';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Position and velocity in an inertial frame centred on the primary body. */
export interface StateVector {
  position: Vec3;
  velocity: Vec3;
}

/** Classical orbital elements, as far as a 3-DOF sim needs them. */
export interface OrbitalElements {
  /** Semi-major axis, m. Negative for hyperbolic trajectories. */
  semiMajorAxis: number;
  eccentricity: number;
  /** Apoapsis radius from body centre, m. Infinity if not a closed orbit. */
  apoapsis: number;
  /** Periapsis radius from body centre, m. */
  periapsis: number;
  /** Orbital period, s. Infinity if not closed. */
  period: number;
  /** Current radius from body centre, m. */
  radius: number;
  /** Current speed, m/s. */
  speed: number;
  /** Specific orbital energy, J/kg. */
  energy: number;
}

export const vec = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const magnitude = (v: Vec3): number => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
export const add = (a: Vec3, b: Vec3): Vec3 => vec(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: Vec3, b: Vec3): Vec3 => vec(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (v: Vec3, s: number): Vec3 => vec(v.x * s, v.y * s, v.z * s);
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 =>
  vec(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);

export function normalize(v: Vec3): Vec3 {
  const m = magnitude(v);
  return m > 0 ? scale(v, 1 / m) : vec();
}

/**
 * Solve the orbital elements from a state vector, via the vis-viva equation
 * and the specific angular momentum.
 *
 * Everything the HUD shows — apoapsis, periapsis, period — comes from here,
 * so these numbers are derived from the physics rather than tracked separately
 * and allowed to drift out of agreement with it.
 */
export function elementsFromState(state: StateVector, mu = MU_EARTH): OrbitalElements {
  const r = magnitude(state.position);
  const v = magnitude(state.velocity);

  // Specific orbital energy: kinetic plus potential, per unit mass.
  const energy = (v * v) / 2 - mu / r;
  const semiMajorAxis = -mu / (2 * energy);

  // Specific angular momentum h = r x v
  const h = cross(state.position, state.velocity);
  const hMag = magnitude(h);

  // e^2 = 1 + 2*energy*h^2 / mu^2
  const eSquared = 1 + (2 * energy * hMag * hMag) / (mu * mu);
  const eccentricity = Math.sqrt(Math.max(0, eSquared));

  const closed = energy < 0 && eccentricity < 1;

  return {
    semiMajorAxis,
    eccentricity,
    apoapsis: closed ? semiMajorAxis * (1 + eccentricity) : Infinity,
    periapsis: semiMajorAxis * (1 - eccentricity),
    period: closed ? 2 * Math.PI * Math.sqrt(semiMajorAxis ** 3 / mu) : Infinity,
    radius: r,
    speed: v,
    energy,
  };
}

/**
 * Eccentricity vector. Points from the focus toward periapsis, which is what
 * lets the map view draw the orbit in the right orientation.
 */
export function eccentricityVector(state: StateVector, mu = MU_EARTH): Vec3 {
  const r = magnitude(state.position);
  const v = magnitude(state.velocity);
  const rv = dot(state.position, state.velocity);
  const a = scale(state.position, (v * v - mu / r) / mu);
  const b = scale(state.velocity, rv / mu);
  return sub(a, b);
}

/** Circular orbital speed at a given radius. m/s */
export function circularSpeed(radius: number, mu = MU_EARTH): number {
  return Math.sqrt(mu / radius);
}

/** Speed at a given radius on an orbit of known semi-major axis (vis-viva). */
export function visViva(radius: number, semiMajorAxis: number, mu = MU_EARTH): number {
  return Math.sqrt(mu * (2 / radius - 1 / semiMajorAxis));
}

/** Local gravitational acceleration at a radius from the body centre. m/s^2 */
export function gravity(radius: number, mu = MU_EARTH): number {
  return mu / (radius * radius);
}

/** Altitude above the surface, given a radius from body centre. */
export function altitudeOf(radius: number, bodyRadius = R_EARTH): number {
  return radius - bodyRadius;
}

/**
 * Two-burn Hohmann transfer between circular orbits.
 * @returns the two burn magnitudes and the total, all m/s
 */
export function hohmannTransfer(
  r1: number,
  r2: number,
  mu = MU_EARTH,
): { first: number; second: number; total: number; transferTime: number } {
  const aTransfer = (r1 + r2) / 2;
  const first = Math.sqrt(mu / r1) * (Math.sqrt((2 * r2) / (r1 + r2)) - 1);
  const second = Math.sqrt(mu / r2) * (1 - Math.sqrt((2 * r1) / (r1 + r2)));
  return {
    first,
    second,
    total: Math.abs(first) + Math.abs(second),
    transferTime: Math.PI * Math.sqrt(aTransfer ** 3 / mu),
  };
}

/**
 * Propagate a state vector under point-mass gravity using fourth-order
 * Runge-Kutta.
 *
 * Used for unpowered coast. Powered flight integrates in smaller sub-steps
 * instead, because thrust, mass and drag all change continuously during a burn
 * and RK4's mid-step evaluations would need those re-derived anyway.
 */
export function propagate(state: StateVector, dt: number, mu = MU_EARTH): StateVector {
  const acceleration = (p: Vec3): Vec3 => {
    const r = magnitude(p);
    const k = -mu / (r * r * r);
    return scale(p, k);
  };

  type Deriv = { dp: Vec3; dv: Vec3 };
  const derive = (p: Vec3, v: Vec3): Deriv => ({ dp: v, dv: acceleration(p) });

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

  const weight = (a: Vec3, b: Vec3, c: Vec3, d: Vec3): Vec3 =>
    scale(
      add(add(a, scale(b, 2)), add(scale(c, 2), d)),
      dt / 6,
    );

  return {
    position: add(state.position, weight(k1.dp, k2.dp, k3.dp, k4.dp)),
    velocity: add(state.velocity, weight(k1.dv, k2.dv, k3.dv, k4.dv)),
  };
}
