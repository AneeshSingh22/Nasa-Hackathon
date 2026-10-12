import * as THREE from 'three';

/** Fixed, true isometric projection: equal X/Y/Z foreshortening. The framing
 *  follows the real displayed craft bounds with the assembly centred on screen. */
export class HubCamera {
  readonly camera = new THREE.OrthographicCamera(-30, 30, 20, -20, 0.1, 400);
  readonly target = new THREE.Vector3();

  frame(root: THREE.Object3D, width: number, height: number): void {
    root.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(root);
    const top = bounds.isEmpty() ? 1.6 : Math.max(1.6, bounds.max.y);
    const aspect = Math.max(1, width) / Math.max(1, height);
    const halfHeight = Math.max(17, top * 0.7, 17 / aspect);
    this.camera.left = -halfHeight * aspect;
    this.camera.right = halfHeight * aspect;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    // Centre the assembly itself, not the space between unequal HUD panels.
    this.target.set(0, bounds.isEmpty() ? 1.6 : (bounds.min.y + bounds.max.y) / 2, 0);
    this.camera.position.copy(this.target).add(new THREE.Vector3(-1, 1, 1).normalize().multiplyScalar(100));
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
  }

  /** DOM button anchor, projected from the platform rather than a screen guess. */
  platformPosition(width: number, height: number): { x: number; y: number } {
    const point = new THREE.Vector3(0, 1.6, 0).project(this.camera);
    return { x: (point.x + 1) * width / 2, y: (1 - point.y) * height / 2 + 48 };
  }
}
