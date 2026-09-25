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
    rig.call();
    expect(rig.state).toBe('rising');

    run(rig, TOP / SPEED + 2);

    expect(rig.state).toBe('atTop');
    expect(rig.height).toBeCloseTo(TOP, 5);
  });

  it('shows the whole ride rather than teleporting', () => {
    const rig = createElevator();
    rig.call();

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
    rig.call();
    run(rig, TOP / SPEED + 1);
    expect(rig.state).toBe('atTop');

    rig.call();
    expect(rig.state).toBe('descending');
    run(rig, TOP / SPEED + 1);

    expect(rig.state).toBe('atBottom');
    expect(rig.height).toBeCloseTo(BOTTOM, 5);
  });

  it('ignores calls while it is moving', () => {
    const rig = createElevator();
    rig.call();
    run(rig, 1);
    const heightBefore = rig.height;

    rig.call(); // must not reverse mid-travel
    run(rig, 1);

    expect(rig.state).toBe('rising');
    expect(rig.height).toBeGreaterThan(heightBefore);
  });

  it('reports whether it is moving, so the player rides with it', () => {
    const rig = createElevator();
    expect(rig.update(1 / 60)).toBe(false);
    rig.call();
    expect(rig.update(1 / 60)).toBe(true);
  });

  it('never overshoots either end', () => {
    const rig = createElevator();
    rig.call();
    run(rig, 60); // far longer than the trip
    expect(rig.height).toBeLessThanOrEqual(TOP);

    rig.call();
    run(rig, 60);
    expect(rig.height).toBeGreaterThanOrEqual(BOTTOM);
  });

  it('arrives level with the top working platform', () => {
    // The payload is fitted from this height, so the two must agree.
    const rig = createElevator();
    rig.call();
    run(rig, TOP / SPEED + 1);
    expect(rig.height).toBeCloseTo(45.6, 2);
  });
});
