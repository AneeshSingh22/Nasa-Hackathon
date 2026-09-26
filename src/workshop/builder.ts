import * as THREE from 'three';
import { OrbitCamera } from '../render/OrbitCamera';
import { WorkshopVessel } from './vessel';
import { WorkshopPalette } from './palette';
import { Placement } from './placement';
import { createPartMesh, disposeMesh } from './meshes';
import { analyzeWorkshopVessel } from './analysis';

export class WorkshopBuilder {
  readonly placement: Placement;
  readonly palette: WorkshopPalette;
  private readonly meshes = new Map<string, THREE.Group>();
  constructor(private readonly vessel: WorkshopVessel, private readonly root: THREE.Object3D,
    private readonly camera: THREE.PerspectiveCamera, private readonly orbit: OrbitCamera,
    canvas: HTMLElement, chrome: HTMLElement) {
    this.palette = new WorkshopPalette(chrome, kind => this.placement.select(kind), () => this.detachLast());
    this.placement = new Placement(vessel, root, camera, canvas, this.palette, () => this.sync());
    this.updateReadout();
  }
  private updateReadout(): void {
    this.palette.update(analyzeWorkshopVessel(this.vessel.parts), this.vessel.parts.length > 1);
  }
  private sync(): void {
    for (const [id, mesh] of this.meshes) {
      if (!this.vessel.parts.some(part => part.id === id)) { disposeMesh(mesh); this.meshes.delete(id); }
    }
    for (const part of this.vessel.parts) {
      if (part.id === 'pod' || this.meshes.has(part.id)) continue;
      const mesh = createPartMesh(part.kind);
      mesh.position.set(part.position.x, part.position.y, part.position.z);
      mesh.userData.workshopPartId = part.id;
      this.root.add(mesh);
      this.meshes.set(part.id, mesh);
    }
    this.updateReadout();
    // The hanging stack grows away from the pod. Reframe actual mesh bounds
    // after edits so lower engines remain visible without resetting the orbit angle.
    const sphere = new THREE.Box3().setFromObject(this.root).getBoundingSphere(new THREE.Sphere());
    this.camera.updateProjectionMatrix();
    this.orbit.frame(sphere.center, sphere.radius);
  }
  detachLast(): void {
    this.placement.cancel();
    if (this.vessel.detachLast()) this.sync();
  }
  dispose(): void {
    this.placement.dispose();
    this.palette.dispose();
    this.meshes.forEach(disposeMesh);
    this.meshes.clear();
  }
}
