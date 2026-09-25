import { describe, it, expect } from 'vitest';
import {
  stationFor,
  isOnGantry,
  canWorkOn,
  GANTRY_WORK_HEIGHT,
  GANTRY_X,
  LADDER_X,
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

describe('work stations', () => {
  it('fits the lower stages from the floor', () => {
    expect(stationFor('booster')).toBe('floor');
    expect(stationFor('upper')).toBe('floor');
  });

  it('fits the payload and fairing from the gantry', () => {
    // These go on top of a 55-metre stack. Fitting them from the floor would
    // make the ladder decorative.
    expect(stationFor('payload')).toBe('gantry');
    expect(stationFor('fairing')).toBe('gantry');
  });

  it('does not count the bay floor as the gantry', () => {
    expect(isOnGantry({ x: GANTRY_X, z: 0, y: 0 })).toBe(false);
  });

  it('counts the top platform as the gantry', () => {
    expect(isOnGantry({ x: GANTRY_X, z: 0, y: GANTRY_WORK_HEIGHT })).toBe(true);
  });

  it('does not count a lower platform as the work station', () => {
    // Climbing partway up must not be enough; the work happens at the top.
    expect(isOnGantry({ x: GANTRY_X, z: 0, y: 30 })).toBe(false);
  });

  it('does not count being at the right height but off the platform', () => {
    // Falling past the platform should not let you fit a part mid-air.
    expect(isOnGantry({ x: -15, z: 0, y: GANTRY_WORK_HEIGHT })).toBe(false);
    expect(isOnGantry({ x: GANTRY_X, z: 18, y: GANTRY_WORK_HEIGHT })).toBe(false);
  });

  it('refuses the payload from the floor and allows it from the platform', () => {
    const floor = { x: 0, z: 0, y: 0 };
    const platform = { x: GANTRY_X, z: 0, y: GANTRY_WORK_HEIGHT };

    expect(canWorkOn('payload', floor)).toBe(false);
    expect(canWorkOn('payload', platform)).toBe(true);

    // And the reverse: the booster goes on from the floor, not from up there.
    expect(canWorkOn('booster', floor)).toBe(true);
    expect(canWorkOn('booster', platform)).toBe(false);
  });
});

describe('gantry geometry agrees with the scene', () => {
  /**
   * VABScene builds nine platforms at 4 + i * 5.2 metres and a ladder up one
   * x column. These constants live in two files and once disagreed badly
   * enough that the payload was unreachable: the work height was 56 m when the
   * top platform was 45.6, and the ladder was outside the platform footprint
   * entirely. Pin them together.
   */
  const PLATFORM_HEIGHTS = Array.from({ length: 9 }, (_, i) => 4 + i * 5.2);
  const PLATFORM_HALF_WIDTH = 3.5;

  it('puts the work height on an actual platform', () => {
    const top = PLATFORM_HEIGHTS[PLATFORM_HEIGHTS.length - 1];
    expect(top).toBeDefined();
    expect(GANTRY_WORK_HEIGHT).toBeCloseTo(top as number, 5);
  });

  it('runs the ladder inside the platform footprint', () => {
    // A ladder outside the platforms leads nowhere: the climber would pass
    // every level without ever being able to step off.
    expect(Math.abs(LADDER_X - GANTRY_X)).toBeLessThanOrEqual(PLATFORM_HALF_WIDTH);
  });

  it('counts a player at the top of the ladder as being on the station', () => {
    expect(
      isOnGantry({ x: LADDER_X, z: 0, y: GANTRY_WORK_HEIGHT }),
    ).toBe(true);
  });

  it('lets the payload be fitted from the top of the ladder', () => {
    expect(
      canWorkOn('payload', { x: LADDER_X, z: 0, y: GANTRY_WORK_HEIGHT }),
    ).toBe(true);
  });
});
