import * as THREE from 'three';
import { canAttach, nodeTargets, type PlacedPart, type SnapCandidate } from './attach';
import type { PartKind } from './parts';

export const NODE_VALID_COLOR = 0x5fd99a;
export const NODE_INVALID_COLOR = 0xff5f67;
export class AttachmentNodes {
  readonly group = new THREE.Group();
  private lastState = '';
  private readonly geometry = new THREE.SphereGeometry(0.2, 16, 10);
  private readonly valid = new THREE.MeshBasicMaterial({ color: NODE_VALID_COLOR, depthTest: false });
  private readonly invalid = new THREE.MeshBasicMaterial({ color: NODE_INVALID_COLOR, depthTest: false });
  constructor(parent: THREE.Object3D) {
    this.group.name = 'Attachment nodes';
    parent.add(this.group);
  }
  show(parts: readonly PlacedPart[], kind: PartKind | null, candidate: SnapCandidate | null = null): void {
    const state = `${kind}:${parts.map(part => part.id).join(',')}:${candidate?.partId}:${candidate?.nodeId}`;
    if (state === this.lastState) return;
    this.lastState = state;
    this.group.clear();
    if (!kind) return;
    for (const node of nodeTargets(parts)) {
      const result = canAttach(parts, node.partId, node.nodeId, kind);
      const sphere = new THREE.Mesh(this.geometry, result.allowed ? this.valid : this.invalid);
      sphere.position.set(node.position.x, node.position.y, node.position.z);
      sphere.name = `${node.partId}:${node.nodeId}`;
      sphere.renderOrder = 10;
      if (candidate?.partId === node.partId && candidate.nodeId === node.nodeId) sphere.scale.setScalar(1.35);
      this.group.add(sphere);
    }
  }
  dispose(): void {
    this.group.removeFromParent();
    this.geometry.dispose();
    this.valid.dispose();
    this.invalid.dispose();
  }
}
