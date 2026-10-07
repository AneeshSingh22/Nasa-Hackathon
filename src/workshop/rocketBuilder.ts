import * as THREE from 'three';
import type { Assembly } from '../vab/Assembly';
import type { PartDefinition } from '../vab/parts';
import type { OrbitCamera } from '../render/OrbitCamera';
import { RocketPalette } from './rocketPalette';
import { assessReadiness } from '../game/readiness';
import { play } from '../ui/sfx';

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
  /** Hand the finished vehicle to the launch phase. */
  readonly launch: () => void;
  /** Budget left, millions, so a part the programme cannot afford is refused. */
  readonly available?: () => number;
  /** The contract's par cost, millions, or null for no par. */
  readonly par?: () => number | null;
}

/** A part falling onto the stack. */
interface Drop {
  readonly mesh: THREE.Object3D;
  readonly restY: number;
  readonly start: number;
}

/** How long a part takes to fall onto the stack. ms */
const DROP_MS = 520;
/** How far above its seat it starts, in the stack's local units. */
const DROP_HEIGHT = 34;

export class RocketBuilder {
  readonly palette: RocketPalette;
  private drops: Drop[] = [];

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
      launch: () => this.hooks.launch(),
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
    if (!this.affordable(part.cost) || !this.hooks.charge(part)) {
      this.deny(`${part.name} costs ${part.cost} million. The programme cannot cover it.`,
        `Not enough budget for ${part.name}.`);
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
    this.palette.flashCost(-part.cost);
    play('spend');
    // Reframe first, then lift: framing a part mid-drop would zoom out to it.
    this.refresh();
    this.dropIn([fitted.id]);
  }

  /** Whether the programme can pay this much right now. */
  private affordable(cost: number): boolean {
    // Without this, the charge always succeeded and drove the budget negative,
    // which failed the whole mission instead of simply refusing the part.
    return !this.hooks.available || cost <= this.hooks.available() + 1e-9;
  }

  private deny(spoken: string, shown: string): void {
    this.hooks.refuse(spoken);
    this.palette.message(shown);
    this.palette.shake();
    play('deny');
  }

  /**
   * Lift the given parts and everything above them, and let them fall onto
   * the stack. A part appearing in place is a menu; a part landing with a
   * clunk is a thing you built.
   */
  private dropIn(partIds: readonly string[]): void {
    const now = performance.now();
    for (const id of partIds) {
      const mesh = this.root.getObjectByName(id);
      if (!mesh) continue;
      this.drops = this.drops.filter(drop => drop.mesh !== mesh);
      this.drops.push({ mesh, restY: mesh.position.y, start: now });
      mesh.position.y += DROP_HEIGHT;
    }
  }

  /** Advance falling parts. Called every frame while the Workshop is open. */
  tick(now = performance.now()): void {
    if (this.drops.length === 0) return;
    let landed = false;
    this.drops = this.drops.filter(drop => {
      const t = Math.min(1, (now - drop.start) / DROP_MS);
      // Accelerating fall, as a load coming off a crane does.
      drop.mesh.position.y = drop.restY + DROP_HEIGHT * (1 - t * t);
      if (t >= 1) {
        drop.mesh.position.y = drop.restY;
        landed = true;
        return false;
      }
      return true;
    });
    if (landed) play('clunk');
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
    if (difference > 0
      && (!this.affordable(difference) || !this.hooks.charge({ ...replacement, cost: difference }))) {
      this.deny(
        `Swapping to ${replacement.name} costs another ${difference} million. The programme cannot cover it.`,
        `Not enough budget to swap to ${replacement.name}.`,
      );
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
    // Refunds come back at half, as everywhere in the programme.
    this.palette.flashCost(difference > 0 ? -difference : -difference * 0.5);
    play(difference > 0 ? 'spend' : 'refund');
    // The swapped part and everything above it are rebuilt, so all of them land.
    this.refresh();
    this.dropIn(this.assembly.parts.slice(index).map(part => part.id));
  }

  removeLast(): void {
    const removed = this.assembly.detachTop();
    if (!removed) return;
    this.hooks.refund(removed);
    this.palette.message(`${removed.name} removed.`);
    this.palette.flashCost(removed.cost * 0.5);
    play('refund');
    this.refresh();
  }

  /** Re-read the assembly and update the palette, readout and framing. */
  refresh(): void {
    const analysis = this.assembly.analyze();
    this.palette.refresh(this.assembly.nextSlot(), this.assembly.parts);
    const before = this.palette.currentVerdict;
    const readiness = assessReadiness({
      complete: this.assembly.isComplete(),
      totalDeltaV: analysis.totalDeltaV,
      liftoffTWR: analysis.liftoffTWR,
    });
    this.palette.update(analysis, this.hooks.spent(), readiness, this.hooks.par?.() ?? null);
    // A sting when the call changes on a finished vehicle: the moment a swap
    // turns NO-GO into GO should feel like something happened.
    if (before !== null && before !== readiness.verdict) {
      if (readiness.verdict === 'go') play('go');
      else if (readiness.verdict === 'nogo') play('nogo');
    }
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
    // Frame where the parts will sit, not where they are mid-fall. Fitting
    // quickly reframed around parts still in the air, and once they landed the
    // bottom of the vehicle was cut off below the frame.
    const inFlight = this.drops.map(drop => ({ drop, y: drop.mesh.position.y }));
    for (const { drop } of inFlight) drop.mesh.position.y = drop.restY;
    this.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.root);
    for (const { drop, y } of inFlight) drop.mesh.position.y = y;
    this.root.updateMatrixWorld(true);
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
