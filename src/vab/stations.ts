/**
 * Part stations: the benches around the floor where components are stored.
 *
 * Assembly used to be four presses of E in one spot, which taught the player
 * nothing about the parts and gave them nothing to do. Now each component sits
 * on its own station with a printed placard, and choosing between alternatives
 * means walking to a different bench rather than cycling a menu.
 */

export interface StationDefinition {
  id: string;
  /** The part this station holds. */
  partId: string;
  /** Floor position. */
  x: number;
  z: number;
  /** Facing, radians, so the placard reads toward the room. */
  rotation: number;
  /** Heading shown on the placard. */
  label: string;
  /** Which group of stations this belongs to, for signage and colour. */
  bay: 'stages' | 'payloads' | 'structure';
}

/**
 * The floor plan.
 *
 * First stages down the left wall, upper stages on the near left, the four
 * payloads across the back, the fairing on the right. Grouping them means the
 * player learns the room, and each bay reads as a set of alternatives because
 * its options sit side by side.
 */
export const STATIONS: StationDefinition[] = [
  // ---- first stages, left wall ----
  {
    id: 'st-core',
    partId: 'core-booster',
    x: -23,
    z: 10,
    rotation: Math.PI / 2,
    label: 'Step 1 · Option A',
    bay: 'stages',
  },
  {
    id: 'st-solid',
    partId: 'solid-booster',
    x: -23,
    z: 2,
    rotation: Math.PI / 2,
    label: 'Step 1 · Option B',
    bay: 'stages',
  },
  {
    id: 'st-extended',
    partId: 'extended-booster',
    x: -23,
    z: -6,
    rotation: Math.PI / 2,
    label: 'Step 1 · Option C',
    bay: 'stages',
  },

  // ---- upper stages, left wall further back ----
  {
    id: 'st-hydrolox',
    partId: 'upper-stage',
    x: -23,
    z: -13,
    rotation: Math.PI / 2,
    label: 'Step 2 · Option A',
    bay: 'stages',
  },
  {
    id: 'st-kerolox',
    partId: 'kerolox-upper',
    x: -23,
    z: -19.5,
    rotation: Math.PI / 2,
    label: 'Step 2 · Option B',
    bay: 'stages',
  },

  // ---- payloads, back wall ----
  {
    id: 'st-comms',
    partId: 'comms-probe',
    x: -6,
    z: -19,
    rotation: 0,
    label: 'Step 3 · Option A',
    bay: 'payloads',
  },
  {
    id: 'st-telescope',
    partId: 'telescope',
    x: 1,
    z: -19,
    rotation: 0,
    label: 'Step 3 · Option B',
    bay: 'payloads',
  },
  {
    id: 'st-crew',
    partId: 'crew-capsule',
    x: 8,
    z: -19,
    rotation: 0,
    label: 'Step 3 · Option C',
    bay: 'payloads',
  },
  {
    id: 'st-lab',
    partId: 'science-lab',
    x: 15,
    z: -19,
    rotation: 0,
    label: 'Step 3 · Option D',
    bay: 'payloads',
  },

  // ---- structure, right wall ----
  {
    id: 'st-fairing',
    partId: 'fairing',
    x: 23,
    z: -10,
    rotation: -Math.PI / 2,
    label: 'Step 4 · Fairing',
    bay: 'structure',
  },
];

/** How close the player must be to pick a part off a station. Metres. */
export const STATION_REACH = 3.6;

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

export function stationFor(partId: string): StationDefinition | null {
  return STATIONS.find((s) => s.partId === partId) ?? null;
}

/** All stations in one bay, for signage above the group. */
export function stationsInBay(bay: StationDefinition['bay']): StationDefinition[] {
  return STATIONS.filter((s) => s.bay === bay);
}
