import { setWorkHeight } from './workzone';

/**
 * Keeps the elevator and the work zone pointing at the same height.
 *
 * These are two separate systems: the elevator decides where the car stops,
 * and the work zone decides whether the player may fit a part. They disagreed
 * twice, and both times the symptom was the player riding to exactly the right
 * place and being refused.
 *
 * Extracted from main.ts so the real synchronisation can be tested rather than
 * just the two primitives it calls. Testing `setWorkHeight` directly passes
 * even when nothing calls it.
 */

export interface WorkHeightTarget {
  setWorkingHeight: (attachY: number) => void;
  readonly workingHeight: number;
}

/**
 * Point both systems at the current attach point.
 *
 * @param elevator the car, which clamps the stop to its shaft limits
 * @param attachY world height where the next part will attach
 * @returns the stop the car settled on
 */
export function syncWorkHeight(
  elevator: WorkHeightTarget,
  attachY: number,
): number {
  elevator.setWorkingHeight(attachY);
  // Read the height *back* from the elevator rather than recomputing it: the
  // car clamps to its shaft, and the work zone has to follow where the car
  // actually stops, not where it was asked to stop.
  setWorkHeight(elevator.workingHeight);
  return elevator.workingHeight;
}
