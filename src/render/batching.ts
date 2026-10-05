import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Draw-call batching for static scenery.
 *
 * The bay was 374 draw calls for 6 410 triangles — a trivial amount of
 * geometry split across hundreds of separate objects, each one a separate
 * command to the GPU with its own state change. That ratio is the giveaway:
 * when triangles are cheap and draw calls are many, the bottleneck is the CPU
 * talking to the driver, not the GPU drawing anything.
 *
 * It happened naturally. Procedural scenery is written as nested loops, and
 * every iteration that calls `new THREE.BoxGeometry` produces another object
 * to draw, even when forty-nine of them are the same box.
 *
 * This merges meshes that share a material into one geometry each. The
 * vertices are baked into world space, so the result cannot be moved or
 * animated — which is exactly right for walls, trusses, racks and crates, and
 * exactly wrong for the elevator or the vehicle. Callers opt in by marking
 * what is static.
 */

/** Meshes carrying this flag are left alone: they move, or something looks them up. */
export const DYNAMIC = 'keepSeparate';

/** Mark a mesh (and its descendants) as excluded from batching. */
export function keepSeparate<T extends THREE.Object3D>(object: T): T {
  object.userData[DYNAMIC] = true;
  return object;
}

export interface BatchResult {
  /** Draw calls before and after, for logging and for tests. */
  readonly before: number;
  readonly after: number;
}

/**
 * Merge the static meshes under `root` in place.
 *
 * A mesh is batched only when it is safe to bake:
 * - not flagged with `keepSeparate`
 * - not named — named meshes are looked up by name elsewhere, and merging them
 *   would make `getObjectByName` return nothing, which is a silent breakage
 * - a single material, not an array
 * - not an `InstancedMesh`, which is already batched
 *
 * Shadow casting is preserved by batching casters and non-casters separately,
 * so a merged wall does not suddenly start or stop casting.
 */
export function batchStatic(root: THREE.Object3D): BatchResult {
  const candidates: THREE.Mesh[] = [];
  let before = 0;

  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    before++;
    if (object instanceof THREE.InstancedMesh) return;
    if (object.userData[DYNAMIC]) return;
    // A named mesh is part of someone's contract. `Assembly` finds parts by
    // name, and the tests look up walls and floors that way.
    if (object.name) return;
    if (Array.isArray(object.material)) return;
    // Anything with a parent that moves must stay put.
    if (hasDynamicAncestor(object)) return;
    candidates.push(object);
  });

  // Group by material *and* shadow flags: merging a caster with a non-caster
  // would change what the merged mesh does.
  const groups = new Map<string, THREE.Mesh[]>();
  for (const mesh of candidates) {
    const material = mesh.material as THREE.Material;
    const key = `${material.uuid}|${mesh.castShadow ? 1 : 0}|${mesh.receiveShadow ? 1 : 0}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(mesh);
    else groups.set(key, [mesh]);
  }

  for (const meshes of groups.values()) {
    // Merging one mesh saves nothing and costs a geometry copy.
    if (meshes.length < 2) continue;
    const first = meshes[0]!;

    const geometries: THREE.BufferGeometry[] = [];
    for (const mesh of meshes) {
      mesh.updateWorldMatrix(true, false);
      // Bake the world transform into the vertices, since the merged mesh sits
      // at the origin and has no transform of its own.
      const baked = mesh.geometry.clone();
      baked.applyMatrix4(mesh.matrixWorld);
      // Merging requires identical attribute sets. Scenery that has a UV map
      // cannot merge with scenery that does not.
      geometries.push(baked);
    }

    const compatible = geometries.every(
      geometry => sameAttributes(geometry, geometries[0]!),
    );
    if (!compatible) {
      for (const geometry of geometries) geometry.dispose();
      continue;
    }

    const merged = mergeGeometries(geometries, false);
    for (const geometry of geometries) geometry.dispose();
    if (!merged) continue;

    const batch = new THREE.Mesh(merged, first.material);
    batch.castShadow = first.castShadow;
    batch.receiveShadow = first.receiveShadow;
    batch.name = 'Batched scenery';
    root.add(batch);

    for (const mesh of meshes) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    }
  }

  let after = 0;
  root.traverse(object => { if (object instanceof THREE.Mesh) after++; });
  return { before, after };
}

function hasDynamicAncestor(object: THREE.Object3D): boolean {
  let parent = object.parent;
  while (parent) {
    if (parent.userData[DYNAMIC]) return true;
    parent = parent.parent;
  }
  return false;
}

/** Two geometries can only be merged if they carry the same attributes. */
function sameAttributes(a: THREE.BufferGeometry, b: THREE.BufferGeometry): boolean {
  const keysA = Object.keys(a.attributes).sort();
  const keysB = Object.keys(b.attributes).sort();
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key, index) => key === keysB[index]);
}
