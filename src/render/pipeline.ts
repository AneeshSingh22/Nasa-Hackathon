import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/**
 * The post-processing pipeline.
 *
 * Geometry and materials decide what is in the picture; this decides whether it
 * looks photographed or rendered. Three effects do nearly all of that work, and
 * they are the difference between a technically correct scene and one that
 * reads as a real place:
 *
 * - **Ambient occlusion** darkens the creases where surfaces meet. Without it
 *   every object appears to hover a millimetre above whatever it rests on,
 *   because direct lighting alone cannot know that a corner receives less
 *   bounced light than a flat face. It is the single most grounding effect
 *   available.
 * - **Bloom** lets a bright source bleed into its surroundings the way a lens
 *   does. It is the reason a work lamp reads as *emitting* light rather than
 *   being a white shape.
 * - **Anti-aliasing** removes the stair-stepping on every long edge. A bay full
 *   of railings and beams is mostly long diagonal edges, which is exactly the
 *   worst case, and jagged edges read as "cheap" faster than almost anything.
 *
 * A grade pass follows: slight desaturation in shadow, a warm-highlight cool-
 * shadow split, and a vignette. This is what separates the reference images
 * from a default render — they are colour-graded, and an ungraded scene looks
 * clinical no matter how good the lighting is.
 *
 * Everything degrades. `create` returns null if the composer cannot be built,
 * and the caller falls back to `renderer.render`, because a broken pipeline
 * must cost reflections rather than the whole game.
 */

export type Quality = 'high' | 'fast';

/**
 * Cinematic grade.
 *
 * Deliberately restrained: the aim is a scene that looks shot on a camera, not
 * one that looks filtered. Every term is separately tunable because grading is
 * the part that most needs adjusting against a real display.
 */
const GradeShader = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    // Pulls the corners down. Real lenses do this, and it focuses the eye.
    vignette: { value: 0.32 },
    // Cools the shadows and warms the highlights: the standard split-tone that
    // reads as "cinematic" because film stocks behaved this way.
    shadowTint: { value: new THREE.Color(0.86, 0.92, 1.06) },
    highlightTint: { value: new THREE.Color(1.05, 1.0, 0.94) },
    // Slight S-curve on contrast, so mid-tones separate.
    contrast: { value: 1.06 },
    saturation: { value: 1.04 },
    // A trace of chromatic aberration at the edges. At this strength it is not
    // consciously visible; removing it makes the image look flatter.
    aberration: { value: 0.0012 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float vignette;
    uniform vec3 shadowTint;
    uniform vec3 highlightTint;
    uniform float contrast;
    uniform float saturation;
    uniform float aberration;
    varying vec2 vUv;

    void main() {
      vec2 centred = vUv - 0.5;
      float radius = length(centred);

      // Sample the channels at slightly different radii. A real lens cannot
      // focus all wavelengths to the same point, and the effect grows toward
      // the edge of the frame.
      vec2 offset = centred * radius * aberration;
      vec3 colour = vec3(
        texture2D(tDiffuse, vUv + offset).r,
        texture2D(tDiffuse, vUv).g,
        texture2D(tDiffuse, vUv - offset).b
      );

      // Split-tone by luminance, using Rec. 709 weights.
      float luma = dot(colour, vec3(0.2126, 0.7152, 0.0722));
      vec3 tint = mix(shadowTint, highlightTint, smoothstep(0.15, 0.85, luma));
      colour *= tint;

      colour = (colour - 0.5) * contrast + 0.5;
      colour = mix(vec3(luma), colour, saturation);

      // Vignette, squared so the falloff is gentle rather than a dark ring.
      float falloff = smoothstep(0.85, 0.15, radius);
      colour *= mix(1.0 - vignette, 1.0, falloff);

      gl_FragColor = vec4(clamp(colour, 0.0, 1.0), 1.0);
    }
  `,
};

export interface Pipeline {
  readonly composer: EffectComposer;
  /** Render one frame through the pipeline. */
  render(): void;
  setSize(width: number, height: number): void;
  /** Swap effect budget. Returns the quality actually in force. */
  setQuality(quality: Quality): Quality;
  readonly quality: Quality;
  dispose(): void;
}

/**
 * Build the pipeline, or return null if post-processing is unavailable.
 *
 * `scene` and `camera` are captured, so a camera the caller later mutates is
 * still the one rendered — the Workshop shares one camera with Explore.
 */
export function createPipeline(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  initial: Quality = 'high',
): Pipeline | null {
  let composer: EffectComposer;
  let gtao: GTAOPass;
  let bloom: UnrealBloomPass;
  let grade: ShaderPass;

  try {
    const size = renderer.getSize(new THREE.Vector2());
    const width = Math.max(1, size.x);
    const height = Math.max(1, size.y);

    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    // Ground-truth ambient occlusion. The radius is in world metres, and at
    // DISPLAY_SCALE the vehicle is a ~24 m object in a 60 m room, so a half-
    // metre radius catches panel seams and the joints between beams without
    // darkening whole walls.
    gtao = new GTAOPass(scene, camera, width, height);
    gtao.output = GTAOPass.OUTPUT.Default;
    applyGtaoSettings(gtao, 'high');
    composer.addPass(gtao);

    // Bloom. Threshold is high so only genuine light sources bloom: a bright
    // white panel should stay a panel, or the whole image turns to haze.
    bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.34, 0.62, 0.92);
    composer.addPass(bloom);

    grade = new ShaderPass(GradeShader);
    composer.addPass(grade);

    // SMAA rather than FXAA: it keeps the long straight edges of railings and
    // beams sharp instead of smearing them, which is the whole point here.
    composer.addPass(new SMAAPass(width, height));

    // Tone mapping and colour space conversion, once, at the end. With a
    // composer the renderer no longer does this itself.
    composer.addPass(new OutputPass());
  } catch (error) {
    console.warn('Post-processing unavailable; rendering directly.', error);
    return null;
  }

  let quality: Quality = initial;

  const apply = (next: Quality): Quality => {
    quality = next;
    const full = next === 'high';
    // The fast path keeps grading and anti-aliasing, which are cheap and carry
    // most of the *style*, and drops the two passes that cost real frames.
    gtao.enabled = full;
    bloom.enabled = full;
    applyGtaoSettings(gtao, next);
    return quality;
  };
  apply(initial);

  return {
    composer,
    render: () => composer.render(),
    setSize: (width, height) => {
      // Clamp to 1: a minimised window reports zero, and a zero-sized render
      // target is invalid. EffectComposer.setSize already forwards to every
      // pass, so the passes that own targets do not need telling separately.
      composer.setSize(Math.max(1, width), Math.max(1, height));
    },
    setQuality: apply,
    get quality() { return quality; },
    dispose: () => {
      composer.dispose();
      gtao.dispose();
      bloom.dispose();
    },
  };
}

/**
 * AO tuning. Radius is world-space metres, so it is tied to the scene's scale
 * rather than to screen resolution.
 */
function applyGtaoSettings(pass: GTAOPass, quality: Quality): void {
  pass.updateGtaoMaterial({
    radius: 0.55,
    distanceExponent: 1.1,
    thickness: 0.4,
    scale: 1.0,
    // AO is low-frequency and the denoise pass that follows hides sample
    // noise, so 8 samples looks very close to 16 for half the work. This was
    // the most expensive pass in the stack.
    samples: quality === 'high' ? 8 : 4,
    screenSpaceRadius: false,
  });
}
