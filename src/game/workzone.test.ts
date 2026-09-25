import { describe, it, expect } from 'vitest';
import {
  isInWorkZone,
  isNearWorkZone,
  distanceToStand,
  promptOpacity,
  WORK_ZONE_RADIUS,
  WORK_ZONE_HINT_RADIUS,
} from './workzone';

/**
 * Assembly used to work from anywhere in the building, which made walking
 * pointless. These tests pin the rule that you have to be at the stand.
 */

describe('work zone', () => {
  it('places the stand at the origin', () => {
    expect(distanceToStand({ x: 0, z: 0 })).toBe(0);
  });

  it('lets the player work while standing at the stand', () => {
    expect(isInWorkZone({ x: 0, z: 0 })).toBe(true);
    expect(isInWorkZone({ x: 3, z: 3 })).toBe(true);
  });

  it('refuses work from across the bay', () => {
    // The player spawns at z = 14, outside the zone, so the very first press
    // of E must not build anything.
    expect(isInWorkZone({ x: 0, z: 14 })).toBe(false);
    expect(isInWorkZone({ x: 20, z: 18 })).toBe(false);
  });

  it('uses the painted ring as the boundary', () => {
    // Just inside and just outside the ring must differ, so the rule the
    // player obeys is the one drawn on the floor.
    expect(isInWorkZone({ x: WORK_ZONE_RADIUS - 0.2, z: 0 })).toBe(true);
    expect(isInWorkZone({ x: WORK_ZONE_RADIUS + 0.2, z: 0 })).toBe(false);
  });

  it('measures distance on the floor, ignoring how tall the player is', () => {
    // Only x and z are considered; a Y term would make crouching change
    // whether you can reach the vehicle.
    expect(distanceToStand({ x: 0, z: 5 })).toBe(5);
    expect(distanceToStand({ x: 3, z: 4 })).toBe(5);
  });

  it('shows the hint before the player can act', () => {
    const approaching = { x: 0, z: (WORK_ZONE_RADIUS + WORK_ZONE_HINT_RADIUS) / 2 };
    expect(isNearWorkZone(approaching)).toBe(true);
    expect(isInWorkZone(approaching)).toBe(false);
  });

  it('is faintly visible from the spawn point, so the opening move is not hidden', () => {
    // The player spawns 14 m from the stand. If the prompt were fully
    // transparent there, the first thing the game asks of them is invisible.
    const spawn = { x: 0, z: 14 };
    const o = promptOpacity(spawn);
    expect(o).toBeGreaterThan(0.1);
    expect(o).toBeLessThan(1);
    expect(isInWorkZone(spawn)).toBe(false);
  });

  it('fades the prompt in as the player walks up', () => {
    expect(promptOpacity({ x: 0, z: 30 })).toBe(0);
    expect(promptOpacity({ x: 0, z: WORK_ZONE_HINT_RADIUS })).toBe(0);
    expect(promptOpacity({ x: 0, z: 0 })).toBe(1);
    expect(promptOpacity({ x: 0, z: WORK_ZONE_RADIUS })).toBe(1);

    const mid = promptOpacity({
      x: 0,
      z: (WORK_ZONE_RADIUS + WORK_ZONE_HINT_RADIUS) / 2,
    });
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it('increases opacity monotonically as the player approaches', () => {
    let previous = 0;
    for (let z = WORK_ZONE_HINT_RADIUS; z >= 0; z -= 0.5) {
      const o = promptOpacity({ x: 0, z });
      expect(o).toBeGreaterThanOrEqual(previous);
      previous = o;
    }
    expect(previous).toBe(1);
  });
});
