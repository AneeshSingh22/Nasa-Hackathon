// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { hullPlating, bayFloor, paintedSteel, setRepeat, clearTextureCache } from './textures';

/**
 * jsdom has no real canvas, so these drive the generators against a recording
 * stub and assert *what was drawn* rather than that pixels changed — the same
 * approach `tests/blueprint.test.ts` uses, and for the same reason: without it
 * there is no way to tell a drawing bug from a scene-graph bug.
 */

interface Call { readonly method: string; readonly args: readonly unknown[] }

function recordingContext(calls: Call[]): CanvasRenderingContext2D {
  const record = (method: string) => (...args: unknown[]) => { calls.push({ method, args }); };
  const size = 8;
  return {
    fillRect: record('fillRect'),
    strokeRect: record('strokeRect'),
    beginPath: record('beginPath'),
    arc: record('arc'),
    fill: record('fill'),
    stroke: record('stroke'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    closePath: record('closePath'),
    fillText: record('fillText'),
    putImageData: record('putImageData'),
    createLinearGradient: (...args: unknown[]) => {
      calls.push({ method: 'createLinearGradient', args });
      return { addColorStop: record('addColorStop') } as unknown as CanvasGradient;
    },
    getImageData: () => ({
      data: new Uint8ClampedArray(size * size * 4).fill(128),
      width: size,
      height: size,
    }) as ImageData,
    createImageData: () => ({
      data: new Uint8ClampedArray(size * size * 4),
      width: size,
      height: size,
    }) as ImageData,
  } as unknown as CanvasRenderingContext2D;
}

function install(calls: Call[]) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(recordingContext(calls) as unknown as RenderingContext);
}

afterEach(() => {
  vi.restoreAllMocks();
  clearTextureCache();
});

describe('procedural surface detail', () => {
  it('draws panel seams, fasteners and wear into the hull plating', () => {
    const calls: Call[] = [];
    install(calls);

    const maps = hullPlating(1, 8);
    expect(maps).not.toBeNull();

    const methods = calls.map(call => call.method);
    // Seams are strokes; fasteners are arcs; streaks are gradients. All three
    // carry the "manufactured" read, and losing any one of them silently
    // flattens the surface.
    expect(methods).toContain('stroke');
    expect(methods).toContain('arc');
    expect(methods).toContain('createLinearGradient');
    // A normal map has to be written back, or seams stay painted-on stripes.
    expect(methods).toContain('putImageData');
  });

  it('returns a colour, normal and roughness map that tile', () => {
    install([]);
    const maps = hullPlating(2, 8)!;
    for (const texture of [maps.map, maps.normalMap, maps.roughnessMap]) {
      expect(texture).toBeInstanceOf(THREE.CanvasTexture);
      expect(texture.wrapS).toBe(THREE.RepeatWrapping);
      expect(texture.wrapT).toBe(THREE.RepeatWrapping);
    }
  });

  it('sets tiling on every map, not only the colour', () => {
    install([]);
    const maps = bayFloor(8)!;
    setRepeat(maps, 7, 6);
    // A normal map left at 1x1 while the colour tiles 7x6 produces lighting
    // that disagrees with the visible surface.
    for (const texture of [maps.map, maps.normalMap, maps.roughnessMap]) {
      expect(texture.repeat.x).toBe(7);
      expect(texture.repeat.y).toBe(6);
    }
  });

  it('is deterministic, so a rebuild does not reshuffle the surface', () => {
    const first: Call[] = [];
    install(first);
    hullPlating(4, 8);
    vi.restoreAllMocks();
    clearTextureCache();

    const second: Call[] = [];
    install(second);
    hullPlating(4, 8);

    expect(second.length).toBe(first.length);
    expect(second.map(c => c.method)).toEqual(first.map(c => c.method));
  });

  it('caches, so a shared material does not redraw the same texture', () => {
    install([]);
    const once = hullPlating(9, 8);
    const twice = hullPlating(9, 8);
    expect(twice).toBe(once);
  });

  it('degrades to null rather than throwing when the context is incomplete', () => {
    // A stubbed or locked-down 2D context must not take the game down: a
    // startup throw is how the start button once ended up dead.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({ fillRect() {} } as unknown as RenderingContext);

    expect(() => hullPlating(1, 8)).not.toThrow();
    expect(hullPlating(1, 8)).toBeNull();
    expect(bayFloor(8)).toBeNull();
    expect(paintedSteel('#333', 1, 8)).toBeNull();
  });

  it('degrades to null when there is no 2D context at all', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(hullPlating(1, 8)).toBeNull();
  });
});
