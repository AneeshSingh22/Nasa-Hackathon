import { describe, it, expect } from 'vitest';
import {
  createElevator,
  ELEVATOR_X,
  ELEVATOR_Z,
  CAR_HALF,
  TOP,
  BOTTOM,
  SPEED,
  type ElevatorRig,
} from './Elevator';

/**
 * The elevator exists because the ladder could not be made to work: climbing
 * fought walking, the latch fought stepping off, and arriving at a platform
 * holding a part was a dead end. These tests pin the behaviour the ladder never
 * managed — you get in, you go up, you arrive, and you can leave.
 */

/** Run the car for a given number of seconds at 60 fps. */
function run(rig: ElevatorRig, seconds: number): void {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) rig.update(1 / 60);
}

describe('service elevator', () => {
  it('starts parked at the bottom', () => {
    const rig = createElevator();
    expect(rig.state).toBe('atBottom');
    expect(rig.height).toBe(BOTTOM);
  });

  it('knows when the player is aboard', () => {
    const rig = createElevator();
    expect(rig.contains(ELEVATOR_X, ELEVATOR_Z)).toBe(true);
    expect(rig.contains(ELEVATOR_X + CAR_HALF + 1, ELEVATOR_Z)).toBe(false);
    expect(rig.contains(0, 0)).toBe(false);
  });

  it('rises to the top when called and stops there', () => {
    const rig = createElevator();
    rig.press(rig.height, true);
    expect(rig.state).toBe('rising');

    run(rig, TOP / SPEED + 2);

    expect(rig.state).toBe('atTop');
    expect(rig.height).toBeCloseTo(TOP, 5);
  });

  it('shows the whole ride rather than teleporting', () => {
    const rig = createElevator();
    rig.press(rig.height, true);

    // Halfway through the trip the car must actually be halfway up.
    run(rig, TOP / SPEED / 2);
    expect(rig.height).toBeGreaterThan(TOP * 0.3);
    expect(rig.height).toBeLessThan(TOP * 0.7);
  });

  it('takes a believable amount of time', () => {
    const expected = TOP / SPEED;
    expect(expected).toBeGreaterThan(6);
    expect(expected).toBeLessThan(15);
  });

  it('comes back down when called again', () => {
    const rig = createElevator();
    rig.press(rig.height, true);
    run(rig, TOP / SPEED + 1);
    expect(rig.state).toBe('atTop');

    rig.press(rig.height, true);
    expect(rig.state).toBe('descending');
    run(rig, TOP / SPEED + 1);

    expect(rig.state).toBe('atBottom');
    expect(rig.height).toBeCloseTo(BOTTOM, 5);
  });

  it('ignores calls while it is moving', () => {
    const rig = createElevator();
    rig.press(rig.height, true);
    run(rig, 1);
    const heightBefore = rig.height;

    rig.press(rig.height, true); // must not reverse mid-travel
    run(rig, 1);

    expect(rig.state).toBe('rising');
    expect(rig.height).toBeGreaterThan(heightBefore);
  });

  it('reports whether it is moving, so the player rides with it', () => {
    const rig = createElevator();
    expect(rig.update(1 / 60)).toBe(false);
    rig.press(rig.height, true);
    expect(rig.update(1 / 60)).toBe(true);
  });

  it('never overshoots either end', () => {
    const rig = createElevator();
    rig.press(rig.height, true);
    run(rig, 60); // far longer than the trip
    expect(rig.height).toBeLessThanOrEqual(TOP);

    rig.press(rig.height, true);
    run(rig, 60);
    expect(rig.height).toBeGreaterThanOrEqual(BOTTOM);
  });

  it('stops where both high slots are actually visible', () => {
    // The original stop at 45.6 m put the payload attach point 9.8 m above the
    // camera, at 38 degrees — outside the 36-degree half-FOV. The placement
    // preview rendered correctly and the player never saw it.
    const rig = createElevator();
    rig.press(rig.height, true);
    run(rig, TOP / SPEED + 1);

    const EYE = 1.72;
    const STAND_Y = 1.6;
    const cameraY = rig.height + EYE;
    // Attach heights for the two slots fitted from up here.
    const payloadAttach = STAND_Y + 42 + 13.5;
    const fairingAttach = payloadAttach + 4.2;
    // Horizontal distance from the car to the stack centre.
    const reach = ELEVATOR_X;

    for (const [name, attachY] of [
      ['payload', payloadAttach],
      ['fairing', fairingAttach],
    ] as Array<[string, number]>) {
      const angle =
        (Math.atan2(Math.abs(attachY - cameraY), reach) * 180) / Math.PI;
      expect(angle, `${name} at ${angle.toFixed(0)} degrees`).toBeLessThan(34);
    }
  });

  it('must be called before it can be boarded from the other end', () => {
    // Stepping off at the top used to strand the car up there, and the next
    // press teleported the player rather than moving the lift.
    const rig = createElevator();
    rig.press(rig.height, true);
    run(rig, TOP / SPEED + 1);
    expect(rig.state).toBe('atTop');

    // Player is now on the ground, car is at the top. Pressing from outside
    // must bring the car down, not move the player.
    const result = rig.press(0, false);
    expect(result).toBe('calling');
    expect(rig.state).toBe('calledDown');

    run(rig, TOP / SPEED + 1);
    expect(rig.state).toBe('atBottom');
    expect(rig.height).toBeCloseTo(BOTTOM, 3);
  });

  it('can be called up to a player who is already at the top', () => {
    const rig = createElevator();
    expect(rig.state).toBe('atBottom');

    // Player somehow at the top with the car at the bottom.
    const result = rig.press(TOP, false);
    expect(result).toBe('calling');
    run(rig, TOP / SPEED + 1);
    expect(rig.height).toBeCloseTo(TOP, 3);
  });

  it('knows when it is level enough to board', () => {
    const rig = createElevator();
    expect(rig.isLevelWith(0)).toBe(true);
    expect(rig.isLevelWith(TOP)).toBe(false);

    rig.press(rig.height, true);
    run(rig, TOP / SPEED + 1);
    expect(rig.isLevelWith(TOP)).toBe(true);
    expect(rig.isLevelWith(0)).toBe(false);
  });

  it('describes its state for the HUD', () => {
    const rig = createElevator();
    expect(rig.describe()).toContain('ground');
    rig.press(rig.height, true);
    run(rig, 1);
    expect(rig.describe()).toContain('Ascending');
  });
});
