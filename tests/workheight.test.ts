import { describe, it, expect, beforeEach } from 'vitest';
import {
  setWorkHeight,
  getWorkHeight,
  isOnGantry,
  canWorkOn,
  GANTRY_X,
  GANTRY_WORK_HEIGHT,
} from '../src/game/workzone';
import { createElevator, DECK_REACH, CAR_HALF, ELEVATOR_X, SHAFT_TOP } from '../src/vab/Elevator';
import { syncWorkHeight } from '../src/game/worksite';
import { PART_LIBRARY } from '../src/vab/parts';

/**
 * The elevator and the work zone are separate systems that must agree on where
 * the high work station is. They disagreed twice.
 *
 * First the elevator stopped at a fixed 45.6 m while the payload attached at
 * 57.1 m, so the placement preview rendered 38 degrees overhead and the player
 * never saw it. Then the elevator stop became derived from the stack top while
 * the work zone kept the 45.6 m constant, so the player could ride to exactly
 * the right place and still be refused — the bug where the only option at the
 * top was to go back down.
 *
 * These tests drive both systems together, which is the only way to catch that
 * class of mismatch.
 */

const STAND_Y = 1.6;
const EYE = 1.72;
const FOV_HALF = 36;

/** Advance a rig to the top. */
function rideUp(rig: ReturnType<typeof createElevator>): void {
  rig.press(rig.height, true);
  for (let i = 0; i < 4000; i++) {
    if (rig.state === 'atTop') break;
    rig.update(1 / 60);
  }
}

beforeEach(() => {
  setWorkHeight(GANTRY_WORK_HEIGHT);
});

describe('work height synchronisation', () => {
  const boosters = PART_LIBRARY.filter((p) => p.kind === 'booster');
  const uppers = PART_LIBRARY.filter((p) => p.kind === 'upper');
  const payloads = PART_LIBRARY.filter((p) => p.kind === 'payload');

  it('has more than one booster, so the attach height really does vary', () => {
    const heights = new Set(boosters.map((b) => b.height));
    expect(heights.size).toBeGreaterThan(1);
  });

  it('lets the player place the payload from the car, whichever booster', () => {
    for (const booster of boosters) {
      for (const upper of uppers) {
        const attachY = STAND_Y + booster.height + upper.height;

        const rig = createElevator();
        // Drive the real synchronisation, so a regression in the wiring is
        // caught rather than only a regression in the primitives.
        syncWorkHeight(rig, attachY);
        rideUp(rig);

        // Standing on the car deck at the top.
        const position = { x: ELEVATOR_X, z: 0, y: rig.height };
        expect(
          canWorkOn('payload', position),
          `${booster.id} + ${upper.id}: feet ${rig.height.toFixed(1)} m, work height ${getWorkHeight().toFixed(1)} m`,
        ).toBe(true);
      }
    }
  });

  it('lets the player place the fairing after any payload', () => {
    for (const booster of boosters) {
      for (const payload of payloads) {
        const upper = uppers[0];
        if (!upper) continue;
        const attachY =
          STAND_Y + booster.height + upper.height + payload.height;

        const rig = createElevator();
        // Drive the real synchronisation, so a regression in the wiring is
        // caught rather than only a regression in the primitives.
        syncWorkHeight(rig, attachY);
        rideUp(rig);

        const position = { x: ELEVATOR_X, z: 0, y: rig.height };
        expect(
          canWorkOn('fairing', position),
          `${booster.id} + ${payload.id}`,
        ).toBe(true);
      }
    }
  });

  it('works from the far end of the work deck as well as the car', () => {
    const booster = boosters[0];
    const upper = uppers[0];
    if (!booster || !upper) return;

    const attachY = STAND_Y + booster.height + upper.height;
    const rig = createElevator();
    syncWorkHeight(rig, attachY);
    rideUp(rig);

    // The deck reaches inward from the car toward the stack.
    const deckEnd = ELEVATOR_X - CAR_HALF - DECK_REACH + 0.6;
    expect(canWorkOn('payload', { x: deckEnd, z: 0, y: rig.height })).toBe(true);
  });

  it('keeps the attach point inside the field of view', () => {
    for (const booster of boosters) {
      const upper = uppers[0];
      if (!upper) continue;
      const attachY = STAND_Y + booster.height + upper.height;

      const rig = createElevator();
      syncWorkHeight(rig, attachY);
      rideUp(rig);

      // From the work deck, looking at the stack centre.
      const deckEnd = ELEVATOR_X - CAR_HALF - DECK_REACH + 0.6;
      const cameraY = rig.height + EYE;
      const reach = Math.max(1, deckEnd);
      const angle =
        (Math.atan2(Math.abs(attachY - cameraY), reach) * 180) / Math.PI;

      expect(angle, `${booster.id}: ${angle.toFixed(0)} degrees`).toBeLessThan(
        FOV_HALF,
      );
    }
  });

  it('still refuses work from the bay floor', () => {
    const rig = createElevator();
    syncWorkHeight(rig, 57.1);

    expect(canWorkOn('payload', { x: GANTRY_X, z: 0, y: 0 })).toBe(false);
    expect(isOnGantry({ x: GANTRY_X, z: 0, y: 0 })).toBe(false);
  });

  it('refuses work from a wrong height even in the right place', () => {
    const rig = createElevator();
    syncWorkHeight(rig, 57.1);

    // Ten metres below the platform: right footprint, wrong level.
    expect(
      canWorkOn('payload', { x: ELEVATOR_X, z: 0, y: rig.workingHeight - 10 }),
    ).toBe(false);
  });

  it('keeps the lower stages a floor job', () => {
    const rig = createElevator();
    syncWorkHeight(rig, 57.1);
    rideUp(rig);

    // The booster must not be fittable from the work platform.
    expect(
      canWorkOn('booster', { x: ELEVATOR_X, z: 0, y: rig.height }),
    ).toBe(false);
    // But it is from the painted circle.
    expect(canWorkOn('booster', { x: 2, z: 2, y: 0 })).toBe(true);
  });
});

describe('work height clamping', () => {
  it('follows where the car actually stops, not where it was asked to', () => {
    // The car clamps to its shaft. If the work zone used the requested height
    // instead of the achieved one, the two would part company at the limits.
    const rig = createElevator();
    const achieved = syncWorkHeight(rig, SHAFT_TOP + 40);
    expect(achieved).toBe(rig.workingHeight);
    expect(achieved).toBeLessThanOrEqual(SHAFT_TOP);

    rideUp(rig);
    expect(canWorkOn('payload', { x: ELEVATOR_X, z: 0, y: rig.height })).toBe(
      true,
    );
  });

  it('returns the height it settled on', () => {
    const rig = createElevator();
    const achieved = syncWorkHeight(rig, 57.1);
    expect(achieved).toBeCloseTo(rig.workingHeight, 6);
    expect(getWorkHeight()).toBeCloseTo(achieved, 6);
  });
});
