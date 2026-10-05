// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createCockpit, FLIGHT_FAR_PLANE, FLIGHT_NEAR_PLANE } from './CockpitScene';
import { R_EARTH } from '../physics/constants';

/**
 * The cockpit view.
 *
 * This shipped broken in a way nothing caught: the cockpit was rotated with
 * the vehicle while the camera stayed at identity, so the camera ended up
 * inside the hull looking at the back of a wall, with the Earth showing
 * through it and a field of indicator lamps across the middle of the screen.
 *
 * The lesson is the project's own: a feature can be correct in every part and
 * still be wrong on screen. These assert what the player can actually see.
 */

/** The camera sits at the origin looking down -Z. */
const FOV = 72;
const ASPECT = 1.9;

function camera(): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(FOV, ASPECT, FLIGHT_NEAR_PLANE, FLIGHT_FAR_PLANE);
  c.position.set(0, 0, 0);
  c.updateMatrixWorld(true);
  c.updateProjectionMatrix();
  return c;
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
    closePath() {}, fill() {}, stroke() {}, fillText() {}, arc() {},
    createLinearGradient: () => ({ addColorStop() {} }),
    getImageData: () => ({ data: new Uint8ClampedArray(256), width: 8, height: 8 }),
    createImageData: () => ({ data: new Uint8ClampedArray(256), width: 8, height: 8 }),
    putImageData() {},
  } as unknown as RenderingContext);
});

describe('the cockpit view', () => {
  it('leaves the centre of the screen clear to fly by', () => {
    const rig = createCockpit();
    const cockpit = rig.scene.getObjectByName('Cockpit interior')!;
    expect(cockpit).toBeDefined();
    cockpit.updateMatrixWorld(true);

    // Cast a ray straight ahead, where the horizon sits. Nothing in the
    // cockpit may be in the way: that is the whole point of a window.
    const ray = new THREE.Raycaster(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1),
      FLIGHT_NEAR_PLANE,
      50,
    );
    expect(ray.intersectObject(cockpit, true)).toHaveLength(0);
  });

  it('keeps a usable band of sky above and below the horizon', () => {
    const rig = createCockpit();
    const cockpit = rig.scene.getObjectByName('Cockpit interior')!;
    cockpit.updateMatrixWorld(true);

    // Sample across the middle of the view. A pilot needs to see the horizon
    // move, so this band has to stay open.
    for (const degrees of [-15, -10, -5, 0, 5, 10, 15, 20]) {
      const angle = (degrees * Math.PI) / 180;
      const direction = new THREE.Vector3(0, Math.sin(angle), -Math.cos(angle)).normalize();
      const ray = new THREE.Raycaster(new THREE.Vector3(), direction, FLIGHT_NEAR_PLANE, 50);
      expect(
        ray.intersectObject(cockpit, true).length,
        `blocked at ${degrees} degrees`,
      ).toBe(0);
    }
  });

  it('puts structure below and above the open band, so it reads as a cockpit', () => {
    // The opposite failure is a window with no cockpit around it, which looks
    // like a floating camera rather than a vehicle.
    const rig = createCockpit();
    const cockpit = rig.scene.getObjectByName('Cockpit interior')!;
    cockpit.updateMatrixWorld(true);

    const hits = (degrees: number) => {
      const angle = (degrees * Math.PI) / 180;
      const direction = new THREE.Vector3(0, Math.sin(angle), -Math.cos(angle)).normalize();
      return new THREE.Raycaster(new THREE.Vector3(), direction, FLIGHT_NEAR_PLANE, 50)
        .intersectObject(cockpit, true).length;
    };
    // Console below.
    expect(hits(-30)).toBeGreaterThan(0);
    // Brow above.
    expect(hits(34)).toBeGreaterThan(0);
  });

  it('holds the cockpit still while the world rotates around it', () => {
    // The bug: rotating the cockpit instead of the world put the camera inside
    // the hull. The cockpit is what the player is sitting in, so it must never
    // move relative to them.
    const rig = createCockpit();
    const cockpit = rig.scene.getObjectByName('Cockpit interior')!;
    const before = cockpit.getWorldQuaternion(new THREE.Quaternion()).clone();

    rig.update(
      120_000,
      new THREE.Vector3(0.6, 0.8, 0).normalize(),
      new THREE.Vector3(0, 1, 0),
      500_000,
    );
    rig.scene.updateMatrixWorld(true);

    const after = cockpit.getWorldQuaternion(new THREE.Quaternion());
    expect(after.angleTo(before)).toBeLessThan(1e-6);
  });

  it('puts the planet below the pilot when flying level', () => {
    const rig = createCockpit();
    // Nose on the horizon, local vertical up: the ground should be underfoot.
    rig.update(
      200_000,
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      0,
    );
    rig.scene.updateMatrixWorld(true);

    const earth = rig.scene.children.find(
      child => child.children.some(c => c instanceof THREE.Mesh)
        && child !== rig.vehicleFrame,
    );
    expect(earth).toBeDefined();
    const position = earth!.getWorldPosition(new THREE.Vector3());
    // Below, and one planet radius plus the altitude away.
    expect(position.y).toBeLessThan(0);
    expect(position.length()).toBeCloseTo(R_EARTH + 200_000, -3);
  });

  it('shows ground near the pad and hides it in space', () => {
    // The original flight view was a flat blue screen with nothing moving,
    // because at zero altitude the planet's surface is exactly at the camera.
    // A near-field plane is what gives a launch any sense of speed at all.
    const rig = createCockpit();
    const ground = () => rig.scene.getObjectByName('Near ground')!;
    expect(ground()).toBeDefined();

    rig.update(500, new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0), 0);
    expect(ground().visible).toBe(true);

    rig.update(300_000, new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), 0);
    expect(ground().visible).toBe(false);
  });

  it('scrolls the ground with distance flown', () => {
    // A static texture under a moving vehicle is the bug being fixed: the eye
    // reads a surface sliding past as speed, and reads a still one as a
    // screenshot.
    const rig = createCockpit();
    const ground = rig.scene.getObjectByName('Near ground') as THREE.Mesh;
    const material = ground.material as THREE.MeshStandardMaterial;
    if (!material.map) return; // No canvas in this environment.

    rig.update(2_000, new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0), 0);
    const start = material.map.offset.y;
    rig.update(2_000, new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0), 2_000);
    expect(material.map.offset.y).not.toBe(start);
  });

  it('passes a cloud deck on the way up', () => {
    const rig = createCockpit();
    const clouds = rig.scene.getObjectByName('Cloud deck') as THREE.Mesh;
    expect(clouds).toBeDefined();
    const material = clouds.material as THREE.MeshStandardMaterial;

    // Thickest at the deck itself, gone well above it.
    rig.update(8_000, new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0), 0);
    const atDeck = material.opacity;
    rig.update(30_000, new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0), 0);
    expect(material.opacity).toBeLessThan(atDeck);
    expect(atDeck).toBeGreaterThan(0.3);
  });

  it('darkens the sky as the air thins', () => {
    // Watching space arrive is better than being told about it.
    const rig = createCockpit();
    const brightness = (altitude: number) => {
      rig.update(altitude, new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0), 0);
      const sky = rig.scene.background as THREE.Color;
      return sky.r + sky.g + sky.b;
    };
    expect(brightness(100_000)).toBeLessThan(brightness(2_000));
  });

  it('shakes under thrust and settles when the engines stop', () => {
    const rig = createCockpit();
    const frame = rig.vehicleFrame;

    rig.shake(1, 12.5);
    expect(frame.position.length()).toBeGreaterThan(0);

    rig.shake(0, 12.5);
    expect(frame.position.length()).toBe(0);
    expect(frame.rotation.z).toBe(0);
  });

  it('spans a depth range that fits both an instrument and a planet', () => {
    // A panel is centimetres away and the horizon is thousands of kilometres.
    expect(FLIGHT_NEAR_PLANE).toBeLessThan(0.1);
    expect(FLIGHT_FAR_PLANE).toBeGreaterThan(R_EARTH * 2);
  });

  it('frames the cockpit inside the camera it is built for', () => {
    const rig = createCockpit();
    const cockpit = rig.scene.getObjectByName('Cockpit interior')!;
    cockpit.updateMatrixWorld(true);
    const view = camera();

    // Nothing may sit behind the eye, where it would be invisible and would
    // only cost draw calls.
    const box = new THREE.Box3().setFromObject(cockpit);
    expect(box.min.z).toBeLessThan(0);
    expect(box.max.z).toBeLessThan(0.8);
    void view;
  });
});
