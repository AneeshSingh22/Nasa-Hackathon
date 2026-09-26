// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { OrbitCamera, ORBIT_LIMITS } from './OrbitCamera';

function rig() {
  const camera = new THREE.PerspectiveCamera(72, 1.6, 0.1, 400);
  const orbit = new OrbitCamera(camera);
  orbit.reset(new THREE.Vector3(0, 3.1, 0));
  return { camera, orbit };
}

function pointer(target: EventTarget, type: string, x: number, y: number, button = 0) {
  // jsdom has MouseEvent but not PointerEvent; provide the identity used by capture.
  const event = new MouseEvent(type, { clientX: x, clientY: y, button, cancelable: true });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  target.dispatchEvent(event);
}

describe('workshop orbit camera', () => {
  it('orbits from +Z to +X and keeps the pod centred in the view', () => {
    const { camera, orbit } = rig();
    orbit.orbit(Math.PI / 2, 0);
    const offset = camera.position.clone().sub(orbit.target);
    expect(offset.x).toBeGreaterThan(9);
    expect(offset.z).toBeCloseTo(0);
    expect(offset.y).toBeGreaterThan(0);
    const forward = camera.getWorldDirection(new THREE.Vector3());
    expect(forward.dot(offset.clone().normalize().negate())).toBeCloseTo(1);
    const projected = orbit.target.clone().project(camera);
    expect(projected.x).toBeCloseTo(0);
    expect(projected.y).toBeCloseTo(0);
    expect(projected.z).toBeGreaterThan(-1);
    expect(projected.z).toBeLessThan(1);
  });

  it('frames the entire placeholder at default zoom, including a narrow viewport', () => {
    for (const aspect of [1.6, 0.6]) {
      const { camera, orbit } = rig();
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      orbit.update();
      for (const x of [-1.52, 1.52]) for (const y of [1.7, 4.5]) for (const z of [-1.52, 1.52]) {
        const point = new THREE.Vector3(x, y, z).project(camera);
        expect(Math.abs(point.x)).toBeLessThan(1);
        expect(Math.abs(point.y)).toBeLessThan(1);
      }
    }
  });

  it('clamps distance and elevation after extreme inputs', () => {
    const { camera, orbit } = rig();
    orbit.zoom(-1000);
    expect(camera.position.distanceTo(orbit.target)).toBeCloseTo(ORBIT_LIMITS.minDistance);
    orbit.zoom(1000);
    expect(camera.position.distanceTo(orbit.target)).toBeCloseTo(ORBIT_LIMITS.maxDistance);
    for (const [delta, expected] of [[-1000, ORBIT_LIMITS.minElevation], [1000, ORBIT_LIMITS.maxElevation]]) {
      orbit.orbit(0, delta!);
      const offset = camera.position.clone().sub(orbit.target);
      expect(Math.asin(offset.y / offset.length())).toBeCloseTo(expected!);
      expect(camera.position.y).toBeGreaterThan(0);
    }
  });

  it('pans in camera-local axes and stays inside useful hangar bounds', () => {
    const { camera, orbit } = rig();
    orbit.orbit(Math.PI / 2, 0);
    const before = orbit.target.clone();
    orbit.pan(0.5, 0);
    expect(orbit.target.z - before.z).toBeCloseTo(-0.5);
    expect(orbit.target.x).toBeCloseTo(before.x);
    const beforeUp = orbit.target.clone();
    const expectedUp = new THREE.Vector3(0, 0.25, 0).applyQuaternion(camera.quaternion);
    orbit.pan(0, 0.25);
    expect(orbit.target.clone().sub(beforeUp).distanceTo(expectedUp)).toBeLessThan(1e-6);
    orbit.pan(10000, -10000);
    orbit.zoom(10000);
    orbit.orbit(0, -10000);
    expect(camera.position.y).toBeGreaterThan(1.6);
    expect(Math.abs(camera.position.x)).toBeLessThan(29);
    expect(Math.abs(camera.position.z)).toBeLessThan(22);
  });

  it('handles drag, wheel cancellation and re-entry without duplicate listeners', () => {
    const { camera, orbit } = rig();
    const canvas = document.createElement('canvas');
    orbit.attach(canvas);
    orbit.attach(canvas);
    pointer(canvas, 'pointerdown', 100, 100);
    pointer(window, 'pointermove', 0, 100);
    pointer(window, 'pointerup', 0, 100);
    const offset = camera.position.clone().sub(orbit.target);
    expect(Math.atan2(offset.x, offset.z)).toBeCloseTo(0.5);
    const wheel = new WheelEvent('wheel', { deltaY: -100, cancelable: true });
    canvas.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(camera.position.distanceTo(orbit.target)).toBeCloseTo(10 * Math.exp(-0.1));
    orbit.detach();
    const saved = camera.position.clone();
    pointer(canvas, 'pointerdown', 100, 100);
    pointer(window, 'pointermove', 200, 100);
    const afterExit = new WheelEvent('wheel', { deltaY: 200, cancelable: true });
    canvas.dispatchEvent(afterExit);
    expect(afterExit.defaultPrevented).toBe(false);
    expect(camera.position.equals(saved)).toBe(true);
  });

  it('ends a drag on blur rather than resuming it when the mouse returns', () => {
    const { camera, orbit } = rig();
    const canvas = document.createElement('canvas');
    orbit.attach(canvas);
    pointer(canvas, 'pointerdown', 100, 100, 2);
    window.dispatchEvent(new Event('blur'));
    const before = camera.position.clone();
    pointer(window, 'pointermove', 200, 200, 2);
    expect(camera.position.equals(before)).toBe(true);
    orbit.detach();
  });
});
