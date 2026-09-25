/**
 * Physical constants. SI units throughout — metres, seconds, kilograms, newtons.
 *
 * Never introduce kilometres into this codebase. Every altitude, radius and
 * distance is in metres; divide by 1000 only at the moment you render text.
 */

/** Standard gravity, used by the rocket equation. Exact by definition. */
export const G0 = 9.80665;

/** Earth gravitational parameter GM. IAU 2015 / WGS-84. m^3/s^2 */
export const MU_EARTH = 3.986004418e14;

/** Earth mean equatorial radius. m */
export const R_EARTH = 6.371e6;

/** Moon gravitational parameter GM. m^3/s^2 */
export const MU_MOON = 4.9048695e12;

/** Moon mean radius. m */
export const R_MOON = 1.7374e6;

/** Earth–Moon mean semi-major axis. m */
export const MOON_ORBIT_RADIUS = 3.84399e8;

/** Radius of the Moon's sphere of influence. m */
export const MOON_SOI = 6.6183e7;

/** Sea-level atmospheric density, US Standard Atmosphere 1976. kg/m^3 */
export const RHO_SEA_LEVEL = 1.225;

/**
 * Two-layer atmospheric scale heights. m
 *
 * A single scale height overestimates density roughly 3.4x at 52 km, which puts
 * max-Q at entirely the wrong altitude. Splitting at the tropopause tracks the
 * US Standard Atmosphere to within about 10% up to 32 km — accurate enough for
 * ascent, and the error above that is where the air no longer matters.
 */
export const SCALE_HEIGHT_TROPO = 8500;
export const SCALE_HEIGHT_STRATO = 6300;
export const TROPOPAUSE = 11000;

/** Altitude above which drag is negligible. m */
export const ATMOSPHERE_TOP = 140000;

/** The Karman line, conventional boundary of space. m */
export const KARMAN_LINE = 100000;

/** Solar constant at 1 AU. W/m^2 */
export const SOLAR_CONSTANT = 1361;

/** Astronomical unit. m */
export const AU = 1.495978707e11;
