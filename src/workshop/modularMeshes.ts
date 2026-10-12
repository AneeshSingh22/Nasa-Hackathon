import * as THREE from 'three';
import type { PartDefinition, Materials } from '../vab/parts';

/** Distinct procedural silhouettes; local Y=0 is the lower mounting plane. */
export function buildModularMesh(part: PartDefinition, mats: Materials): THREE.Group {
  const group = new THREE.Group();
  group.name = part.id;
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, y: number) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.y = y;
    mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
  };
  if (part.kind === 'command') {
    if (part.id === 'probe-core') {
      add(new THREE.CylinderGeometry(part.radius, part.radius, part.height, 8), mats.hullDark, part.height / 2);
      add(new THREE.CylinderGeometry(part.radius * 1.02, part.radius * 1.02, .18, 16), mats.hull, .2);
      add(new THREE.CylinderGeometry(part.radius * 1.02, part.radius * 1.02, .18, 16), mats.hull, part.height - .2);
    } else {
      add(new THREE.CylinderGeometry(.75, part.radius, part.height, 24), mats.hull, part.height / 2);
      const window = add(new THREE.BoxGeometry(1.2, .6, .18), mats.hullDark, part.height * .65);
      window.position.z = 1.1;
      add(new THREE.CylinderGeometry(part.radius, part.radius, .25, 24), mats.nozzle, .15);
    }
  } else if (part.kind === 'tank') {
    add(new THREE.CylinderGeometry(part.radius, part.radius, part.height, 24), mats.hull, part.height / 2);
    for (const y of [.25, part.height - .25]) add(new THREE.CylinderGeometry(part.radius * 1.02, part.radius * 1.02, .4, 24), mats.hullDark, y);
    if (part.id.includes('hydrolox')) add(new THREE.CylinderGeometry(part.radius * 1.005, part.radius * 1.005, part.height * .45, 24), mats.accent, part.height * .5);
    if (part.id.includes('extended')) for (const y of [part.height / 3, part.height * 2 / 3]) add(new THREE.CylinderGeometry(part.radius * 1.01, part.radius * 1.01, .15, 24), mats.hullDark, y);
  } else if (part.kind === 'engine') {
    add(new THREE.CylinderGeometry(part.radius, part.radius, .6, 24), mats.hull, part.height - .3);
    // Silhouettes distinguish the clusters even with labels hidden in the palette.
    const count = part.vacuumOptimized ? 1 : part.id === 'swift-engine' ? 4 : part.id === 'core-engine' ? 5 : 7;
    for (let i = 0; i < count; i++) {
      const bell = add(new THREE.CylinderGeometry(.35, count === 1 ? (part.id === 'hydrolox-engine' ? 2.1 : 1.8) : count > 5 ? .7 : .9, part.height - .8, 20, 1, true), mats.nozzle, (part.height - .8) / 2);
      if (count > 1) { bell.position.x = Math.cos(i * Math.PI * 2 / count) * 1.35; bell.position.z = Math.sin(i * Math.PI * 2 / count) * 1.35; }
    }
  } else add(new THREE.CylinderGeometry(part.radius, part.radius, 1, 24), mats.accent, .5);
  return group;
}
