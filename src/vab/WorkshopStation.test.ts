import { describe, expect, it } from 'vitest';
import { WorkshopStation } from './WorkshopStation';
import { PlayerController } from './PlayerController';
import * as THREE from 'three';

describe('Workshop station', () => {
  it('is reachable by walking straight ahead from spawn on the bay floor', () => {
    const station = new WorkshopStation();
    const player = new PlayerController(new THREE.PerspectiveCamera(),
      { minX: -29, maxX: 29, minZ: -22, maxZ: 22 });
    const detach = player.attach(document.createElement('canvas'));
    expect(station.contains(player.position)).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    for (let i = 0; i < 35; i++) player.update(1 / 60);
    expect(station.contains(player.position)).toBe(true);
    expect(player.feetHeight).toBeCloseTo(0);
    detach();
  });

  it('does not offer entry from an elevated platform or a distant bench', () => {
    const station = new WorkshopStation();
    expect(station.contains({ x: 0, y: 25, z: 9 })).toBe(false);
    expect(station.contains({ x: -16.5, y: 1.72, z: -19 })).toBe(false);
  });
});
