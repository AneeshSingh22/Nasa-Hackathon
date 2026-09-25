/**
 * Part stations: the benches around the floor where components are stored.
 *
 * The layout follows the build sequence. Step 1 and step 2 run down the left
 * wall, step 3's four payloads sit side by side across the back, and step 4 is
 * on the right — so the player walks one continuous route from the first part
 * to the last instead of crossing the bay between sequential steps.
 *
 * Each step's options stay adjacent, which is what makes them read as
 * alternatives rather than as unrelated benches.
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
  /** Build step, 1-4, shown large on the placard and painted on the floor. */
  step: number;
}

export const STATIONS: StationDefinition[] = [
  // ---- step 1: first stage, three options down the left wall ----
  {
    id: 'st-core',
    partId: 'core-booster',
    x: -24,
    z: 12,
    rotation: Math.PI / 2,
    label: 'Step 1 · Option A',
    bay: 'stages',
    step: 1,
  },
  {
    id: 'st-solid',
    partId: 'solid-booster',
    x: -24,
    z: 5,
    rotation: Math.PI / 2,
    label: 'Step 1 · Option B',
    bay: 'stages',
    step: 1,
  },
  {
    id: 'st-extended',
    partId: 'extended-booster',
    x: -24,
    z: -2,
    rotation: Math.PI / 2,
    label: 'Step 1 · Option C',
    bay: 'stages',
    step: 1,
  },

  // ---- step 2: second stage, continuing down the same wall ----
  {
    id: 'st-hydrolox',
    partId: 'upper-stage',
    x: -24,
    z: -10,
    rotation: Math.PI / 2,
    label: 'Step 2 · Option A',
    bay: 'stages',
    step: 2,
  },
  {
    id: 'st-kerolox',
    partId: 'kerolox-upper',
    x: -24,
    z: -17,
    rotation: Math.PI / 2,
    label: 'Step 2 · Option B',
    bay: 'stages',
    step: 2,
  },

  // ---- step 3: payloads, four side by side across the back wall ----
  {
    id: 'st-comms',
    partId: 'comms-probe',
    x: -13,
    z: -19.5,
    rotation: 0,
    label: 'Step 3 · Option A',
    bay: 'payloads',
    step: 3,
  },
  {
    id: 'st-telescope',
    partId: 'telescope',
    x: -7,
    z: -19.5,
    rotation: 0,
    label: 'Step 3 · Option B',
    bay: 'payloads',
    step: 3,
  },
  {
    id: 'st-crew',
    partId: 'crew-capsule',
    x: -1,
    z: -19.5,
    rotation: 0,
    label: 'Step 3 · Option C',
    bay: 'payloads',
    step: 3,
  },
  {
    id: 'st-lab',
    partId: 'science-lab',
    x: 5,
    z: -19.5,
    rotation: 0,
    label: 'Step 3 · Option D',
    bay: 'payloads',
    step: 3,
  },

  // ---- step 4: fairing, right wall ----
  {
    id: 'st-fairing',
    partId: 'fairing',
    x: 24,
    z: -12,
    rotation: -Math.PI / 2,
    label: 'Step 4 · Fairing',
    bay: 'structure',
    step: 4,
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

/** All stations for one build step, in the order they are laid out. */
export function stationsForStep(step: number): StationDefinition[] {
  return STATIONS.filter((s) => s.step === step);
}
