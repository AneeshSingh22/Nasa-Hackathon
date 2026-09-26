import { afterEach, expect, it, vi } from 'vitest';
import pageHTML from '../index.html?raw';
import * as THREE from 'three';
import type { PlayerController } from '../src/vab/PlayerController';
import { STATIONS } from '../src/vab/stations';

const state = vi.hoisted(() => ({
  player: null as PlayerController | null,
  render: vi.fn(),
  nextFrame: null as FrameRequestCallback | null,
}));

vi.mock('three', async importOriginal => {
  const actual = await importOriginal<typeof import('three')>();
  return {
    ...actual,
    WebGLRenderer: class {
      shadowMap = {};
      setPixelRatio() {}
      setSize() {}
      render = state.render;
      dispose() {}
    },
  };
});
vi.mock('../src/vab/PlayerController', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/vab/PlayerController')>();
  return { PlayerController: class extends actual.PlayerController {
    constructor(...args: ConstructorParameters<typeof actual.PlayerController>) {
      super(...args);
      state.player = this;
    }
  } };
});

function key(code: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, cancelable: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code }));
}
function frames(count = 8) {
  for (let i = 0; i < count; i++) state.nextFrame?.(0);
}
function text(id: string) { return document.getElementById(id)!.textContent; }
function hidden(id: string) { return document.getElementById(id)!.classList.contains('hidden'); }

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('retires station inputs and walks spawn → Workshop → floating pod → Esc through main wiring', async () => {
  vi.useFakeTimers();
  document.documentElement.innerHTML = pageHTML;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
    closePath() {}, fill() {}, fillText() {},
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(THREE.Clock.prototype, 'getDelta').mockReturnValue(1 / 60);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { state.nextFrame = callback; return 1; });
  await import('../src/main');
  document.getElementById('start-button')!.click();
  const player = state.player!;
  const initialResources = ['res-budget', 'res-days', 'res-conf'].map(text);
  const scene = state.render.mock.calls.at(-1)![0] as THREE.Scene;

  for (const station of STATIONS) {
    player.position.set(station.x, 1.72, station.z);
    frames();
    for (const code of ['KeyE', 'Tab', 'KeyQ', 'KeyR', 'KeyG', 'KeyF']) key(code);
    frames(400); // A legacy crane would finish within these frames.
    expect(hidden('options')).toBe(true);
    expect(hidden('inspector')).toBe(true);
    expect(hidden('carrying')).toBe(true);
    expect(text('prompt-text')).toContain('Workshop');
    expect(text('stack-state')).toBe('Empty stand');
    expect(['res-budget', 'res-days', 'res-conf'].map(text)).toEqual(initialResources);
  }
  key('KeyT');
  expect(text('capcom-text')).toContain('workshop');
  key('KeyH');
  expect(text('help')).not.toMatch(/numbered stations|collect a part|fit the payload/i);
  key('KeyH');

  player.position.set(0, 1.72, 14);
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
  frames(35);
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
  frames();
  expect(text('prompt-text')).toBe('Enter the workshop to build');
  const explorePosition = player.camera.position.clone();
  key('KeyE');
  frames();
  expect(hidden('workshop')).toBe(false);
  expect(hidden('hud')).toBe(true);
  const pod = scene.getObjectByName('Workshop Command Pod')!;
  expect(pod).toBeDefined();
  expect(pod.getWorldPosition(new THREE.Vector3()).y).toBeGreaterThan(8);
  for (const code of ['KeyE', 'KeyQ', 'KeyR', 'Tab', 'KeyF']) key(code);
  expect(['res-budget', 'res-days', 'res-conf'].map(text)).toEqual(initialResources);
  key('Escape');
  expect(hidden('workshop')).toBe(true);
  expect(hidden('hud')).toBe(false);
  expect(scene.getObjectByName('Workshop Command Pod')).toBeUndefined();
  expect(player.camera.position.distanceTo(explorePosition)).toBeLessThan(1e-6);
  key('KeyE');
  expect(hidden('workshop')).toBe(false);
  document.querySelector<HTMLButtonElement>('#workshop button')!.click();
  expect(hidden('workshop')).toBe(true);
});
