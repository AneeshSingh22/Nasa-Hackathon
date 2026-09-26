import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { configureRenderer, installEnvironment, applyEnvironmentIntensity } from './lookDev';

/**
 * The look is a feature, and it regresses silently: nothing throws when the
 * environment map goes missing, the metals just quietly turn to plastic. These
 * assert the settings that carry it.
 */

function fakeRenderer() {
  return {
    outputColorSpace: THREE.LinearSRGBColorSpace,
    toneMapping: THREE.NoToneMapping,
    toneMappingExposure: 1,
    shadowMap: { enabled: false, type: THREE.BasicShadowMap },
  } as unknown as THREE.WebGLRenderer;
}

describe('look development', () => {
  it('renders into sRGB with filmic tone mapping', () => {
    const renderer = fakeRenderer();
    configureRenderer(renderer);
    // Without this the lighting maths is written to the display untouched,
    // which is what made everything look washed out and muddy at once.
    expect(renderer.outputColorSpace).toBe(THREE.SRGBColorSpace);
    expect(renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expect(renderer.toneMappingExposure).toBeLessThan(1);
    expect(renderer.shadowMap.enabled).toBe(true);
    expect(renderer.shadowMap.type).toBe(THREE.VSMShadowMap);
  });

  it('survives a renderer that cannot prefilter, without throwing', () => {
    // A startup throw here would leave the start button dead, which is a bug
    // this project has already paid for once.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const scene = new THREE.Scene();
    expect(() => installEnvironment(fakeRenderer(), scene)).not.toThrow();
    expect(installEnvironment(fakeRenderer(), scene)).toBeNull();
    vi.restoreAllMocks();
  });

  it('sets environment intensity on every standard material it finds', () => {
    const group = new THREE.Group();
    const lit = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial({ metalness: 0.9 }),
    );
    // A multi-material mesh must not be skipped.
    const multi = new THREE.Mesh(new THREE.BoxGeometry(), [
      new THREE.MeshStandardMaterial(),
      new THREE.MeshBasicMaterial(),
    ]);
    group.add(lit, multi);

    applyEnvironmentIntensity(group, 0.8);

    expect((lit.material as THREE.MeshStandardMaterial).envMapIntensity).toBe(0.8);
    const first = (multi.material as THREE.Material[])[0] as THREE.MeshStandardMaterial;
    expect(first.envMapIntensity).toBe(0.8);
    // A basic material has no such property and must be left alone.
    expect('envMapIntensity' in (multi.material as THREE.Material[])[1]!).toBe(false);
  });
});
