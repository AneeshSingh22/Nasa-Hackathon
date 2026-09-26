import * as THREE from 'three';
import type { Assembly } from '../vab/Assembly';
import type { PartDefinition } from '../vab/parts';
import type { OrbitCamera } from '../render/OrbitCamera';
import { RocketPalette } from './rocketPalette';

/**
 * Assembly in the Workshop, driving the real `Assembly`.
 *
 * The Phase 3 builder owned its own three-stub vessel and threw it away on
 * exit, so nothing the player did in here survived or counted. This drives the
 * same `Assembly` the bay and the contract panel already read, which is what
 * makes the build persist: the meshes are added to `assemblyRoot`, so the
 * finished rocket is simply there when the player walks back out.
 *
 * It also spends real budget, so overbuilding can bankrupt the programme.
 */

export interface BuilderHooks {
  /** Charge the mission for a part. Returns false if it cannot be afforded. */
  readonly charge: (part: PartDefinition) => boolean;
  /** Refund a removed part. */
  readonly refund: (part: PartDefinition) => void;
  /** Total spent so far, millions. */
  readonly spent: () => number;
  /** Something changed: update the contract panel and the rest of the HUD. */
  readonly changed: () => void;
  /** Speak, but only for refusals — the narrator stays quiet otherwise. */
  readonly refuse: (message: string) => void;
}

export class RocketBuilder {
  readonly palette: RocketPalette;

  constructor(
    private readonly assembly: Assembly,
    private readonly root: THREE.Object3D,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly orbit: OrbitCamera,
    chrome: HTMLElement,
    private readonly hooks: BuilderHooks,
  ) {
    this.palette = new RocketPalette(chrome, {
      select: part => this.fit(part),
      removeLast: () => this.removeLast(),
    });
    this.refresh();
  }

  /**
   * Fit a part. One rule decides: `Assembly.nextSlot` says what the stack is
   * ready for, and the budget says whether it can be paid for.
   */
  /**
   * Click a part to fit it, or to swap it for the one already in that slot.
   *
   * Committing to the first click was the wrong model: the whole point of
   * offering three boosters is comparing them, and making the player tear the
   * stack down to change their mind punished exactly the experimentation the
   * phase is meant to encourage. `Assembly.swapPart` rebuilds the parts above
   * the swapped slot, so a payload can be changed with the fairing already on.
   */
  fit(part: PartDefinition): void {
    const index = this.assembly.indexOfKind(part.kind);
    if (index >= 0) {
      this.swap(index, part);
      return;
    }
    const expected = this.assembly.nextSlot();
    if (expected !== part.kind) {
      this.palette.message(
        expected
          ? `The stack needs a ${expected === 'upper' ? 'second stage' : expected} next.`
          : 'The vehicle is complete. Remove a part to change it.',
      );
      return;
    }
    if (!this.hooks.charge(part)) {
      // Running out of money is a real way to lose, so say it out loud.
      this.hooks.refuse(`${part.name} costs ${part.cost} million. The programme cannot cover it.`);
      this.palette.message(`Not enough budget for ${part.name}.`);
      return;
    }
    const fitted = this.assembly.attachNextSpecific(part.id);
    if (!fitted) {
      this.hooks.refund(part);
      this.palette.message('That part does not fit here.');
      return;
    }
    this.palette.select(null);
    this.palette.message(`${fitted.name} fitted. ${fitted.keyFact}`);
    this.refresh();
  }

  /** Exchange a fitted part for another of the same kind. */
  private swap(index: number, replacement: PartDefinition): void {
    const existing = this.assembly.parts[index];
    if (!existing) return;
    if (existing.id === replacement.id) {
      this.palette.message(`${existing.name} is already fitted. ${existing.keyFact}`);
      return;
    }
    // Charge the difference only. A swap is one decision, so billing it as a
    // full removal plus a full fit would make comparing options ruinous.
    const difference = replacement.cost - existing.cost;
    if (difference > 0 && !this.hooks.charge({ ...replacement, cost: difference })) {
      this.hooks.refuse(
        `Swapping to ${replacement.name} costs another ${difference} million. The programme cannot cover it.`,
      );
      this.palette.message(`Not enough budget to swap to ${replacement.name}.`);
      return;
    }
    const result = this.assembly.swapPart(index, replacement.id);
    if (!result) {
      if (difference > 0) this.hooks.refund({ ...replacement, cost: difference });
      this.palette.message('That part cannot go there.');
      return;
    }
    if (difference < 0) this.hooks.refund({ ...existing, cost: -difference });
    this.palette.message(`Swapped to ${result.fitted.name}. ${result.fitted.keyFact}`);
    this.refresh();
  }

  removeLast(): void {
    const removed = this.assembly.detachTop();
    if (!removed) return;
    this.hooks.refund(removed);
    this.palette.message(`${removed.name} removed.`);
    this.refresh();
  }

  /** Re-read the assembly and update the palette, readout and framing. */
  refresh(): void {
    const analysis = this.assembly.analyze();
    this.palette.refresh(this.assembly.nextSlot(), this.assembly.parts);
    this.palette.update(analysis, this.hooks.spent());
    this.hooks.changed();
    this.frame();
  }

  /**
   * Keep the whole vehicle in shot as it grows.
   *
   * A 47 m booster with a fairing on top is nearly 90 m of rocket, so a fixed
   * camera loses the top of it within two parts.
   */
  private frame(): void {
    // An empty stand has no bounds worth framing, and a near-zero bounding
    // sphere drives the camera to its minimum distance staring at the floor.
    // Sit at the default standoff until there is something to look at.
    if (this.assembly.parts.length === 0) {
      this.orbit.reset(this.root.getWorldPosition(new THREE.Vector3()));
      return;
    }
    const box = new THREE.Box3().setFromObject(this.root);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    this.camera.updateProjectionMatrix();
    this.orbit.frame(centre, size.y / 2, Math.max(size.x, size.z) / 2);
  }

  dispose(): void {
    this.palette.dispose();
  }
}
