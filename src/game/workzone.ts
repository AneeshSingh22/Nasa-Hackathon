/**
 * The work zone: the painted circle on the VAB floor around the assembly
 * stand.
 *
 * Assembly is only possible while the player is standing in it. Without this,
 * `E` worked from anywhere in the building — which made the first-person view
 * decorative rather than part of the game.
 *
 * The radius matches the yellow safety ring in `VABScene`, so the rule the
 * player is subject to is the one painted on the floor in front of them.
 */

/** Matches the painted ring's outer radius in VABScene. Metres. */
export const WORK_ZONE_RADIUS = 8.0;

/**
 * Distance from the stand at which the prompt starts fading in.
 *
 * Set beyond the player's spawn distance of 14 m on purpose: the prompt has to
 * be at least faintly visible from where the player first stands, or the
 * opening move of the game is invisible.
 */
export const WORK_ZONE_HINT_RADIUS = 19.0;

export interface Point2D {
  x: number;
  z: number;
}

/** The assembly stand sits at the origin of the bay floor. */
export const STAND_POSITION: Point2D = { x: 0, z: 0 };

/** Horizontal distance from a position to the stand, ignoring height. */
export function distanceToStand(position: Point2D): number {
  const dx = position.x - STAND_POSITION.x;
  const dz = position.z - STAND_POSITION.z;
  return Math.hypot(dx, dz);
}

/** True when the player is close enough to work on the vehicle. */
export function isInWorkZone(position: Point2D): boolean {
  return distanceToStand(position) <= WORK_ZONE_RADIUS;
}

/** True when the player is close enough to be shown the prompt at all. */
export function isNearWorkZone(position: Point2D): boolean {
  return distanceToStand(position) <= WORK_ZONE_HINT_RADIUS;
}

/**
 * How visible the prompt should be, 0 to 1.
 *
 * Fades in as the player approaches so the control reveals itself through
 * movement rather than through a tutorial line.
 */
export function promptOpacity(position: Point2D): number {
  const d = distanceToStand(position);
  if (d <= WORK_ZONE_RADIUS) return 1;
  if (d >= WORK_ZONE_HINT_RADIUS) return 0;
  const t = (WORK_ZONE_HINT_RADIUS - d) / (WORK_ZONE_HINT_RADIUS - WORK_ZONE_RADIUS);
  return t;
}
