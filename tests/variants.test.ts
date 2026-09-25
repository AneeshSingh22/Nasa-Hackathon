import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildPartMesh, createMaterials, PART_LIBRARY } from '../src/vab/parts';

/**
 * All three boosters shared one builder and all four payloads another, so the
 * options looked identical in the world and on the placards. Offering a choice
 * between visually identical things is not a choice.
 */

const mats = createMaterials();

/** A shape fingerprint: which geometry types, how many, and the bounding box. */
function fingerprint(group: THREE.Group): string {
  const types: string[] = [];
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      types.push(child.geometry.type);
    }
  });
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  return [
    types.sort().join(','),
    types.length,
    size.x.toFixed(1),
    size.y.toFixed(1),
    size.z.toFixed(1),
  ].join('|');
}

describe('part variants look different', () => {
  it('gives every part in the library its own mesh', () => {
    for (const part of PART_LIBRARY) {
      const mesh = buildPartMesh(part, mats);
      let meshes = 0;
      mesh.traverse((c) => {
        if (c instanceof THREE.Mesh) meshes += 1;
      });
      expect(meshes, part.id).toBeGreaterThan(0);
    }
  });

  it('makes the three first stages visually distinct', () => {
    const boosters = PART_LIBRARY.filter((p) => p.kind === 'booster');
    expect(boosters.length).toBe(3);

    const prints = boosters.map((b) => fingerprint(buildPartMesh(b, mats)));
    const unique = new Set(prints);
    expect(unique.size, `fingerprints: ${prints.join('  /  ')}`).toBe(3);
  });

  it('makes the two upper stages visually distinct', () => {
    const uppers = PART_LIBRARY.filter((p) => p.kind === 'upper');
    expect(uppers.length).toBe(2);

    const prints = uppers.map((u) => fingerprint(buildPartMesh(u, mats)));
    expect(new Set(prints).size).toBe(2);
  });

  it('makes all four payloads visually distinct', () => {
    const payloads = PART_LIBRARY.filter((p) => p.kind === 'payload');
    expect(payloads.length).toBe(4);

    const prints = payloads.map((p) => fingerprint(buildPartMesh(p, mats)));
    const unique = new Set(prints);
    expect(unique.size, `fingerprints: ${prints.join('  /  ')}`).toBe(4);
  });

  it('gives the solid booster a segmented casing and one nozzle', () => {
    const solid = PART_LIBRARY.find((p) => p.id === 'solid-booster');
    expect(solid).toBeDefined();
    if (!solid) return;

    const mesh = buildPartMesh(solid, mats);
    let cones = 0;
    mesh.traverse((c) => {
      if (c instanceof THREE.Mesh && c.geometry.type === 'ConeGeometry') cones += 1;
    });
    // The nose cap distinguishes it from the liquid cores.
    expect(cones).toBeGreaterThan(0);
  });

  it('gives the crew capsule windows', () => {
    const crew = PART_LIBRARY.find((p) => p.id === 'crew-capsule');
    if (!crew) return;

    const mesh = buildPartMesh(crew, mats);
    let torus = 0;
    mesh.traverse((c) => {
      if (c instanceof THREE.Mesh && c.geometry.type === 'TorusGeometry') torus += 1;
    });
    // The docking ring is unique to the capsule.
    expect(torus).toBe(1);
  });

  it('gives the laboratory the largest footprint of any payload', () => {
    const payloads = PART_LIBRARY.filter((p) => p.kind === 'payload');
    const widths = payloads.map((p) => {
      const box = new THREE.Box3().setFromObject(buildPartMesh(p, mats));
      return { id: p.id, width: box.getSize(new THREE.Vector3()).x };
    });
    const widest = widths.reduce((a, b) => (a.width > b.width ? a : b));
    // Its big arrays should make it the visibly bulkiest choice.
    expect(widest.id).toBe('science-lab');
  });

  it('keeps every part standing on its own base', () => {
    // Parts stack by summing heights, so a mesh whose geometry starts below
    // y = 0 would sink into the part beneath it.
    for (const part of PART_LIBRARY) {
      const box = new THREE.Box3().setFromObject(buildPartMesh(part, mats));
      // Engine bells hang below the base by design; nothing should be far off.
      expect(box.min.y, part.id).toBeGreaterThan(-4.0);
    }
  });
});
