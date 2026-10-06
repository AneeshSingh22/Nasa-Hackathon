import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  createOutsideView, horizonDip, skyDarkness, EYE_HEIGHT, CLOUD_ALTITUDE,
  VIEW_NEAR, VIEW_FAR, type OutsideFrame,
} from './OutsideView';
import { R_EARTH } from '../physics/constants';

/**
 * The view through the window.
 *
 * Its whole job is to make motion legible, and every way it has failed was
 * invisible to the type checker: a planet with nothing on it to move, a sky
 * dome clipped into black shapes, stars drawn over the Earth. These assert the
 * geometry and draw order that make the motion visible.
 */

function frame(altitude: number, downrange = 0): OutsideFrame {
  return { altitude, downrange, time: 10, shake: 0, enginesLit: true };
}

function camera(): THREE.PerspectiveCamera {
  const view = new THREE.PerspectiveCamera(70, 16 / 9, VIEW_NEAR, VIEW_FAR);
  view.updateProjectionMatrix();
  return view;
}

describe('horizon geometry', () => {
  it('dips by exactly acos(R / (R + h))', () => {
    expect(horizonDip(0)).toBe(0);
    // 13.46 degrees at 180 km. An earlier comment quoted 13.6; this caught it.
    expect((horizonDip(180_000) * 180) / Math.PI).toBeCloseTo(13.46, 2);
    expect(horizonDip(200_000)).toBeCloseTo(Math.acos(R_EARTH / (R_EARTH + 200_000)), 12);
  });

  it('darkens the sky from blue at the pad to black in space', () => {
    expect(skyDarkness(0)).toBe(0);
    expect(skyDarkness(30_000)).toBeGreaterThan(0.2);
    expect(skyDarkness(100_000)).toBe(1);
    for (let h = 0; h < 120_000; h += 5_000) {
      expect(skyDarkness(h + 5_000)).toBeGreaterThanOrEqual(skyDarkness(h));
    }
  });
});

describe('what the window shows', () => {
  it('keeps the horizon in frame from the pad to orbit', () => {
    const view = createOutsideView();
    const eye = camera();
    for (const altitude of [0, 500, 5_000, 40_000, 120_000, 220_000]) {
      const at = frame(altitude);
      view.update(at);
      view.aim(eye, at, 0, 0);
      // The visible horizon, straight ahead.
      const dip = horizonDip(altitude);
      const horizon = new THREE.Vector3(0, -Math.sin(dip), -Math.cos(dip)).multiplyScalar(1_000);
      const projected = horizon.project(eye);
      expect(Math.abs(projected.y), `horizon at ${altitude} m`).toBeLessThan(0.95);
    }
  });

  it('shows the launch tower beside the window at lift-off and leaves it behind', () => {
    // The tower dropping away is the most legible sign of lift-off.
    const view = createOutsideView();
    const eye = camera();
    const tower = view.scene.getObjectByName('Launch pad')!;

    const onPad = frame(0);
    view.update(onPad);
    view.aim(eye, onPad, 0, 0);
    view.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(tower);
    const inView = [box.min, box.max].some(corner => {
      const p = corner.clone().project(eye);
      return Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && p.z < 1;
    });
    expect(inView).toBe(true);

    view.update(frame(40_000));
    expect(tower.visible).toBe(false);
  });

  it('puts the ground and the pad the right distance below the eye', () => {
    const view = createOutsideView();
    view.update(frame(1_000));
    const ground = view.scene.getObjectByName('Ground')!;
    expect(ground.position.y).toBeCloseTo(-(1_000 + EYE_HEIGHT), 6);
    const pad = view.scene.getObjectByName('Launch pad')!;
    expect(pad.position.y).toBeCloseTo(-(1_000 + EYE_HEIGHT), 6);
  });

  it('slides the pad behind the vehicle as it flies downrange', () => {
    const view = createOutsideView();
    view.update(frame(1_000, 0));
    const pad = view.scene.getObjectByName('Launch pad')!;
    const start = pad.position.z;
    view.update(frame(1_000, 5_000));
    // Downrange is -Z, the way the window looks; the pad moves the other way.
    expect(pad.position.z - start).toBeCloseTo(5_000, 6);
  });

  it('puts the cloud deck above the vehicle before it climbs through and below after', () => {
    const view = createOutsideView();
    const clouds = view.scene.getObjectByName('Cloud deck')!;
    view.update(frame(500));
    expect(clouds.position.y).toBeGreaterThan(0);
    view.update(frame(CLOUD_ALTITUDE + 3_000));
    expect(clouds.position.y).toBeLessThan(0);
    view.update(frame(80_000));
    expect(clouds.visible).toBe(false);
  });

  it('draws the sky and stars as a backdrop that can never cover the Earth', () => {
    // A sky dome at 36 000 km was clipped by the far plane into black shapes,
    // and transparent stars were drawn over the planet because Three.js draws
    // every transparent object after every opaque one.
    const view = createOutsideView();
    const meshes: THREE.Object3D[] = [];
    view.scene.traverse(object => { if (object instanceof THREE.Mesh) meshes.push(object); });
    const sky = meshes.find(mesh => (mesh as THREE.Mesh).geometry instanceof THREE.SphereGeometry
      && ((mesh as THREE.Mesh).material as THREE.Material).side === THREE.BackSide) as THREE.Mesh;
    expect(sky).toBeDefined();
    const skyMaterial = sky.material as THREE.Material;
    expect(skyMaterial.depthTest).toBe(false);
    expect(skyMaterial.transparent).toBe(false);
    // Comfortably inside the far plane, so precision cannot clip it.
    const radius = (sky.geometry as THREE.SphereGeometry).parameters.radius;
    expect(radius).toBeLessThan(VIEW_FAR / 1_000);

    const stars = view.scene.getObjectByName('Stars') as THREE.Points;
    const starMaterial = stars.material as THREE.PointsMaterial;
    expect(starMaterial.transparent).toBe(false);
    expect(starMaterial.depthTest).toBe(false);
    expect(stars.renderOrder).toBeGreaterThan(sky.renderOrder);
    const ground = view.scene.getObjectByName('Ground')!;
    expect(ground.renderOrder).toBeGreaterThan(stars.renderOrder);
  });

  it('brings the stars out only once the sky is dark', () => {
    const view = createOutsideView();
    const stars = view.scene.getObjectByName('Stars') as THREE.Points;
    view.update(frame(1_000));
    expect(stars.visible).toBe(false);
    view.update(frame(150_000));
    expect(stars.visible).toBe(true);
  });

  it('turns the head within the cockpit without moving the eye', () => {
    const view = createOutsideView();
    const eye = camera();
    const at = frame(0);
    view.aim(eye, at, 0, 0);
    const ahead = new THREE.Vector3(0, 0, -1).applyQuaternion(eye.quaternion);
    view.aim(eye, at, 0.5, 0);
    const turned = new THREE.Vector3(0, 0, -1).applyQuaternion(eye.quaternion);
    expect(eye.position.length()).toBe(0);
    // Positive yaw turns left (toward -X).
    expect(turned.x).toBeLessThan(ahead.x - 0.3);
  });
});
