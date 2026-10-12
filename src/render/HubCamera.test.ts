import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HubCamera } from './HubCamera';

describe('isometric VAB hub framing', () => {
  it('looks down equally along all three axes with an orthographic projection', () => {
    const hub = new HubCamera();
    hub.frame(new THREE.Group(), 1440, 900);
    const direction = hub.camera.getWorldDirection(new THREE.Vector3());
    expect(direction.x).toBeCloseTo(1 / Math.sqrt(3));
    expect(direction.y).toBeCloseTo(-direction.x);
    expect(direction.z).toBeCloseTo(-direction.x);
    expect(hub.camera.isOrthographicCamera).toBe(true);
  });

  it.each([[1440, 900], [1280, 600], [800, 600]])('keeps the completed craft and platform action in view at %i × %i', (width, height) => {
    const root = new THREE.Group();
    const rocket = new THREE.Mesh(new THREE.BoxGeometry(4, 24, 4));
    rocket.position.y = 13.6;
    root.add(rocket);
    const hub = new HubCamera();
    hub.frame(root, width, height);
    for (const y of [1.6, 25.6]) {
      const projected = new THREE.Vector3(0, y, 0).project(hub.camera);
      expect(projected.x).toBeCloseTo(0);
      expect(Math.abs(projected.y)).toBeLessThan(0.85);
    }
    const anchor = hub.platformPosition(width, height);
    expect(anchor.x).toBeGreaterThan(150);
    expect(anchor.x).toBeLessThan(width - 150);
    expect(anchor.y).toBeGreaterThan(0);
    expect(anchor.y).toBeLessThan(height - 50);
  });
});

it.each([[1440, 900], [3840, 1080]])('centres an empty assembly platform at %i × %i', (width, height) => {
  const root = new THREE.Group();
  root.position.y = 1.6;
  const hub = new HubCamera();
  hub.frame(root, width, height);
  const platform = root.getWorldPosition(new THREE.Vector3()).project(hub.camera);
  expect(platform.x).toBeCloseTo(0);
  expect(platform.y).toBeCloseTo(0);
});
