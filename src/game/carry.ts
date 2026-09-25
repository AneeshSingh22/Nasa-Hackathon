/**
 * Carrying a part from its station to the stand.
 *
 * The step that makes assembly a physical act rather than a menu selection.
 * The player picks a component off a bench, walks it across the floor — slower,
 * because it is heavy — and places it on the stack.
 *
 * Heavy parts slow you down in proportion to their mass, which is the rocket
 * equation's lesson delivered through the legs rather than through a readout.
 */

export interface CarriedPart {
  partId: string;
  /** Mass in kilograms, for the speed penalty and the HUD. */
  mass: number;
  /** Where it came from, so it can be put back. */
  stationId: string;
}

/** Mass above which a part cannot be carried by hand at all. kg */
export const CRANE_THRESHOLD = 20_000;

/**
 * Walking speed multiplier while carrying.
 *
 * A three-tonne relay is awkward; a fourteen-tonne laboratory is a crane job.
 * The curve is deliberately generous — this is flavour and feedback, not a
 * stamina system to fight.
 */
export function carrySpeedFactor(mass: number): number {
  if (mass <= 0) return 1;
  // 3 t -> 0.88, 8 t -> 0.72, 14 t -> 0.58
  const factor = 1 - (mass / 1000) * 0.03;
  return Math.max(0.5, Math.min(1, factor));
}

/** Parts above the crane threshold ride a gantry crane rather than the player. */
export function needsCrane(mass: number): boolean {
  return mass >= CRANE_THRESHOLD;
}
