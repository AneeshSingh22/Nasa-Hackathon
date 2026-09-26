import * as THREE from 'three';

/** A floor-only interaction zone on the unobstructed path from spawn. */
export class WorkshopStation {
  readonly position = new THREE.Vector3(0, 0, 9);

  contains(position: { x: number; y: number; z: number }): boolean {
    return position.y >= 0 && position.y <= 2.5
      && Math.hypot(position.x - this.position.x, position.z - this.position.z) <= 2.5;
  }

  createMesh(): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(this.position);
    const paint = new THREE.MeshBasicMaterial({ color: 0x52d9ec, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.25, 2.4, 48), paint);
    // Floor decals are separated from the existing grid/paint to avoid flicker.
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    group.add(ring);

    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#101725';
      ctx.fillRect(0, 0, 768, 256);
      ctx.strokeStyle = '#52d9ec';
      ctx.lineWidth = 10;
      ctx.strokeRect(5, 5, 758, 246);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#52d9ec';
      ctx.font = 'bold 72px sans-serif';
      ctx.fillText('WORKSHOP', 384, 105);
      ctx.fillStyle = '#e9eef6';
      ctx.font = '38px sans-serif';
      ctx.fillText('Build rocket · Press E', 384, 180);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.2),
      new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
    // Suspended signage leaves the marked floor area open to walk through.
    sign.position.set(0, 3.2, -0.8);
    group.add(sign);
    return group;
  }
}
