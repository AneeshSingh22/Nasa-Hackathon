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

  it('walks with the arrow keys, which are the primary binding', () => {
    const startZ = player.position.z;
    hold('ArrowUp');
    simulate(player, 1);
    release('ArrowUp');
    expect(player.position.z).toBeLessThan(startZ - 2);
  });

  it('strafes with the left and right arrows', () => {
    const startX = player.position.x;
    hold('ArrowRight');
    simulate(player, 1);
    release('ArrowRight');
    expect(player.position.x).toBeGreaterThan(startX + 2);
  });

  it('treats an arrow and its WASD alias as the same input', () => {
    hold('ArrowUp');
    simulate(player, 1);
    const byArrow = 14 - player.position.z;
    release('ArrowUp');

    const other = new PlayerController(new THREE.PerspectiveCamera(), BOUNDS);
    const detachOther = other.attach(document.createElement('canvas'));
    hold('KeyW');
    simulate(other, 1);
    const byLetter = 14 - other.position.z;
    release('KeyW');
    detachOther();

    expect(byArrow).toBeCloseTo(byLetter, 4);
  });

  it('does not double up when an arrow and its alias are held together', () => {
    hold('ArrowUp');
    simulate(player, 1);
    const single = 14 - player.position.z;
    release('ArrowUp');

    const both = new PlayerController(new THREE.PerspectiveCamera(), BOUNDS);
    const detachBoth = both.attach(document.createElement('canvas'));
    hold('ArrowUp', 'KeyW');
    simulate(both, 1);
    const doubled = 14 - both.position.z;
    release('ArrowUp', 'KeyW');
    detachBoth();

    // Holding both must not move the player twice as fast.
    expect(doubled).toBeCloseTo(single, 4);
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

describe('climbing', () => {
  let camera: THREE.PerspectiveCamera;
  let player: PlayerController;
  let detach: () => void;

  beforeEach(() => {
    camera = new THREE.PerspectiveCamera(72, 1.6, 0.1, 400);
    player = new PlayerController(camera, BOUNDS);
    detach = player.attach(document.createElement('canvas'));
    return () => {
      detach();
      release('ArrowUp', 'ArrowDown', 'KeyW', 'KeyS');
    };
  });

  /**
   * Put the player on a ladder where they are standing.
   *
   * The scene only reports a ladder within 1.5 m of the player, so mounting
   * one far away is not a situation the game can produce — and the latch would
   * legitimately drag them to it.
   */
  function mountLadder(top = 45.6): void {
    player.position.z = 0;
    player.onLadder = true;
    player.ladderX = player.position.x;
    player.ladderTop = top;
    player.supportHeight = 0;
  }

  it('climbs while up is held', () => {
    mountLadder();
    hold('ArrowUp');
    simulate(player, 1);
    release('ArrowUp');
    // Should have gained real height, not a fraction of a metre.
    expect(player.feetHeight).toBeGreaterThan(3);
  });

  it('keeps climbing past a platform instead of stopping at the first one', () => {
    // The original bug: holding up also walked the player forward, carrying
    // them off the ladder's detection radius within about a tenth of a second.
    // It read as climbing being broken immediately.
    mountLadder();
    const columnX = player.position.x;
    hold('ArrowUp');
    for (let i = 0; i < 300; i++) {
      // Re-assert the mount each frame, as the scene does.
      player.onLadder = true;
      player.ladderX = columnX;
      player.update(1 / 60);
    }
    release('ArrowUp');
    expect(player.feetHeight).toBeGreaterThan(20);
  });

  it('does not walk horizontally while climbing', () => {
    mountLadder();
    const startZ = player.position.z;
    const startX = player.position.x;
    hold('ArrowUp');
    simulate(player, 1);
    release('ArrowUp');
    // Forward input is consumed by the climb, so the player must not travel
    // horizontally at all while going up.
    expect(Math.abs(player.position.z - startZ)).toBeLessThan(0.1);
    expect(Math.abs(player.position.x - startX)).toBeLessThan(0.1);
    expect(player.feetHeight).toBeGreaterThan(3);
  });

  it('stays latched to the ladder column', () => {
    mountLadder();
    // Nudge the player off the column, then climb.
    player.ladderX = 0;
    player.position.x = 1.2;
    hold('ArrowUp');
    simulate(player, 1);
    release('ArrowUp');
    // The latch should have pulled them back onto x = 0.
    expect(Math.abs(player.position.x)).toBeLessThan(0.3);
  });

  it('descends while down is held', () => {
    mountLadder();
    hold('ArrowUp');
    simulate(player, 1.5);
    release('ArrowUp');
    const high = player.feetHeight;

    hold('ArrowDown');
    simulate(player, 0.5);
    release('ArrowDown');
    expect(player.feetHeight).toBeLessThan(high);
  });

  it('cannot climb past the top of the ladder', () => {
    mountLadder(12);
    hold('ArrowUp');
    simulate(player, 10);
    release('ArrowUp');
    expect(player.feetHeight).toBeLessThanOrEqual(12.001);
  });

  it('cannot descend below the surface the ladder starts from', () => {
    mountLadder();
    hold('ArrowDown');
    simulate(player, 3);
    release('ArrowDown');
    expect(player.feetHeight).toBeGreaterThanOrEqual(-0.001);
  });

  it('falls when it leaves the ladder in mid-air', () => {
    mountLadder();
    hold('ArrowUp');
    simulate(player, 2);
    release('ArrowUp');
    const height = player.feetHeight;
    expect(height).toBeGreaterThan(5);

    // Step off: no ladder, and nothing underneath.
    player.onLadder = false;
    player.ladderX = null;
    player.supportHeight = 0;
    simulate(player, 0.5);
    expect(player.feetHeight).toBeLessThan(height);
  });

  it('reports a fall worth reporting', () => {
    let fell = 0;
    player.onFall = (d) => {
      fell = d;
    };
    mountLadder();
    hold('ArrowUp');
    simulate(player, 3);
    release('ArrowUp');

    player.onLadder = false;
    player.ladderX = null;
    player.supportHeight = 0;
    simulate(player, 4);

    expect(fell).toBeGreaterThan(3);
    expect(player.feetHeight).toBeCloseTo(0, 1);
  });
});

describe('solid obstacles', () => {
  let player: PlayerController;
  let detach: () => void;

  beforeEach(() => {
    player = new PlayerController(new THREE.PerspectiveCamera(), BOUNDS);
    detach = player.attach(document.createElement('canvas'));
    return () => {
      detach();
      release('ArrowUp');
    };
  });

  it('stops the player walking through the rocket', () => {
    // The rocket used to be a hologram: the meshes were there but nothing
    // stopped the player strolling out through the middle of the booster.
    player.obstacles = [{ x: 0, z: 0, radius: 3.4, top: 60 }];
    hold('ArrowUp');
    simulate(player, 4); // more than enough to cross the bay
    release('ArrowUp');
    // Never inside the hull, no matter how long the player pushes.

    const distance = Math.hypot(player.position.x, player.position.z);
    expect(distance).toBeGreaterThanOrEqual(3.39);
  });

  it('lets the player walk over the obstacle once above it', () => {
    // An obstacle only blocks up to its top. Standing on a platform above it,
    // the player should pass over freely.
    player.obstacles = [{ x: 0, z: 0, radius: 3.4, top: 5 }];
    player.supportHeight = 8;
    // Start just outside the obstacle so a short walk crosses it.
    player.position.z = 4;
    player.update(1 / 60);
    expect(player.feetHeight).toBeCloseTo(8, 1);

    hold('ArrowUp');
    simulate(player, 1);
    release('ArrowUp');

    // Above the obstacle's top it is not in the way at all.
    const distance = Math.hypot(player.position.x, player.position.z);
    expect(distance).toBeLessThan(3.4);
  });

  it('does not trap the player when there is no obstacle', () => {
    player.obstacles = [];
    hold('ArrowUp');
    simulate(player, 1);
    release('ArrowUp');
    expect(player.position.z).toBeLessThan(13);
  });
});
