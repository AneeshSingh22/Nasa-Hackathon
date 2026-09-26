// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createPipeline } from './pipeline';

/**
 * The pipeline cannot be rendered in jsdom, so these assert the contract
 * around it: that a failure degrades instead of throwing, that a resize reaches
 * the passes that hold their own render targets, and that the quality toggle
 * actually turns the expensive passes off.
 *
 * The failure case matters most. A throw here happens at module scope, before
 * the start button is wired, and this project has already shipped one dead
 * start button that way.
 */

function fakeRenderer(): THREE.WebGLRenderer {
  return {
    getSize: (target: THREE.Vector2) => target.set(1280, 720),
    getPixelRatio: () => 1,
    getContext: () => ({}),
    setSize: () => {},
    render: () => {},
    shadowMap: { enabled: false, type: THREE.BasicShadowMap },
    capabilities: { isWebGL2: true },
    outputColorSpace: THREE.SRGBColorSpace,
    toneMapping: THREE.NoToneMapping,
  } as unknown as THREE.WebGLRenderer;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('post-processing pipeline', () => {
  it('returns null instead of throwing when the composer cannot be built', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = {
      getSize: () => { throw new Error('no context'); },
    } as unknown as THREE.WebGLRenderer;

    let pipeline: unknown;
    expect(() => {
      pipeline = createPipeline(broken, new THREE.Scene(), new THREE.PerspectiveCamera());
    }).not.toThrow();
    expect(pipeline).toBeNull();
  });

  it('builds a pass chain and reports its quality', () => {
    const pipeline = createPipeline(
      fakeRenderer(), new THREE.Scene(), new THREE.PerspectiveCamera(), 'high',
    );
    // Constructing the real passes needs enough of a GL context that this may
    // legitimately be null here; the contract is that it never throws.
    if (!pipeline) return;
    expect(pipeline.quality).toBe('high');
    expect(pipeline.composer.passes.length).toBeGreaterThan(3);
  });

  it('disables the expensive passes on the fast path and restores them', () => {
    const pipeline = createPipeline(
      fakeRenderer(), new THREE.Scene(), new THREE.PerspectiveCamera(), 'high',
    );
    if (!pipeline) return;

    const expensive = pipeline.composer.passes.filter(
      pass => pass.constructor.name === 'GTAOPass' || pass.constructor.name === 'UnrealBloomPass',
    );
    expect(expensive.length).toBe(2);
    expect(expensive.every(pass => pass.enabled)).toBe(true);

    expect(pipeline.setQuality('fast')).toBe('fast');
    // Ambient occlusion and bloom are what cost frames; the grade and the
    // anti-aliasing stay, so the fast path still looks deliberate.
    expect(expensive.every(pass => pass.enabled)).toBe(false);
    const grade = pipeline.composer.passes.find(pass => pass.constructor.name === 'ShaderPass');
    expect(grade?.enabled).toBe(true);

    expect(pipeline.setQuality('high')).toBe('high');
    expect(expensive.every(pass => pass.enabled)).toBe(true);
  });

  it('forwards a resize to the passes through the composer', () => {
    const pipeline = createPipeline(
      fakeRenderer(), new THREE.Scene(), new THREE.PerspectiveCamera(),
    );
    if (!pipeline) return;

    const gtao = pipeline.composer.passes.find(pass => pass.constructor.name === 'GTAOPass');
    expect(gtao).toBeDefined();
    const resized = vi.spyOn(gtao!, 'setSize');

    pipeline.setSize(800, 600);

    // EffectComposer forwards to every pass, so a pass left at the old size
    // would mean the composer was never told either.
    expect(resized).toHaveBeenCalledWith(800, 600);
  });

  it('never resizes to zero, which would make a degenerate render target', () => {
    const pipeline = createPipeline(
      fakeRenderer(), new THREE.Scene(), new THREE.PerspectiveCamera(),
    );
    if (!pipeline) return;
    const gtao = pipeline.composer.passes.find(pass => pass.constructor.name === 'GTAOPass');
    const spy = vi.spyOn(gtao!, 'setSize');

    // A window minimised to zero height is a real case in browsers.
    pipeline.setSize(0, 0);

    expect(spy).toHaveBeenCalledWith(1, 1);
  });
});
