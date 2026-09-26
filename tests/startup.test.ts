// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import pageHTML from '../index.html?raw';
import * as THREE from 'three';

/**
 * The start button must survive startup.
 *
 * It once rendered, focused and highlighted on hover while doing nothing,
 * because `new THREE.WebGLRenderer()` runs at module top level about 1 400
 * lines before the click handler is registered. A driver that refuses a WebGL
 * context threw there, the listener was never attached, and the player saw a
 * dead button with no message — indistinguishable from a slow machine.
 */

const stub2D = {
  fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
  closePath() {}, fill() {}, fillText() {},
} as unknown as CanvasRenderingContext2D;

/** Serve a WebGL context to the probe and a 2D context to the texture code. */
function mockContexts(webgl: boolean) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    function (this: HTMLCanvasElement, kind: string) {
      if (kind === 'webgl' || kind === 'webgl2') {
        return webgl ? ({} as unknown as WebGLRenderingContext) : null;
      }
      return stub2D;
    } as HTMLCanvasElement['getContext'],
  );
}

beforeEach(() => {
  vi.resetModules();
  document.documentElement.innerHTML = pageHTML;
  vi.spyOn(THREE.Clock.prototype, 'getDelta').mockReturnValue(1 / 60);
  vi.stubGlobal('requestAnimationFrame', () => 1);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('hides the overlay when the start button is clicked', async () => {
  mockContexts(true);
  vi.doMock('three', async importOriginal => {
    const actual = await importOriginal<typeof import('three')>();
    return { ...actual, WebGLRenderer: class {
      shadowMap = {};
      setPixelRatio() {} setSize() {} render() {} dispose() {}
    } };
  });
  await import('../src/main');

  const overlay = document.getElementById('start-overlay')!;
  const button = document.getElementById('start-button') as HTMLButtonElement;
  expect(overlay.classList.contains('hidden')).toBe(false);
  expect(button.disabled).toBe(false);

  button.click();

  // The single assertion that would have caught the dead button.
  expect(overlay.classList.contains('hidden')).toBe(true);
  expect(document.getElementById('hud')!.classList.contains('hidden')).toBe(false);
});

it('explains itself instead of dying silently when WebGL is unavailable', async () => {
  mockContexts(false);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  // The module throws on purpose once it has reported; the report is the point.
  await import('../src/main').catch(() => {});

  const overlay = document.getElementById('start-overlay')!;
  const notice = overlay.querySelector('.start-error');
  expect(notice).not.toBeNull();
  expect(notice!.textContent).toMatch(/WebGL/);
  // A button that cannot work must not look clickable.
  expect((document.getElementById('start-button') as HTMLButtonElement).disabled).toBe(true);
});
