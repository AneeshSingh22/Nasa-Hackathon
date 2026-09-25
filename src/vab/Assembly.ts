import * as THREE from 'three';
import { PART_LIBRARY, buildPartMesh, type Materials, type PartDefinition } from './parts';
import { G0 } from '../physics/constants';
import { deltaV } from '../physics/rocket';

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

/** Delta-v needed for low Earth orbit including gravity and drag losses. */
export const LEO_DELTA_V_REQUIRED = 9400;

export class Assembly {
  private stack: PartDefinition[] = [];
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

  /** The order parts must be stacked in, bottom to top. */
  private static readonly ORDER: PartDefinition['kind'][] = [
    'booster',
    'upper',
    'payload',
    'fairing',
  ];

  /** The part the player is allowed to attach next, or null when complete. */
  nextExpected(): PartDefinition | null {
    const index = this.stack.length;
    const kind = Assembly.ORDER[index];
    if (!kind) return null;
    return PART_LIBRARY.find((p) => p.kind === kind) ?? null;
  }

  isComplete(): boolean {
    return this.stack.length === Assembly.ORDER.length;
  }

  /** Attach the next part. Returns false if the stack is already complete. */
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

  /** Remove the topmost part. */
  detachTop(): PartDefinition | null {
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
