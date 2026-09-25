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


/**
 * Where each part has to be fitted from.
 *
 * Standing anywhere in the circle is enough for the lower stages, which a
 * crane lifts into place. The payload and fairing go on top of a 55-metre
 * stack, and in a real assembly building that work happens from a platform at
 * that height — so the player has to climb the gantry to finish the vehicle.
 *
 * This is what stops the build being four presses of the same key in the same
 * spot.
 */
export type WorkStation = 'floor' | 'gantry';

/**
 * The gantry platform sits beside the stack, to the +X side.
 *
 * These values must match the geometry VABScene builds: the platforms are
 * centred on x = 7.2 and the ladder runs up x = 10.4, inside the platform
 * footprint so a climber actually arrives on one.
 */
export const GANTRY_X = 7.2;
/** X of the climbable ladder. Must sit within the platform footprint. */
export const LADDER_X = 10.4;
/** Half-depth of the walkable platform. */
export const GANTRY_HALF_DEPTH = 2.2;
/**
 * Height of the platform the payload is fitted from.
 *
 * Matches the topmost platform VABScene builds: 4 + 8 * 5.2 = 45.6 m. The
 * finished stack is 66.7 m tall, so the payload slot sits above this — which
 * is realistic, since a real crane does the lifting and the crew guides it.
 */
export const GANTRY_WORK_HEIGHT = 45.6;
/** How close to the platform's working height counts as being on it. */
export const GANTRY_HEIGHT_TOLERANCE = 3.0;

export interface Point3D extends Point2D {
  y: number;
}

/** Which station a given part kind must be fitted from. */
export function stationFor(kind: string): WorkStation {
  return kind === 'payload' || kind === 'fairing' ? 'gantry' : 'floor';
}

/** True when the player is standing on the high gantry platform. */
/**
 * The height the high work station currently sits at.
 *
 * This was a fixed 45.6 m constant while the elevator stop became derived from
 * the stack top, which varies with the booster. The two disagreed by up to
 * thirteen metres, so the player could ride to the work platform, be standing
 * in exactly the right place, and still be refused — the bug where the only
 * option at the top was to go back down.
 *
 * Whoever moves the platform sets this.
 */
let currentWorkHeight = GANTRY_WORK_HEIGHT;

export function setWorkHeight(height: number): void {
  currentWorkHeight = height;
}

export function getWorkHeight(): number {
  return currentWorkHeight;
}

export function isOnGantry(position: Point3D): boolean {
  // The high work station is the elevator car and its work deck, which reach
  // from the shaft in toward the stack.
  const nearX = position.x >= GANTRY_X - 4.6 && position.x <= 15.0;
  const nearZ = Math.abs(position.z) <= GANTRY_HALF_DEPTH + 0.6;
  const atHeight =
    Math.abs(position.y - currentWorkHeight) <= GANTRY_HEIGHT_TOLERANCE;
  return nearX && nearZ && atHeight;
}

/** How far off the floor still counts as standing on it. Metres. */
export const FLOOR_TOLERANCE = 1.5;

/** True when the player is standing on the bay floor rather than up a gantry. */
export function isOnFloor(position: Point3D): boolean {
  return position.y <= FLOOR_TOLERANCE;
}

/**
 * True when the player can fit a part of this kind from where they stand.
 *
 * Floor work checks height as well as distance. The gantry is only seven
 * metres from the stand horizontally, so without the height test a player on
 * the top platform would satisfy the floor work zone and could fit the core
 * booster from fifty-six metres up.
 */
export function canWorkOn(kind: string, position: Point3D): boolean {
  return stationFor(kind) === 'gantry'
    ? isOnGantry(position)
    : isInWorkZone(position) && isOnFloor(position);
}
