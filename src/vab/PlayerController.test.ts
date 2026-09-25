import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { PlayerController } from './PlayerController';

/**
 * These tests exist because first-person movement broke in a way that was
 * invisible from the code: the maths was correct but the starting yaw faced the
 * back wall six metres away, so walking forward felt like not walking at all.
 *
 * They drive the controller directly rather than through a browser, which keeps
 * them fast and means a regression in the movement frame is caught by
 * `npm test` instead of by a player.
 */

const BOUNDS = { minX: -22, maxX: 22, minZ: -19, maxZ: 19 };

/** Press keys on the controller by dispatching real keyboard events. */
function hold(...codes: string[]): void {
  for (const code of codes) {
    window.dispatchEvent(new KeyboardEvent('keydown', { code }));
  }
}
function release(...codes: string[]): void {
  for (const code of codes) {
    window.dispatchEvent(new KeyboardEvent('keyup', { code }));
  }
}

/** Run the controller for a simulated duration at 60 fps. */
function simulate(player: PlayerController, seconds: number): void {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) player.update(1 / 60);
}

describe('PlayerController', () => {
  let camera: THREE.PerspectiveCamera;
  let player: PlayerController;
  let detach: () => void;

  beforeEach(() => {
    camera = new THREE.PerspectiveCamera(72, 1.6, 0.1, 400);
    player = new PlayerController(camera, BOUNDS);
    // The controller only needs an element to hang mousedown on and to compare
    // against document.pointerLockElement.
    const element = document.createElement('canvas');
    detach = player.attach(element);
    return () => {
      detach();
      release('KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft');
    };
  });

  it('starts at eye height, facing the assembly stand', () => {
    player.update(1 / 60);
    // Eye height for a standing adult, not floor level.
    expect(camera.position.y).toBeGreaterThan(1.5);
    expect(camera.position.y).toBeLessThan(1.9);

    // The player stands at +Z and the stand is at the origin, so the view
    // direction must have a negative Z component. Getting this backwards is
    // the exact bug these tests were written for.
    const look = player.lookDirection();
    expect(look.z).toBeLessThan(-0.9);
  });

  it('walks toward the stand when W is held', () => {
    const startZ = player.position.z;
    hold('KeyW');
    simulate(player, 1);
    release('KeyW');

    // Moving forward must reduce Z, taking the player toward the rocket.
    expect(player.position.z).toBeLessThan(startZ - 2);
  });

  it('walks backward when S is held', () => {
    const startZ = player.position.z;
    hold('KeyS');
    simulate(player, 0.5);
    release('KeyS');
    expect(player.position.z).toBeGreaterThan(startZ);
  });

  it('strafes sideways without moving forward', () => {
    const start = player.position.clone();
    hold('KeyD');
    simulate(player, 1);
    release('KeyD');

    // D at the starting yaw moves along +X, and Z should barely change.
    expect(player.position.x).toBeGreaterThan(start.x + 2);
    expect(Math.abs(player.position.z - start.z)).toBeLessThan(0.5);
  });

  it('runs faster than it walks', () => {
    hold('KeyW');
    simulate(player, 1);
    const walked = Math.abs(player.position.z - 14);
    release('KeyW');

    const runner = new PlayerController(new THREE.PerspectiveCamera(), BOUNDS);
    const detachRunner = runner.attach(document.createElement('canvas'));
    hold('KeyW', 'ShiftLeft');
    simulate(runner, 1);
    const ran = Math.abs(runner.position.z - 14);
    release('KeyW', 'ShiftLeft');
    detachRunner();

    expect(ran).toBeGreaterThan(walked * 1.3);
  });

  it('comes to rest after the key is released', () => {
    hold('KeyW');
    simulate(player, 0.5);
    release('KeyW');
    simulate(player, 1.5);

    const before = player.position.z;
    simulate(player, 0.5);
    // Damping should have brought it essentially to a stop.
    expect(Math.abs(player.position.z - before)).toBeLessThan(0.01);
  });

  it('stays inside the building', () => {
    hold('KeyW');
    simulate(player, 30); // long enough to cross the whole bay many times
    release('KeyW');

    expect(player.position.z).toBeGreaterThanOrEqual(BOUNDS.minZ);
    expect(player.position.z).toBeLessThanOrEqual(BOUNDS.maxZ);
    expect(player.position.x).toBeGreaterThanOrEqual(BOUNDS.minX);
    expect(player.position.x).toBeLessThanOrEqual(BOUNDS.maxX);
  });

  it('does not move with no keys held', () => {
    const start = player.position.clone();
    simulate(player, 1);
    expect(player.position.distanceTo(start)).toBeLessThan(0.001);
  });

  it('keeps held keys when pointer lock is acquired', () => {
    // Acquiring pointer lock moves focus off the start button. An earlier
    // version cleared the key set on every pointerlockchange, which dropped
    // the keys the player was already holding.
    hold('KeyW');
    document.dispatchEvent(new Event('pointerlockchange'));
    const startZ = player.position.z;
    simulate(player, 0.5);
    release('KeyW');
    expect(player.position.z).toBeLessThan(startZ - 0.5);
  });

  it('clears held keys when the window loses focus', () => {
    hold('KeyW');
    window.dispatchEvent(new Event('blur'));
    const startZ = player.position.z;
    simulate(player, 1);
    // Alt-tabbing away mid-stride must not leave the player walking forever.
    expect(Math.abs(player.position.z - startZ)).toBeLessThan(0.2);
  });

  it('diagonal movement is not faster than straight movement', () => {
    hold('KeyW');
    simulate(player, 1);
    const straight = player.position.distanceTo(new THREE.Vector3(0, 1.72, 14));
    release('KeyW');

    const diag = new PlayerController(new THREE.PerspectiveCamera(), BOUNDS);
    const d = diag.attach(document.createElement('canvas'));
    hold('KeyW', 'KeyD');
    simulate(diag, 1);
    const diagonal = diag.position.distanceTo(new THREE.Vector3(0, 1.72, 14));
    release('KeyW', 'KeyD');
    d();

    // The wish vector is normalised, so diagonal must not exceed straight.
    expect(diagonal).toBeLessThanOrEqual(straight * 1.05);
  });
});
