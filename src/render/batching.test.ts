import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { batchStatic, keepSeparate } from './batching';

/**
 * Batching trades flexibility for draw calls, and the trade is only safe if
 * the things that must stay separate actually do. Every assertion here is a
 * way the merge could silently break the game: a moving object frozen in
 * place, a lookup by name returning nothing, a shadow caster that stops
 * casting.
 */

function box(material: THREE.Material, x = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.position.x = x;
  return mesh;
}

describe('static scenery batching', () => {
  it('merges meshes that share a material', () => {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial();
    for (let i = 0; i < 20; i++) root.add(box(material, i));

    const result = batchStatic(root);

    expect(result.before).toBe(20);
    expect(result.after).toBe(1);
  });

  it('keeps different materials in different batches', () => {
    const root = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial();
    const paint = new THREE.MeshStandardMaterial();
    for (let i = 0; i < 6; i++) root.add(box(steel, i));
    for (let i = 0; i < 6; i++) root.add(box(paint, i));

    expect(batchStatic(root).after).toBe(2);
  });

  it('preserves world position when it bakes the transform', () => {
    // The merged mesh sits at the origin with no transform, so the vertices
    // must carry the position. Getting this wrong piles the whole bay at 0,0,0.
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial();
    root.add(box(material, -40), box(material, 40));
    root.updateWorldMatrix(true, true);

    batchStatic(root);

    const bounds = new THREE.Box3().setFromObject(root);
    expect(bounds.min.x).toBeCloseTo(-40.5, 3);
    expect(bounds.max.x).toBeCloseTo(40.5, 3);
  });

  it('never merges anything marked as moving', () => {
    // The elevator car and the vehicle move every frame. Baking them into
    // world space would freeze them in place with no error anywhere.
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial();
    const car = keepSeparate(new THREE.Group());
    for (let i = 0; i < 5; i++) car.add(box(material, i));
    root.add(car);
    for (let i = 0; i < 5; i++) root.add(box(material, i));

    batchStatic(root);

    // The car still owns its five meshes.
    expect(car.children.filter(c => c instanceof THREE.Mesh)).toHaveLength(5);
  });

  it('never merges a named mesh', () => {
    // Assembly finds parts by name and the scene tests look up walls that way.
    // A merged name is a silent lookup failure rather than an error.
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial();
    const named = box(material, 1);
    named.name = 'core-booster';
    root.add(named);
    for (let i = 0; i < 4; i++) root.add(box(material, i));

    batchStatic(root);

    expect(root.getObjectByName('core-booster')).toBe(named);
  });

  it('does not mix shadow casters with non-casters', () => {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial();
    for (let i = 0; i < 4; i++) {
      const caster = box(material, i);
      caster.castShadow = true;
      root.add(caster);
    }
    for (let i = 0; i < 4; i++) root.add(box(material, i));

    batchStatic(root);

    const meshes: THREE.Mesh[] = [];
    root.traverse(o => { if (o instanceof THREE.Mesh) meshes.push(o); });
    expect(meshes).toHaveLength(2);
    // One batch casts, the other does not: merging them would change what the
    // scene draws into the shadow map.
    expect(meshes.filter(m => m.castShadow)).toHaveLength(1);
  });

  it('leaves an InstancedMesh alone', () => {
    // Already batched; merging it would undo the saving.
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial();
    const instanced = new THREE.InstancedMesh(new THREE.BoxGeometry(), material, 10);
    root.add(instanced);
    for (let i = 0; i < 3; i++) root.add(box(material, i));

    batchStatic(root);

    expect(root.children).toContain(instanced);
  });

  it('does not merge a lone mesh, which would only copy geometry', () => {
    const root = new THREE.Group();
    const only = box(new THREE.MeshStandardMaterial());
    root.add(only);

    const result = batchStatic(root);

    expect(result.after).toBe(1);
    expect(root.children).toContain(only);
  });
});
