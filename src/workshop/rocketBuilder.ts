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
  fit(part: PartDefinition): void {
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
    const box = new THREE.Box3().setFromObject(this.root);
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    this.camera.updateProjectionMatrix();
    this.orbit.frame(sphere.center, sphere.radius);
  }

  dispose(): void {
    this.palette.dispose();
  }
}
