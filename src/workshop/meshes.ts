import * as THREE from 'three';
import type { PartKind } from './parts';

export function createCommandPod(): THREE.Group {
  const pod = new THREE.Group();
  pod.name = 'Workshop Command Pod';
  // Put the object origin at the capsule centre so orbit framing is natural.
  const hull = new THREE.MeshStandardMaterial({ color: 0xe4eaf1, roughness: 0.48, metalness: 0.25 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x263343, roughness: 0.7 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x52d9ec, emissive: 0x174250, metalness: 0.5 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.5, 2.4, 32), hull);
  const shield = new THREE.Mesh(new THREE.CylinderGeometry(1.52, 1.4, 0.2, 32), dark);
  shield.position.y = -1.3;
  const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.2, 24), dark);
  hatch.position.y = 1.3;
  const window = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.45, 0.12), glass);
  window.position.set(0, 0.25, 1.04);
  window.rotation.x = -0.32;
  pod.add(body, shield, hatch, window);
  pod.traverse(child => {
    if (child instanceof THREE.Mesh) child.castShadow = true;
  });
  return pod;
}

export function createPartMesh(kind: PartKind): THREE.Group {
  if (kind === 'command-pod') return createCommandPod();
  const group = new THREE.Group();
  group.name = kind;
  const hull = new THREE.MeshStandardMaterial({ color: 0xd1dce5, metalness: 0.4, roughness: 0.45 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x35404d, metalness: 0.65, roughness: 0.5 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xe9893f, roughness: 0.5 });
  if (kind === 'fuel-tank') {
    group.add(new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.18, 2, 32), hull));
    for (const y of [-0.86, 0.86]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.12, 32), accent);
      band.position.y = y;
      group.add(band);
    }
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.8, 8), dark);
    pipe.position.x = 1.23;
    group.add(pipe);
  } else {
    const mount = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.18, 0.3, 32), hull);
    mount.position.y = 0.65;
    const chamber = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.4, 24), accent);
    chamber.position.y = 0.3;
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.95, 1, 32, 1, true), dark);
    nozzle.position.y = -0.3;
    dark.side = THREE.DoubleSide;
    group.add(mount, chamber, nozzle);
  }
  group.traverse(child => { if (child instanceof THREE.Mesh) child.castShadow = true; });
  return group;
}

export function disposeMesh(object: THREE.Object3D): void {
  const materials = new Set<THREE.Material>();
  object.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) materials.add(material);
  });
  materials.forEach(material => material.dispose());
  object.removeFromParent();
}
