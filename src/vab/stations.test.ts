import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createVABScene, type VABEnvironment } from './VABScene';
import { STATIONS } from './stations';
import { PlayerController } from './PlayerController';
import { WorkshopStation } from './WorkshopStation';

// The old station coordinates are regression probes, not active destinations.
describe('Explore without part benches', () => {
  let env: VABEnvironment;
  const labels: string[] = [];
  beforeEach(() => {
    labels.length = 0;
    const context = {
      fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
      closePath() {}, fill() {}, fillText(text: string) { labels.push(text); },
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
    env = createVABScene();
    env.scene.updateMatrixWorld(true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    env.scene.traverse(object => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
  });

  it('has floor, not bench geometry or step paint, at every former station', () => {
    const meshes: THREE.Mesh[] = [];
    env.scene.traverse(object => { if (object instanceof THREE.Mesh) meshes.push(object); });
    for (const station of STATIONS) {
      for (const z of [station.z, station.z + 4.2]) {
        const ray = new THREE.Raycaster(new THREE.Vector3(station.x, 2.5, z), new THREE.Vector3(0, -1, 0));
        const hits = ray.intersectObjects(meshes, false);
        expect(hits.length).toBeGreaterThan(0);
        expect(hits[0]!.point.y, station.id).toBeLessThan(0.1);
      }
      expect(env.staticObstacles.some(o => o.x === station.x && o.z === station.z)).toBe(false);
    }
    expect(labels.join(' ')).not.toMatch(/Step [1-4]|payload & fairing|first stage/i);
  });

  it('lets the player walk from spawn to Workshop using the real scene colliders', () => {
    const player = new PlayerController(new THREE.PerspectiveCamera(),
      { minX: -29, maxX: 29, minZ: -22, maxZ: 22 });
    const detach = player.attach(document.createElement('canvas'));
    player.obstacles = env.staticObstacles;
    const workshop = new WorkshopStation();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    for (let i = 0; i < 35; i++) {
      player.supportHeight = env.supportHeightAt(player.position.x, player.position.z, player.feetHeight);
      player.update(1 / 60);
    }
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    detach();
    expect(workshop.contains(player.position)).toBe(true);
    expect(player.feetHeight).toBeCloseTo(0);
  });
});
