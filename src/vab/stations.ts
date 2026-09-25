/**
 * Part stations: the benches around the floor where components are stored.
 *
 * Assembly used to be four presses of E in one spot, which taught the player
 * nothing about the parts and gave them nothing to do. Now each component sits
 * on its own station with a placard, the player walks over, picks it up,
 * carries it to the stand and places it. Choosing a payload means walking to a
 * different bench, not cycling a menu.
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
  /** Which group of stations this belongs to, for signage. */
  bay: 'stages' | 'payloads' | 'structure';
}

/**
 * The floor plan.
 *
 * Stages down the left wall, payloads along the back, structure on the right.
 * Grouping them means the player learns the room, and the payload bay reads as
 * a set of alternatives because the four options sit side by side.
 */
export const STATIONS: StationDefinition[] = [
  {
    id: 'st-booster',
    partId: 'core-booster',
    x: -19,
    z: 6,
    rotation: Math.PI / 2,
    label: 'First stage',
    bay: 'stages',
  },
  {
    id: 'st-upper',
    partId: 'upper-stage',
    x: -19,
    z: -6,
    rotation: Math.PI / 2,
    label: 'Second stage',
    bay: 'stages',
  },
  {
    id: 'st-comms',
    partId: 'comms-probe',
    x: -10.5,
    z: -17,
    rotation: 0,
    label: 'Payload A',
    bay: 'payloads',
  },
  {
    id: 'st-telescope',
    partId: 'telescope',
    x: -3.5,
    z: -17,
    rotation: 0,
    label: 'Payload B',
    bay: 'payloads',
  },
  {
    id: 'st-crew',
    partId: 'crew-capsule',
    x: 3.5,
    z: -17,
    rotation: 0,
    label: 'Payload C',
    bay: 'payloads',
  },
  {
    id: 'st-lab',
    partId: 'science-lab',
    x: 10.5,
    z: -17,
    rotation: 0,
    label: 'Payload D',
    bay: 'payloads',
  },
  {
    id: 'st-fairing',
    partId: 'fairing',
    x: 19,
    z: -8,
    rotation: -Math.PI / 2,
    label: 'Fairing',
    bay: 'structure',
  },
];

/** How close the player must be to pick a part off a station. Metres. */
export const STATION_REACH = 3.2;

export function stationNear(
  x: number,
  z: number,
): StationDefinition | null {
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
