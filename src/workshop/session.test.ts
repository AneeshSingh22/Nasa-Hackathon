// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { PlayerController } from '../vab/PlayerController';
import { WorkshopSession } from './session';

const bounds = { minX: -29, maxX: 29, minZ: -22, maxZ: 22 };

describe('Explore / Workshop handoff', () => {
  let player: PlayerController;
  let session: WorkshopSession;
  let root: THREE.Group;
  let canvas: HTMLCanvasElement;
  let hud: HTMLElement;
  let chrome: HTMLElement;
  let detach: () => void;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    hud = document.createElement('div');
    chrome = document.createElement('section');
    chrome.innerHTML = '<button>Return to bay</button>';
    chrome.classList.add('hidden');
    document.body.append(canvas, hud, chrome);
    player = new PlayerController(new THREE.PerspectiveCamera(), bounds);
    detach = player.attach(canvas);
    player.update(0);
    root = new THREE.Group();
    root.position.y = 1.6;
    session = new WorkshopSession(player, root, canvas, hud, chrome);
  });
  afterEach(() => {
    session.dispose();
    detach();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('parents one pod in world space, hides the old stack and restores it on exit', () => {
    const oldPart = new THREE.Group();
    const alreadyHidden = new THREE.Group();
    alreadyHidden.visible = false;
    root.add(oldPart, alreadyHidden);
    const crane = new THREE.Group();
    const releaseLock = vi.spyOn(player, 'releaseLock');
    const savedPosition = player.camera.position.clone();
    const savedRotation = player.camera.quaternion.clone();
    expect(session.mode).toBe('explore');
    session.enter([crane]);
    session.enter([crane]);
    expect(session.mode).toBe('workshop');
    expect(releaseLock).toHaveBeenCalledTimes(1);
    expect(session.pod.parent).toBe(root);
    const podWorld = session.pod.getWorldPosition(new THREE.Vector3());
    expect(podWorld.y).toBeGreaterThanOrEqual(8);
    expect(podWorld.y).toBeLessThanOrEqual(15);
    const bounds = new THREE.Box3().setFromObject(session.pod);
    expect(bounds.min.y).toBeGreaterThan(root.position.y + 5);
    expect(player.camera.position.distanceTo(podWorld)).toBeGreaterThan(5);
    const projected = podWorld.clone().project(player.camera);
    expect(projected.x).toBeCloseTo(0);
    expect(projected.y).toBeCloseTo(0);
    expect(root.children).toHaveLength(3);
    expect(oldPart.visible).toBe(false);
    expect(crane.visible).toBe(false);
    expect(session.orbit.target.distanceTo(session.pod.getWorldPosition(new THREE.Vector3()))).toBe(0);
    expect(hud.classList.contains('hidden')).toBe(true);
    expect(chrome.classList.contains('hidden')).toBe(false);
    session.handleKey(new KeyboardEvent('keydown', { code: 'Escape' }));
    expect(session.mode).toBe('explore');
    expect(session.pod.parent).toBeNull();
    expect(oldPart.visible).toBe(true);
    expect(alreadyHidden.visible).toBe(false);
    expect(crane.visible).toBe(true);
    expect(player.camera.position.equals(savedPosition)).toBe(true);
    expect(player.camera.quaternion.equals(savedRotation)).toBe(true);
    expect(hud.classList.contains('hidden')).toBe(false);
    expect(chrome.classList.contains('hidden')).toBe(true);
  });

  it('blocks legacy shortcuts, FPS movement/look and pointer lock in Workshop', () => {
    const requestLock = vi.fn();
    canvas.requestPointerLock = requestLock;
    const bodyPosition = player.position.clone();
    session.enter();
    for (const code of ['KeyE', 'KeyQ', 'KeyR', 'KeyF', 'KeyG', 'KeyT', 'Tab']) {
      expect(session.handleKey(new KeyboardEvent('keydown', { code }))).toBe(true);
    }
    const workshopPosition = player.camera.position.clone();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
    const mouse = new MouseEvent('mousemove');
    Object.defineProperties(mouse, { movementX: { value: 200 }, movementY: { value: 100 } });
    document.dispatchEvent(mouse);
    player.requestLock(canvas);
    player.update(1);
    expect(requestLock).not.toHaveBeenCalled();
    expect(player.position.equals(bodyPosition)).toBe(true);
    expect(player.camera.position.equals(workshopPosition)).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    session.exit();
    player.update(0);
    expect(player.lookDirection().distanceTo(new THREE.Vector3(0, 0, -1))).toBeLessThan(1e-6);
    expect(session.handleKey(new KeyboardEvent('keydown', { code: 'KeyE' }))).toBe(false);
    player.requestLock(canvas);
    expect(requestLock).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    player.update(0.2);
    expect(player.position.z).toBeLessThan(bodyPosition.z);
  });

  it('tracks key releases while disabled and supports exit button across repeated visits', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    const start = player.position.clone();
    for (let i = 0; i < 3; i++) {
      session.enter();
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
      chrome.querySelector('button')!.click();
      expect(session.mode).toBe('explore');
      player.update(0.1);
      expect(player.position.equals(start)).toBe(true);
      const wheel = new WheelEvent('wheel', { deltaY: 100, cancelable: true });
      canvas.dispatchEvent(wheel);
      expect(wheel.defaultPrevented).toBe(false);
    }
  });
});
