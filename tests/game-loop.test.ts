import { afterEach, expect, it, vi } from 'vitest';
import pageHTML from '../index.html?raw';
import * as THREE from 'three';
import type { PlayerController } from '../src/vab/PlayerController';

/**
 * The whole game loop, through the real main.ts wiring: choose a contract,
 * build a rocket, fly it, earn stars, return to the board and find the next
 * contract open.
 *
 * Every piece of this has its own unit tests. This exists because the seams
 * between them are where the bugs were: a flight that disabled the walking
 * controller and never re-enabled it, so a retry left the player frozen with
 * no HUD, was invisible to every unit test and obvious to anyone who played
 * twice.
 */

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
const $ = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const hidden = (id: string) => document.getElementById(id)!.classList.contains('hidden');

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('plays a contract from the board to stars and back to the next contract', async () => {
  vi.useFakeTimers();
  // jsdom without a page URL has no localStorage; an in-memory one exercises
  // the real save path.
  const saved = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => saved.get(k) ?? null,
    setItem: (k: string, v: string) => { saved.set(k, v); },
    removeItem: (k: string) => { saved.delete(k); },
    clear: () => saved.clear(),
  });
  document.documentElement.innerHTML = pageHTML;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
    closePath() {}, fill() {}, fillText() {},
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(THREE.Clock.prototype, 'getDelta').mockReturnValue(1 / 60);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    state.nextFrame = callback;
    return 1;
  });
  await import('../src/main');

  // ---- the board ----
  expect(hidden('start-overlay')).toBe(false);
  expect(document.querySelectorAll('.board-card')).toHaveLength(4);
  expect($('#start-button').textContent).toBe('Accept · Relay Run');
  expect($<HTMLButtonElement>('[data-contract="first-orbit"]').disabled).toBe(true);

  $<HTMLButtonElement>('#start-button').click();
  expect(hidden('hud')).toBe(false);
  // The contract sets the budget.
  expect($('#res-budget').getAttribute('aria-label')).toBe('420 million dollars available');

  // ---- the workshop ----
  const player = state.player!;
  $<HTMLButtonElement>('#hub-build-button').click();
  frames();
  expect(hidden('workshop')).toBe(false);

  for (const id of ['probe-core', 'kerolox-tank', 'kerolox-engine', 'compact-tank', 'swift-engine', 'comms-probe', 'fairing']) {
    $<HTMLButtonElement>(`[data-part="${id}"]`).click();
    const port = id === 'probe-core' ? 'root' : id === 'comms-probe' ? 'upper' : id === 'fairing' ? 'upper' : 'lower';
    $<HTMLButtonElement>(`[data-port="${port}"]`).click();
    frames(2);
  }
  expect($<HTMLElement>('.mission-verdict').dataset.verdict).toBe('go');
  expect($('.mission-verdict').textContent).toContain('Par $340M');

  // ---- the flight ----
  expect($<HTMLButtonElement>('#hub-launch-button').disabled).toBe(false);
  expect($<HTMLElement>('#hub-launch-button').dataset.ready).toBe('true');
  const buildTime = $('#res-time').textContent;
  $<HTMLButtonElement>('#hub-launch-button').click();
  frames();
  expect(hidden('flight')).toBe(false);
  expect(hidden('hub-launch-button')).toBe(true);
  key('KeyG'); // autopilot, which also lights the engines
  for (let i = 0; i < 3; i++) key('Period'); // warp x8 once flying
  for (let i = 0; i < 20_000 && hidden('success'); i++) {
    frames(1);
    // Warp only takes once the engines are lit; keep asking until it does.
    if (i === 200) for (let k = 0; k < 3; k++) key('Period');
  }
  expect(hidden('success')).toBe(false);
  expect($('#res-time').textContent).toBe(buildTime);
  expect($('#success h1').textContent).toBe('Orbit achieved');

  // Two stars: orbit and under par. Not three, because the autopilot flew it.
  vi.advanceTimersByTime(3_000);
  expect(document.querySelectorAll('.rating-row.earned')).toHaveLength(2);
  expect($('#win-note').textContent).toMatch(/New best: 2 of 3/);

  // ---- back to the board ----
  $<HTMLButtonElement>('#win-again').click();
  expect(hidden('start-overlay')).toBe(false);
  expect($('[data-contract="relay"]').querySelectorAll('.card-stars i.earned')).toHaveLength(2);
  // Winning the relay opens the next contract, and the board moves you to it.
  expect($<HTMLButtonElement>('[data-contract="first-orbit"]').disabled).toBe(false);
  expect($('#start-button').textContent).toBe('Accept · First Orbit');
  // And it survives a reload.
  expect(localStorage.getItem('adastra.campaign.v1')).toContain('"relay":2');

  $<HTMLButtonElement>('#start-button').click();
  expect(hidden('hud')).toBe(false);
  expect($('#res-budget').getAttribute('aria-label')).toBe('480 million dollars available');

  // Returning from a flight restores the usable hub and platform action.
  const before = player.position.clone();
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS' }));
  frames(20);
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyS' }));
  expect(player.position.distanceTo(before)).toBe(0);
  expect((state.render.mock.calls.at(-1)![1] as THREE.OrthographicCamera).isOrthographicCamera).toBe(true);
  $<HTMLButtonElement>('#hub-build-button').click();
  frames();
  expect(hidden('workshop')).toBe(false);
}, 120_000);
