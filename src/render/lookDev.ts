import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * Look development: the difference between "procedural geometry" and "a render".
 *
 * The scene had good PBR materials and no environment to light them with. A
 * metal is only metal because of what it reflects, so `metalness: 0.9` gold
 * with no environment map renders as flat grey-brown — the single biggest
 * reason the bay read as plastic. Two large flat lights (ambient 0.85 plus
 * hemisphere 0.75) then removed most of what shading remained, because light
 * arriving equally from everywhere produces no gradient across a surface and
 * therefore no sense of form.
 *
 * `RoomEnvironment` is a procedural studio interior that ships with Three.js:
 * no download, no asset licensing, no HDR file to host. Run through
 * `PMREMGenerator` it becomes a prefiltered radiance map, which is what
 * `MeshStandardMaterial` wants for image-based lighting.
 */

/**
 * Build the image-based lighting environment and attach it to the scene.
 *
 * Returns the generated texture so the caller can dispose it; the PMREM
 * generator and the source scene are disposed here since nothing else needs
 * them.
 */
export function installEnvironment(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
): THREE.Texture | null {
  // Prefiltering needs a real WebGL context. Headless tests and the rare
  // driver that refuses render-to-texture should lose the reflections, not the
  // game, so this never throws into module scope — a startup throw there is
  // what once left the start button dead.
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const environment = pmrem.fromScene(room, 0.04).texture;
    scene.environment = environment;
    room.dispose();
    pmrem.dispose();
    return environment;
  } catch (error) {
    console.warn('Environment lighting unavailable; falling back to lights only.', error);
    return null;
  }
}

/**
 * Colour management and tone mapping.
 *
 * Without an explicit output colour space, lighting maths done in linear space
 * is written to an sRGB display untouched, which is why everything looked
 * simultaneously washed out and muddy. ACES filmic tone mapping then rolls off
 * the highlights the way a camera does, so a bright work lamp reads as bright
 * rather than as a flat white patch.
 */
export function configureRenderer(renderer: THREE.WebGLRenderer): void {
  // Guard each assignment: a stubbed or partial renderer must not take the
  // whole module down.
  if (!renderer || typeof renderer !== 'object') return;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // Slightly under 1 because image-based lighting adds energy the old flat
  // ambient did not; without this the bay blows out.
  renderer.toneMappingExposure = 0.92;
  if (renderer.shadowMap) {
    renderer.shadowMap.enabled = true;
    // Variance shadows are softer at the contact point, where hard PCF edges
    // read as a sticker rather than as a shadow.
    renderer.shadowMap.type = THREE.VSMShadowMap;
  }
}

/**
 * How strongly each material samples the environment.
 *
 * Applied after materials are created, so a material only has to declare its
 * metalness and roughness and the look stays consistent across the scene.
 */
export function applyEnvironmentIntensity(
  root: THREE.Object3D,
  intensity = 1,
): void {
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material instanceof THREE.MeshStandardMaterial) {
        material.envMapIntensity = intensity;
        material.needsUpdate = true;
      }
    }
  });
}
