import {
  RHO_SEA_LEVEL,
  SCALE_HEIGHT_TROPO,
  SCALE_HEIGHT_STRATO,
  TROPOPAUSE,
  ATMOSPHERE_TOP,
} from './constants';

/**
 * Air density at a given altitude above sea level, using a two-layer
 * exponential model.
 *
 * @param altitude metres above sea level
 * @returns density in kg/m^3
 */
export function density(altitude: number): number {
  if (altitude <= 0) return RHO_SEA_LEVEL;
  if (altitude >= ATMOSPHERE_TOP) return 0;

  if (altitude < TROPOPAUSE) {
    return RHO_SEA_LEVEL * Math.exp(-altitude / SCALE_HEIGHT_TROPO);
  }

  const atTropopause = RHO_SEA_LEVEL * Math.exp(-TROPOPAUSE / SCALE_HEIGHT_TROPO);
  return atTropopause * Math.exp(-(altitude - TROPOPAUSE) / SCALE_HEIGHT_STRATO);
}

/**
 * Dynamic pressure — the aerodynamic load on the vehicle.
 *
 * This is the number that produces max-Q as a genuinely emergent event rather
 * than a scripted warning: density falls as you climb while speed rises, so the
 * product peaks somewhere around 7-13 km depending on how you fly.
 *
 * @param altitude metres above sea level
 * @param speed metres per second
 * @returns dynamic pressure in pascals
 */
export function dynamicPressure(altitude: number, speed: number): number {
  return 0.5 * density(altitude) * speed * speed;
}

/**
 * Drag acceleration magnitude.
 *
 * @param altitude metres
 * @param speed m/s
 * @param dragArea the product Cd * A, in m^2
 * @param mass kg
 * @returns acceleration in m/s^2, always positive (apply opposite to velocity)
 */
export function dragAcceleration(
  altitude: number,
  speed: number,
  dragArea: number,
  mass: number,
): number {
  return (dynamicPressure(altitude, speed) * dragArea) / mass;
}

/** Speed of sound, for the Mach readout the HUD shows during ascent. m/s */
export function speedOfSound(altitude: number): number {
  // Piecewise-linear fit to the US Standard Atmosphere temperature profile.
  // Good enough for a Mach number on a gauge.
  const tempK =
    altitude < TROPOPAUSE
      ? 288.15 - 0.0065 * altitude
      : Math.max(216.65, 216.65 + 0.001 * (altitude - 20000));
  return Math.sqrt(1.4 * 287.05 * tempK);
}
