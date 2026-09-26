import { PART_LIBRARY, type PartDefinition, type PartKind } from '../vab/parts';

/**
 * The Workshop builds from the real part library, not from stubs.
 *
 * Phase 3 shipped three invented parts — one tank, one engine, one pod — so
 * every build was identical and there was nothing to get wrong. The library in
 * `vab/parts.ts` already holds nine parts with genuine trade-offs: a cheap
 * solid booster with poor specific impulse, a stretched core that buys delta-v
 * but barely leaves the pad, and four payloads from a 3 t comsat to a 14 t
 * laboratory that costs most of the budget. Those are the decisions the phase
 * exists to create, so the Workshop issues them directly.
 *
 * The axial graph from Phase 3 is unchanged. Only the catalogue is real.
 */

/** Build order, top to bottom. The stack hangs downward from the pod. */
export const BUILD_ORDER: readonly PartKind[] = ['booster', 'upper', 'payload', 'fairing'];

/** Human heading for each slot, shown on the palette. */
export const SLOT_LABELS: Readonly<Record<PartKind, string>> = {
  booster: 'First stage',
  upper: 'Second stage',
  payload: 'Payload',
  fairing: 'Fairing',
};

/** Every option for a slot, in library order. */
export function optionsFor(kind: PartKind): readonly PartDefinition[] {
  return PART_LIBRARY.filter(part => part.kind === kind);
}

/** Look a part up by id. */
export function partById(id: string): PartDefinition | null {
  return PART_LIBRARY.find(part => part.id === id) ?? null;
}

/**
 * Which slot a part occupies in the stack, or -1 if it is not a stack part.
 * The fairing is structure and sits at the top, but it is still fitted last.
 */
export function slotIndex(kind: PartKind): number {
  return BUILD_ORDER.indexOf(kind);
}

/** The slot that comes next given what is already fitted. */
export function nextSlot(fitted: readonly PartKind[]): PartKind | null {
  return BUILD_ORDER.find(kind => !fitted.includes(kind)) ?? null;
}
