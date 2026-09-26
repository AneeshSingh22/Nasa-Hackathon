// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { PlayerController } from '../vab/PlayerController';
import { WorkshopSession } from './session';
import { NODE_VALID_COLOR, NODE_INVALID_COLOR } from './nodes';
import { nodeTargets } from './attach';
import type { PartKind } from './parts';

let session: WorkshopSession;
let canvas: HTMLCanvasElement;
let chrome: HTMLElement;
let camera: THREE.PerspectiveCamera;
let player: PlayerController;
function event(target: EventTarget, type: string, x: number, y: number, button = 0) {
  const e = new MouseEvent(type, { clientX: x, clientY: y, button, cancelable: true });
  Object.defineProperty(e, 'pointerId', { value: 1 });
  target.dispatchEvent(e);
}
function aim(partId: string, nodeId: 'top' | 'bottom') {
  const node = nodeTargets(session.vessel.parts).find(n => n.partId === partId && n.nodeId === nodeId)!;
  const screen = session.pod.localToWorld(new THREE.Vector3(node.position.x, node.position.y, node.position.z)).project(camera);
  return { x: (screen.x + 1) * 600, y: (1 - screen.y) * 400 };
}
function select(kind: PartKind) { chrome.querySelector<HTMLButtonElement>(`[data-part="${kind}"]`)!.click(); }
function clickNode(partId: string, nodeId: 'top' | 'bottom' = 'bottom') {
  const { x, y } = aim(partId, nodeId);
  event(canvas, 'pointermove', x, y);
  event(canvas, 'pointerdown', x, y);
  event(canvas, 'pointerup', x, y);
  event(window, 'pointerup', x, y);
}
function color(partId: string, nodeId: string): number {
  const mesh = session.pod.getObjectByName(`${partId}:${nodeId}`) as THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  return mesh.material.color.getHex();
}
function press(code: string) { session.handleKey(new KeyboardEvent('keydown', { code, cancelable: true })); }

beforeEach(() => {
  canvas = document.createElement('canvas');
  chrome = document.createElement('section');
  chrome.innerHTML = '<button>Return to bay</button>';
  const hud = document.createElement('div');
  document.body.append(canvas, chrome, hud);
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, right: 1200, bottom: 800,
    width: 1200, height: 800, x: 0, y: 0, toJSON() {} });
  Object.defineProperty(canvas, 'clientHeight', { value: 800 });
  camera = new THREE.PerspectiveCamera(72, 1.5, 0.1, 400);
  player = new PlayerController(camera, { minX: -29, maxX: 29, minZ: -22, maxZ: 22 });
  player.update(0);
  const root = new THREE.Group(); root.position.y = 1.6;
  session = new WorkshopSession(player, root, canvas, hud, chrome);
  session.enter();
});
afterEach(() => { session.dispose(); document.body.replaceChildren(); vi.restoreAllMocks(); });

describe('Workshop assembly input and visuals', () => {
  it('shows only stubs and tooltips; rejects red engine hover then snaps green tank and engine', () => {
    expect(chrome.querySelectorAll('[data-part]')).toHaveLength(2);
    expect(chrome.querySelector('#specs-liquid-engine')!.textContent).toMatch(/150,000.*400 kg wet/);
    select('liquid-engine');
    const point = aim('pod', 'bottom');
    event(canvas, 'pointermove', point.x, point.y);
    expect(color('pod', 'bottom')).toBe(NODE_INVALID_COLOR);
    expect(chrome.querySelector('.workshop-status')!.textContent).toContain('below a tank');
    clickNode('pod');
    expect(session.vessel.parts).toHaveLength(1);
    expect(session.builder!.placement.active).toBe(true);
    select('fuel-tank');
    event(canvas, 'pointermove', point.x, point.y);
    expect(color('pod', 'bottom')).toBe(NODE_VALID_COLOR);
    const ghost = session.pod.getObjectByName('Placement ghost')!;
    expect(ghost.position.y).toBeCloseTo(-2.4);
    const cameraBeforeClick = camera.position.clone();
    clickNode('pod');
    expect(session.vessel.parts).toHaveLength(2);
    expect(session.builder!.placement.active).toBe(false);
    expect(session.pod.getObjectByName('Placement ghost')).toBeUndefined();
    const tank = session.vessel.parts[1]!;
    expect(session.pod.children.find(child => child.userData.workshopPartId === tank.id)?.position.y).toBeCloseTo(-2.4);
    expect(camera.position.equals(cameraBeforeClick)).toBe(false); // reframe the growing craft
    select('liquid-engine'); clickNode(tank.id);
    expect(session.vessel.parts).toHaveLength(3);
    expect(chrome.querySelector('output')!.textContent).toContain('$830,000');
    expect(chrome.querySelector('output')!.textContent).toContain('3.40 t');
    // Engine rendering and analysis must follow the exact same part state.
    const engine = session.vessel.parts[2]!;
    expect(session.pod.children.find(child => child.userData.workshopPartId === engine.id)?.position.y).toBeCloseTo(-4.2);
    press('KeyQ');
    expect(session.vessel.parts).toHaveLength(2);
    expect(chrome.querySelector('output')!.textContent).toContain('$680,000');
    select('liquid-engine');
    expect(color(tank.id, 'bottom')).toBe(NODE_VALID_COLOR);
    clickNode(tank.id);
    expect(session.vessel.parts).toHaveLength(3);
  });

  it('does not attach outside snap radius or orbit while placing; pan and zoom remain available', () => {
    select('fuel-tank');
    const before = camera.position.clone();
    event(canvas, 'pointerdown', 1100, 200);
    event(window, 'pointermove', 1000, 200);
    event(canvas, 'pointerup', 1000, 200);
    event(window, 'pointerup', 1000, 200);
    expect(session.vessel.parts).toHaveLength(1);
    expect(camera.position.equals(before)).toBe(true);
    event(canvas, 'pointerdown', 700, 300, 2);
    event(window, 'pointermove', 720, 315, 2);
    event(window, 'pointerup', 720, 315, 2);
    expect(camera.position.distanceTo(before)).toBeGreaterThan(0.1);
    const beforeZoom = camera.position.clone();
    const wheel = new WheelEvent('wheel', { deltaY: 100, cancelable: true });
    canvas.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(camera.position.distanceTo(beforeZoom)).toBeGreaterThan(0.1);
    press('Escape');
    expect(session.mode).toBe('workshop');
    expect(session.builder!.placement.active).toBe(false);
    const beforeOrbit = camera.position.clone();
    event(canvas, 'pointerdown', 700, 300);
    event(window, 'pointermove', 800, 300);
    event(window, 'pointerup', 800, 300);
    expect(camera.position.distanceTo(beforeOrbit)).toBeGreaterThan(1);
  });

  it('removes only leaves, clears placement and listeners on exit, and resets cleanly on re-entry', () => {
    select('fuel-tank'); clickNode('pod');
    press('Backspace'); press('KeyQ');
    expect(session.vessel.parts).toHaveLength(1);
    select('fuel-tank');
    press('Escape');
    expect(session.mode).toBe('workshop');
    press('Escape');
    expect(session.mode).toBe('explore');
    expect(session.pod.parent).toBeNull();
    expect(chrome.querySelector('.workshop-palette')).toBeNull();
    const exploreCamera = camera.position.clone();
    event(canvas, 'pointerdown', 600, 400);
    event(window, 'pointermove', 900, 500);
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 500 }));
    expect(camera.position.equals(exploreCamera)).toBe(true);
    session.enter(); select('fuel-tank'); clickNode('pod');
    expect(session.vessel.parts).toHaveLength(2);
    expect(chrome.querySelectorAll('.workshop-palette')).toHaveLength(1);
    select('liquid-engine');
    chrome.querySelector<HTMLButtonElement>('button')!.click();
    expect(session.mode).toBe('explore');
    expect(session.pod.getObjectByName('Placement ghost')).toBeUndefined();
    expect(session.vessel.parts).toHaveLength(1);
  });

  it('keeps the longest supported hanging craft within the camera view after edits', () => {
    let parent = 'pod';
    for (let i = 0; i < 3; i++) {
      select('fuel-tank'); clickNode(parent);
      parent = session.vessel.parts.at(-1)!.id;
    }
    select('liquid-engine'); clickNode(parent);
    expect(session.vessel.parts).toHaveLength(5);
    const box = new THREE.Box3().setFromObject(session.pod);
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const projected = new THREE.Vector3(x, y, z).project(camera);
      expect(Math.abs(projected.x)).toBeLessThan(1);
      expect(Math.abs(projected.y)).toBeLessThan(1);
    }
    expect(box.min.y).toBeGreaterThan(1.6);
  });
});
