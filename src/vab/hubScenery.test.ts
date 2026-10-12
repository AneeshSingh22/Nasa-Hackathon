// @vitest-environment jsdom
import { expect, it } from 'vitest';
import * as THREE from 'three';
import { createVABScene, VAB_WIDTH, VAB_DEPTH } from './VABScene';
import { HubCamera } from '../render/HubCamera';

it('covers every viewport corner with scenery and removes the foreground column collider', () => {
  const env = createVABScene();
  expect(env.staticObstacles.some(obstacle =>
    obstacle.x === -(VAB_WIDTH / 2 - 1.4) && obstacle.z === VAB_DEPTH / 2 - 1.4,
  )).toBe(false);
  const hub = new HubCamera();
  for (const [width, height] of [[1440, 900], [3840, 1080]]) {
    hub.frame(env.assemblyRoot, width!, height!);
    env.scene.updateMatrixWorld(true);
    for (const x of [-0.99, 0.99]) for (const y of [-0.99, 0.99]) {
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(x, y), hub.camera);
      expect(ray.intersectObjects(env.scene.children, true).length).toBeGreaterThan(0);
    }
  }
});
