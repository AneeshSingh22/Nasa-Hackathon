import * as THREE from 'three';
import { buildPartMesh, createMaterials, type PartDefinition } from '../vab/parts';
/** Render the real meshes once. No persistent second renderer or frame loop. */
export function partThumbnails(parts: readonly PartDefinition[]): Map<string, string> {
  const images = new Map<string, string>();
  if (typeof WebGLRenderingContext === 'undefined') return images;
  let renderer: THREE.WebGLRenderer | undefined;
  const mats = createMaterials();
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(180, 180); renderer.setPixelRatio(1);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xdcecff, 0x403b30, 3));
    const light = new THREE.DirectionalLight(0xffffff, 4); light.position.set(8, 15, 12); scene.add(light);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .01, 200);
    for (const part of parts) {
      const mesh = buildPartMesh(part, mats); scene.add(mesh);
      const box = new THREE.Box3().setFromObject(mesh);
      const centre = box.getCenter(new THREE.Vector3()); const size = box.getSize(new THREE.Vector3());
      const half = Math.max(size.y, size.x, size.z) * .7;
      camera.left = camera.bottom = -half; camera.right = camera.top = half;
      camera.position.copy(centre).add(new THREE.Vector3(15, 8, 25));
      camera.lookAt(centre); camera.updateProjectionMatrix(); renderer.render(scene, camera);
      images.set(part.id, renderer.domElement.toDataURL());
      scene.remove(mesh); mesh.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    }
  } catch { /* Vector thumbnails remain available without WebGL. */ }
  finally {
    renderer?.dispose();
    // Release this disposable preview context immediately; repeated Workshop
    // visits must not evict the game's main WebGL context on smaller GPUs.
    renderer?.forceContextLoss();
    Object.values(mats).forEach(m => m.dispose());
  }
  return images;
}
export function partIcon(kind: string): string {
  const shape = kind === 'command' || kind === 'capsule' ? '<path d="M24 9 12 31h24L24 9Z"/><path d="M12 31v7h24v-7M21 22h6"/>'
    : kind === 'tank' ? '<rect x="15" y="7" width="18" height="34" rx="4"/><path d="M15 14h18M15 34h18"/>'
    : kind === 'engine' ? '<path d="M16 8h16v12l7 19H9l7-19V8Z"/><path d="M16 18h16M18 39l-2 6m8-6v6m6-6 2 6"/>'
    : kind === 'payload' || kind === 'satellite' ? '<rect x="18" y="16" width="12" height="16"/><path d="M18 20H5v9h13m12-9h13v9H30M24 16V8m-6 0h12M9 20v9m30-9v9"/>'
    : kind === 'decoupler' ? '<ellipse cx="24" cy="20" rx="15" ry="5"/><path d="M9 20v8c0 7 30 7 30 0v-8"/>'
    : '<path d="M12 39V24c0-8 12-17 12-17s12 9 12 17v15H12Z"/><path d="M24 9v30"/>';
  return `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">${shape}</svg>`;
}
