import * as THREE from 'three';
import { PART_LIBRARY, buildPartMesh, type Materials, type PartDefinition } from './parts';
import { MODULAR_PARTS } from '../workshop/modularParts';
import { attachmentAllowed, BUILD_ANCHOR_Y, insertionIndex, type Port } from '../workshop/attachments';
import { modularAnalysis, modularComplete } from '../workshop/modularVehicle';
import { G0 } from '../physics/constants';
import { deltaV } from '../physics/rocket';
import { LEO_DELTA_V_REQUIRED } from '../game/launchRequirements';
export { LEO_DELTA_V_REQUIRED } from '../game/launchRequirements';

/**
 * The assembled stack, and the live engineering readout derived from it.
 *
 * The important design property here: the numbers on the VAB wall come from the
 * same functions the flight simulation uses. There is no separate "display
 * delta-v" that can drift out of agreement with what the rocket actually does.
 */

export interface StackAnalysis {
  liftoffMass: number;
  totalDeltaV: number;
  liftoffTWR: number;
  stageCount: number;
  /** True when the stack can physically leave the pad and reach orbit. */
  canReachOrbit: boolean;
  /** Human-readable verdict for the HUD. */
  verdict: string;
  verdictLevel: 'good' | 'warn' | 'bad';
}


export class Assembly {
  private stack: PartDefinition[] = [];
  private modular = false;
  private instanceSequence = 0;
  private anchorId: string | null = null;
  private meshes = new Map<string, THREE.Group>();
  private root: THREE.Object3D;
  private mats: Materials;

  constructor(root: THREE.Object3D, mats: Materials) {
    this.root = root;
    this.mats = mats;
  }

  get parts(): readonly PartDefinition[] {
    return this.stack;
  }

  /** The meshes of the fitted parts, for code that needs to show or hide them. */
  get meshObjects(): readonly THREE.Object3D[] {
    return [...this.meshes.values()];
  }

  preview(part: PartDefinition): THREE.Group { return buildPartMesh(part, this.mats); }

  get lastInstalled(): PartDefinition | null {
    const id = [...this.meshes.keys()].at(-1);
    return this.stack.find(p => (p.instanceId ?? p.id) === id) ?? null;
  }

  get isModular(): boolean { return this.modular; }
  enableModular(): void { if (!this.stack.length) this.modular = true; }
  meshFor(instanceId: string): THREE.Object3D | undefined { return this.meshes.get(instanceId); }

  attachModular(part: PartDefinition, port: Port): PartDefinition | null {
    if (!this.modular || !attachmentAllowed(this.stack, part, port)) return null;
    const index = insertionIndex(this.stack, port)!;
    const installed: PartDefinition = { ...part, instanceId: `${part.id}:${++this.instanceSequence}`,
      mount: part.kind === 'command' ? 'root' : part.kind === 'payload' ? 'payload' : part.kind === 'fairing' ? 'fairing' : 'lower' };
    if (!this.stack.length) this.anchorId = installed.instanceId!;
    this.stack.splice(index, 0, installed);
    const mesh = buildPartMesh(part, this.mats);
    mesh.userData.assemblyPartId = installed.instanceId;
    this.meshes.set(installed.instanceId!, mesh); this.root.add(mesh);
    this.layoutModular();
    return installed;
  }

  /** Graph queries cannot rely on purchase order now that parts may be added above. */
  dependentIds(instanceId: string): Set<string> {
    const ids = new Set([instanceId]); let grew = true;
    while (grew) {
      grew = false;
      for (const p of this.stack) if (p.parentId && ids.has(p.parentId) && !ids.has(p.instanceId!)) {
        ids.add(p.instanceId!); grew = true;
      }
    }
    return ids;
  }

  /** A sell removes only that object. A subtree return remains available for callers
   * that explicitly want it; remaining parts reconnect and retain their full value. */
  removeModular(instanceId: string, subtree = true): PartDefinition[] {
    const ids = subtree ? this.dependentIds(instanceId) : new Set([instanceId]);
    const removed = this.stack.filter(p => ids.has(p.instanceId ?? ''));
    if (!removed.length) return [];
    const oldIndex = this.stack.findIndex(p => p.instanceId === this.anchorId);
    this.stack = this.stack.filter(p => !ids.has(p.instanceId ?? ''));
    if (ids.has(this.anchorId ?? '')) this.anchorId = this.stack[Math.min(oldIndex, this.stack.length - 1)]?.instanceId ?? null;
    for (const part of removed) {
      const key = part.instanceId!; const mesh = this.meshes.get(key);
      if (mesh) { this.root.remove(mesh); disposeGroup(mesh); this.meshes.delete(key); }
    }
    this.layoutModular();
    return removed;
  }

  private layoutModular(): void {
    const anchor = this.stack.findIndex(p => p.instanceId === this.anchorId);
    if (anchor < 0) return;
    const below = this.stack.slice(anchor + 1).reduce((sum, p) => sum + p.height, 0);
    const above = this.stack.slice(0, anchor + 1).reduce((sum, p) => sum + p.height, 0);
    // Keep any seed suspended, without sending tall engine-first builds into
    // the ceiling or fairing-first builds through the stand.
    const y = THREE.MathUtils.clamp(BUILD_ANCHOR_Y, below + 4, 76 - above);
    this.meshes.get(this.anchorId!)!.position.y = y;
    for (let i = anchor - 1; i >= 0; i--) {
      const part = this.stack[i]!, under = this.stack[i + 1]!;
      this.meshes.get(part.instanceId!)!.position.y = this.meshes.get(under.instanceId!)!.position.y + under.height;
    }
    for (let i = anchor + 1; i < this.stack.length; i++) {
      const part = this.stack[i]!, over = this.stack[i - 1]!;
      this.meshes.get(part.instanceId!)!.position.y = this.meshes.get(over.instanceId!)!.position.y - part.height;
    }
    for (let i = 0; i < this.stack.length; i++) {
      const part = this.stack[i]!;
      part.parentId = i === anchor ? undefined : this.stack[i < anchor ? i + 1 : i - 1]!.instanceId;
    }
    this.root.updateMatrixWorld(true);
  }

  /**
   * What kind of part each slot takes, bottom to top.
   *
   * This used to be a fixed list of part ids, which meant exactly one vehicle
   * was buildable and pressing E four times always found it. Now it names
   * *kinds*, and the payload kind has four candidates the player chooses
   * between — so the build is a decision with wrong answers in it.
   */
  private static readonly SLOTS: PartDefinition['kind'][] = [
    'booster',
    'upper',
    'payload',
    'fairing',
  ];

  /** The kind of part the next slot expects, or null when complete. */
  nextSlot(): PartDefinition['kind'] | null {
    if (this.modular) return !this.stack.length ? 'tank' : this.isComplete() ? null : !this.stack.some(p => p.kind === 'payload') ? 'payload' : 'tank';
    return Assembly.SLOTS[this.stack.length] ?? null;
  }

  /** Every part that could legally go in the next slot. */
  candidates(): PartDefinition[] {
    const kind = this.nextSlot();
    if (!kind) return [];
    return (this.modular ? MODULAR_PARTS : PART_LIBRARY).filter((p) => p.kind === kind);
  }

  /**
   * The part that would be fitted by a plain confirm.
   *
   * For slots with one candidate this is that part. For the payload slot it is
   * whichever the player has selected.
   */
  nextExpected(): PartDefinition | null {
    const options = this.candidates();
    if (options.length === 0) return null;
    if (options.length === 1) return options[0] ?? null;
    const chosen = options.find((p) => p.id === this.selectedPayloadId);
    return chosen ?? options[0] ?? null;
  }

  /** Which payload the player has picked. */
  private selectedPayloadId: string | null = null;

  get selectedPayload(): string | null {
    return this.selectedPayloadId;
  }

  /** True when the next slot offers a real choice. */
  hasChoice(): boolean {
    return this.candidates().length > 1;
  }

  selectPayload(id: string): void {
    this.selectedPayloadId = id;
  }

  /** Step the payload selection, for cycling with a key. */
  cyclePayload(direction: 1 | -1): PartDefinition | null {
    const options = this.candidates();
    if (options.length < 2) return null;
    const current = options.findIndex((p) => p.id === this.selectedPayloadId);
    const from = current === -1 ? 0 : current;
    const next = (from + direction + options.length) % options.length;
    const part = options[next];
    if (part) this.selectedPayloadId = part.id;
    return part ?? null;
  }

  isComplete(): boolean {
    return this.modular ? modularComplete(this.stack) : this.stack.length === Assembly.SLOTS.length;
  }

  /**
   * Attach a specific part into the next slot.
   *
   * Used by the crane, which decides what it is carrying before the lift
   * begins and must fit exactly that when it touches down.
   */
  attachNextSpecific(partId: string): PartDefinition | null {
    const kind = this.nextSlot();
    if (!kind) return null;
    const part = PART_LIBRARY.find((p) => p.id === partId && p.kind === kind);
    if (!part) return null;

    const mesh = buildPartMesh(part, this.mats);
    mesh.position.y = this.stackHeight();
    this.root.add(mesh);
    this.meshes.set(part.id, mesh);
    this.stack.push(part);
    return part;
  }

  /** Attach the part the next slot expects. */
  attachNext(): PartDefinition | null {
    const part = this.nextExpected();
    if (!part) return null;

    const mesh = buildPartMesh(part, this.mats);
    mesh.position.y = this.stackHeight();
    this.root.add(mesh);
    this.meshes.set(part.id, mesh);
    this.stack.push(part);
    return part;
  }

  /**
   * Swap a fitted part for another candidate of the same kind.
   *
   * Without this, changing your mind about the payload meant tearing down
   * everything above it. Real programmes do swap payloads on the stand, and
   * making the player rebuild from scratch punished the wrong thing.
   *
   * Returns the part that was removed, or null if the swap is not possible.
   */
  swapPart(index: number, replacementId: string): { removed: PartDefinition; fitted: PartDefinition } | null {
    const existing = this.stack[index];
    if (!existing) return null;

    const replacement = PART_LIBRARY.find(
      (p) => p.id === replacementId && p.kind === existing.kind,
    );
    if (!replacement || replacement.id === existing.id) return null;

    // Rebuild the meshes from this slot up, since heights shift.
    const above = this.stack.slice(index + 1);
    for (let i = this.stack.length - 1; i >= index; i--) {
      const part = this.stack[i];
      if (!part) continue;
      const mesh = this.meshes.get(part.id);
      if (mesh) {
        this.root.remove(mesh);
        disposeGroup(mesh);
        this.meshes.delete(part.id);
      }
    }
    this.stack.length = index;

    for (const part of [replacement, ...above]) {
      const mesh = buildPartMesh(part, this.mats);
      mesh.position.y = this.stackHeight();
      this.root.add(mesh);
      this.meshes.set(part.id, mesh);
      this.stack.push(part);
    }

    if (replacement.kind === 'payload') this.selectedPayloadId = replacement.id;
    return { removed: existing, fitted: replacement };
  }

  /** Index of the fitted part of a given kind, or -1. */
  indexOfKind(kind: PartDefinition['kind']): number {
    return this.stack.findIndex((p) => p.kind === kind);
  }

  /** Remove the topmost part. */
  detachTop(): PartDefinition | null {
    if (this.modular) { const last = this.stack.at(-1); return last ? this.removeModular(last.instanceId!)[0] ?? null : null; }
    const part = this.stack.pop();
    if (!part) return null;
    const mesh = this.meshes.get(part.id);
    if (mesh) {
      this.root.remove(mesh);
      disposeGroup(mesh);
      this.meshes.delete(part.id);
    }
    return part;
  }

  clear(): void {
    while (this.stack.length > 0) this.detachTop();
  }

  /** Science the fitted payload will return. */
  scienceValue(): number {
    return this.stack.reduce((sum, p) => sum + (p.science ?? 0), 0);
  }

  /** Total height of the stack so far, metres. */
  stackHeight(): number {
    return this.stack.reduce((sum, p) => sum + p.height, 0);
  }

  /** World-space Y of the top of the stack, for camera framing. */
  topWorldY(): number {
    return this.root.position.y + this.stackHeight();
  }

  /**
   * Run the engineering analysis on the current stack.
   *
   * Stages are the booster and upper stage; the payload and fairing are dead
   * mass that every stage below them has to accelerate.
   */
  analyze(): StackAnalysis {
    if (this.modular) return modularAnalysis(this.stack);
    const boosters = this.stack.filter((p) => p.kind === 'booster' || p.kind === 'upper');
    const deadMass = this.stack
      .filter((p) => p.kind === 'payload' || p.kind === 'fairing')
      .reduce((sum, p) => sum + p.dryMass, 0);

    const liftoffMass =
      this.stack.reduce((sum, p) => sum + p.dryMass + p.propellantMass, 0);

    // Sum delta-v stage by stage, bottom first. Each stage must push itself,
    // everything above it, and the payload.
    let totalDeltaV = 0;
    for (let i = 0; i < boosters.length; i++) {
      const stage = boosters[i];
      if (!stage) continue;

      let above = deadMass;
      for (let j = i + 1; j < boosters.length; j++) {
        const upper = boosters[j];
        if (upper) above += upper.dryMass + upper.propellantMass;
      }

      const wet = above + stage.dryMass + stage.propellantMass;
      const dry = above + stage.dryMass;
      totalDeltaV += deltaV(wet, dry, stage.isp);
    }

    const first = this.stack.find((p) => p.kind === 'booster');
    const liftoffTWR = first && liftoffMass > 0
      ? first.thrust / (liftoffMass * G0)
      : 0;

    let verdict: string;
    let verdictLevel: StackAnalysis['verdictLevel'];
    const complete = this.isComplete();

    if (!complete) {
      const next = this.nextExpected();
      verdict = next
        ? `Stack incomplete. Next: ${next.name}.`
        : 'Stack incomplete.';
      verdictLevel = 'warn';
    } else if (liftoffTWR < 1.0) {
      verdict = `Thrust-to-weight is ${liftoffTWR.toFixed(2)}. It will not leave the pad.`;
      verdictLevel = 'bad';
    } else if (liftoffTWR < 1.2) {
      verdict = `TWR ${liftoffTWR.toFixed(2)} is marginal. Expect heavy gravity losses.`;
      verdictLevel = 'warn';
    } else if (totalDeltaV < LEO_DELTA_V_REQUIRED) {
      const short = LEO_DELTA_V_REQUIRED - totalDeltaV;
      verdict = `${short.toFixed(0)} m/s short of orbit. This stack cannot make it.`;
      verdictLevel = 'bad';
    } else {
      const margin = totalDeltaV - LEO_DELTA_V_REQUIRED;
      verdict = `Flight ready. ${margin.toFixed(0)} m/s of margin above the orbital requirement.`;
      verdictLevel = 'good';
    }

    return {
      liftoffMass,
      totalDeltaV,
      liftoffTWR,
      stageCount: boosters.length,
      canReachOrbit:
        complete && liftoffTWR >= 1.0 && totalDeltaV >= LEO_DELTA_V_REQUIRED,
      verdict,
      verdictLevel,
    };
  }
}

function disposeGroup(group: THREE.Object3D): void {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      // Materials are shared across parts, so they are not disposed here.
    }
  });
}
