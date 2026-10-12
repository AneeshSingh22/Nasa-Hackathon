import { afterEach, expect, it, vi } from 'vitest';
import pageHTML from '../index.html?raw';
import * as THREE from 'three';
import type { PlayerController } from '../src/vab/PlayerController';

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
function text(id: string) {
  const node = document.getElementById(id)!;
  return id === 'res-budget' ? node.getAttribute('aria-label') : node.textContent;
}
function hidden(id: string) { return document.getElementById(id)!.classList.contains('hidden'); }

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('opens the isometric hub, builds via the platform button, and returns with the paid craft', async () => {
  vi.useFakeTimers();
  document.documentElement.innerHTML = pageHTML;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
    closePath() {}, fill() {}, fillText() {},
  } as unknown as CanvasRenderingContext2D);
  const clockDelta = vi.spyOn(THREE.Clock.prototype, 'getDelta').mockReturnValue(1 / 60);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { state.nextFrame = callback; return 1; });
  await import('../src/main');
  document.getElementById('start-button')!.click();
  frames();
  const player = state.player!;
  const initialBudget = text('res-budget');
  const scene = state.render.mock.calls.at(-1)![0] as THREE.Scene;
  const hubCamera = state.render.mock.calls.at(-1)![1] as THREE.OrthographicCamera;
  expect(hubCamera.isOrthographicCamera).toBe(true);
  expect(hidden('hud')).toBe(false);
  expect(hidden('workshop')).toBe(true);
  expect(document.getElementById('hub-build-button')!.style.left).not.toBe('');

  // Cursor and view stay fixed, and old assembly shortcuts spend no resources.
  const initialPosition = player.position.clone();
  const initialView = hubCamera.position.clone();
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
  document.getElementById('viewport')!.dispatchEvent(new MouseEvent('click'));
  frames(40);
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
  for (const code of ['Tab', 'KeyQ', 'KeyR', 'KeyG', 'KeyF']) key(code);
  expect(player.position.distanceTo(initialPosition)).toBe(0);
  expect(hubCamera.position.distanceTo(initialView)).toBe(0);
  expect(player.isLocked).toBe(false);
  expect(text('res-budget')).toBe(initialBudget);
  expect(hidden('options')).toBe(true);
  expect(hidden('carrying')).toBe(true);
  expect((document.getElementById('hub-launch-button') as HTMLButtonElement).disabled).toBe(true);
  expect(document.querySelector('#resources header')!.textContent).toContain('Program Status');
  expect(document.getElementById('res-mission')).toBeNull();
  clockDelta.mockReturnValue(20);
  frames(1);
  expect(text('res-days')).toBe('23');
  expect(text('res-time')).toBe('7:40');
  clockDelta.mockReturnValue(1 / 60);

  document.getElementById('hub-build-button')!.click();
  frames();
  expect(hidden('workshop')).toBe(false);
  expect(hidden('hud')).toBe(true);
  clockDelta.mockReturnValue(20);
  frames(1);
  expect(text('res-days')).toBe('22');
  expect(text('workshop-build-time')).toBe('7:20');
  clockDelta.mockReturnValue(1 / 60);
  expect((state.render.mock.calls.at(-1)![1] as THREE.PerspectiveCamera).isPerspectiveCamera).toBe(true);
  expect(document.querySelectorAll('[data-kind="tank"]').length).toBeGreaterThan(2);
  document.querySelector<HTMLButtonElement>('[data-part="probe-core"]')!.click();
  // Picking is reversible and costs nothing; Esc first cancels it, then exits.
  expect(text('res-budget')).toEqual(initialBudget);
  key('Escape'); expect(hidden('workshop')).toBe(false);
  document.querySelector<HTMLButtonElement>('[data-part="probe-core"]')!.click();
  document.querySelector<HTMLButtonElement>('[data-port="root"]')!.click();
  expect(scene.getObjectByName('probe-core')).toBeDefined();
  expect(text('res-budget')).not.toEqual(initialBudget);

  document.getElementById('workshop-contract-toggle')!.click();
  expect(document.getElementById('workshop-contract-monitor')!.contains(document.getElementById('contract'))).toBe(true);
  expect(document.getElementById('workshop-contract-monitor')!.hidden).toBe(false);
  key('Escape');
  expect(document.getElementById('hud')!.contains(document.getElementById('contract'))).toBe(true);
  frames();
  expect(hidden('workshop')).toBe(true);
  expect(hidden('hud')).toBe(false);
  expect(scene.getObjectByName('probe-core')!.visible).toBe(true);
  expect(state.render.mock.calls.at(-1)![1]).toBe(hubCamera);
  expect(document.activeElement?.id).toBe('hub-build-button');
  key('KeyE');
  expect(hidden('workshop')).toBe(false);
  document.querySelector<HTMLButtonElement>('#workshop button')!.click();
  frames();
  expect(hidden('workshop')).toBe(true);
  clockDelta.mockReturnValue(480);
  frames(1);
  expect(hidden('failure')).toBe(false);
  expect(text('res-days')).toBe('0');
  expect(text('res-time')).toBe('0:00');
  document.getElementById('fail-retry')!.click();
  expect(hidden('failure')).toBe(true);
  expect(text('res-days')).toBe('24');
  expect(text('res-time')).toBe('8:00');
  expect(player.isLocked).toBe(false);
});
