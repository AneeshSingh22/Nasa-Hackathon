import * as THREE from 'three';
import { findSnap, type SnapCandidate } from './attach';
import { WORKSHOP_PARTS, type PartKind } from './parts';
import { WorkshopVessel } from './vessel';
import { createPartMesh, disposeMesh } from './meshes';
import { AttachmentNodes, NODE_INVALID_COLOR, NODE_VALID_COLOR } from './nodes';
import { WorkshopPalette } from './palette';

/** Select in DOM, aim the ghost's top node on a vertical plane, release LMB to
 * attach. Parts stay in the stationary vessel's coordinate frame, never camera space. */
export class Placement {
  private kind: PartKind | null = null;
  private ghost: THREE.Group | null = null;
  private pointer: { x: number; y: number } | null = null;
  private pressed: number | null = null;
  private candidate: SnapCandidate | null = null;
  private readonly nodes: AttachmentNodes;
  private readonly raycaster = new THREE.Raycaster();
  private readonly plane = new THREE.Plane();
  private readonly cleanup: () => void;

  constructor(private readonly vessel: WorkshopVessel, private readonly root: THREE.Object3D,
    private readonly camera: THREE.PerspectiveCamera, private readonly canvas: HTMLElement,
    private readonly palette: WorkshopPalette, private readonly changed: () => void) {
    this.nodes = new AttachmentNodes(root);
    const move = (event: PointerEvent) => {
      if (!this.active) return;
      this.pointer = { x: event.clientX, y: event.clientY };
      this.update();
    };
    const down = (event: PointerEvent) => {
      if (!this.active || event.button !== 0 || event.shiftKey) return;
      event.preventDefault();
      this.pressed = event.pointerId;
      move(event);
    };
    const up = (event: PointerEvent) => {
      if (!this.active || this.pressed !== event.pointerId || event.button !== 0) return;
      this.pressed = null;
      move(event);
      if (this.kind && this.candidate?.result.allowed) {
        const attached = this.vessel.attach(this.kind, this.candidate.partId, this.candidate.nodeId);
        if (attached) { this.cancel(); this.changed(); }
      }
    };
    const leave = () => {
      this.pointer = null;
      this.pressed = null;
      if (this.ghost) this.ghost.visible = false;
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointerleave', leave);
    canvas.addEventListener('pointercancel', leave);
    window.addEventListener('blur', leave);
    this.cleanup = () => {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('pointercancel', leave);
      window.removeEventListener('blur', leave);
    };
  }
  get active(): boolean { return this.kind !== null; }
  select(kind: PartKind): void {
    this.cancel();
    if (kind === 'command-pod') return;
    this.kind = kind;
    this.ghost = createPartMesh(kind);
    this.ghost.name = 'Placement ghost';
    this.ghost.visible = false;
    this.ghost.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = false;
      const materials: THREE.Material[] = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach(material => { material.transparent = true; material.opacity = 0.45; material.depthWrite = false; });
    });
    this.root.add(this.ghost);
    this.palette.select(kind);
    this.nodes.show(this.vessel.parts, kind);
  }
  update(): void {
    if (!this.kind || !this.ghost || !this.pointer) return;
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const point = new THREE.Vector2(
      (this.pointer.x - rect.left) / rect.width * 2 - 1,
      -(this.pointer.y - rect.top) / rect.height * 2 + 1,
    );
    const rootPosition = this.root.getWorldPosition(new THREE.Vector3());
    const normal = this.camera.getWorldDirection(new THREE.Vector3());
    normal.y = 0;
    normal.normalize();
    this.plane.setFromNormalAndCoplanarPoint(normal, rootPosition);
    this.raycaster.setFromCamera(point, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.plane, new THREE.Vector3());
    if (!hit) { this.ghost.visible = false; this.candidate = null; return; }
    this.root.worldToLocal(hit);
    this.candidate = findSnap(this.vessel.parts, this.kind, hit);
    const location = this.candidate?.result.allowed ? this.candidate.position : hit;
    const top = WORKSHOP_PARTS[this.kind].nodes.find(node => node.id === 'top')!;
    this.ghost.position.set(location.x - top.position.x, location.y - top.position.y, location.z - top.position.z);
    this.ghost.visible = true;
    const valid = this.candidate?.result.allowed ?? false;
    this.ghost.traverse(child => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        child.material.color.setHex(valid ? NODE_VALID_COLOR : NODE_INVALID_COLOR);
      }
    });
    this.nodes.show(this.vessel.parts, this.kind, this.candidate);
    this.palette.message(this.candidate ? this.candidate.result.reason
      : 'Move the top of the ghost to an attachment sphere · Esc: cancel');
  }
  cancel(): void {
    if (this.ghost) disposeMesh(this.ghost);
    this.ghost = null; this.kind = null; this.pointer = null; this.pressed = null; this.candidate = null;
    this.nodes.show(this.vessel.parts, null);
    this.palette.select(null);
  }
  dispose(): void { this.cleanup(); this.cancel(); this.nodes.dispose(); }
}
