/**
 * Part stations: one bench per build step.
 *
 * There used to be one bench per *part*, ten in all, which was confusing for
 * two reasons: walking to a different bench was a second way of doing what the
 * Tab panel already does, and ten benches with the same layout were
 * indistinguishable at a glance.
 *
 * Now there is a single station per step, laid out left to right in build
 * order. The options for that step are chosen at the station with Tab.
 */

export interface StationDefinition {
  id: string;
  /** Build step, 1-4. The options for it come from the part library. */
  step: number;
  /** The kind of part this station issues. */
  kind: 'booster' | 'upper' | 'payload' | 'fairing';
  /** Floor position. */
  x: number;
  z: number;
  /** Facing, radians, so the placard reads toward the room. */
  rotation: number;
  /** Heading shown on the placard. */
  label: string;
  /** Colour group for signage. */
  bay: 'stages' | 'payloads' | 'structure';
}

/**
 * The four stations, in a row along the back of the bay.
 *
 * Left to right in build order, so the player walks a straight line from the
 * first part to the last and can see all four from one position.
 */
export const STATIONS: StationDefinition[] = [
  {
    id: 'st-step1',
    step: 1,
    kind: 'booster',
    x: -16.5,
    z: -19,
    rotation: 0,
    label: 'Step 1 · First stage',
    bay: 'stages',
  },
  {
    id: 'st-step2',
    step: 2,
    kind: 'upper',
    x: -5.5,
    z: -19,
    rotation: 0,
    label: 'Step 2 · Second stage',
    bay: 'stages',
  },
  {
    id: 'st-step3',
    step: 3,
    kind: 'payload',
    x: 5.5,
    z: -19,
    rotation: 0,
    label: 'Step 3 · Payload',
    bay: 'payloads',
  },
  {
    id: 'st-step4',
    step: 4,
    kind: 'fairing',
    x: 16.5,
    z: -19,
    rotation: 0,
    label: 'Step 4 · Fairing',
    bay: 'structure',
  },
];

/** How close the player must be to work at a station. Metres. */
export const STATION_REACH = 4.2;

export function stationNear(x: number, z: number): StationDefinition | null {
  let best: StationDefinition | null = null;
  let bestDistance = STATION_REACH;
  for (const station of STATIONS) {
    const d = Math.hypot(x - station.x, z - station.z);
    if (d < bestDistance) {
      bestDistance = d;
      best = station;
    }
  }
  return best;
}

/** The station that issues a given kind of part. */
export function stationForKind(
  kind: StationDefinition['kind'],
): StationDefinition | null {
  return STATIONS.find((s) => s.kind === kind) ?? null;
}

/** The station for a build step. */
export function stationForStep(step: number): StationDefinition | null {
  return STATIONS.find((s) => s.step === step) ?? null;
}
