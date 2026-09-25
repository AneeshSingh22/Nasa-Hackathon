import type { Stage, Vehicle } from '../physics/rocket';

/**
 * The campaign's parts catalog.
 *
 * Specs are modelled on real hardware and calibrated so the missions are
 * flyable. Where a number is tuned for play rather than taken from a source,
 * the comment says so — Lane E's job is to keep that distinction honest,
 * because plausible-looking wrong numbers are the one thing that can sink us
 * on scientific validity.
 */

/** First stage, kerolox, modelled on an Atlas V / Falcon 9 class booster. */
export const CORE_BOOSTER: Stage = {
  id: 'core-booster',
  name: 'LR-90 Core Booster',
  dryMass: 16_000,
  propellantMass: 310_000,
  thrustSeaLevel: 5_900_000,
  thrustVacuum: 6_600_000,
  ispSeaLevel: 282,
  ispVacuum: 311,
  // Cd ~0.3 over a 5.4 m diameter body: 0.3 * pi * 2.7^2 = 6.9. Raised to 11
  // to stand in for fins, interstage and the lift-induced drag a 3-DOF model
  // does not compute. Tuned, not sourced.
  dragArea: 11.0,
  minThrottle: 0.4,
};

/** Second stage, hydrolox, modelled on a Centaur-class upper stage. */
export const UPPER_STAGE: Stage = {
  id: 'upper-stage',
  name: 'RL-20 Upper Stage',
  dryMass: 5_500,
  propellantMass: 95_000,
  thrustSeaLevel: 1_000_000,
  thrustVacuum: 1_150_000,
  ispSeaLevel: 320,
  ispVacuum: 348,
  dragArea: 5.0,
  minThrottle: 0.4,
};

/** A smaller booster, unlocked in Mission 1 — cannot reach orbit on its own. */
export const SOUNDING_BOOSTER: Stage = {
  id: 'sounding-booster',
  name: 'LR-40 Sounding Booster',
  dryMass: 3_200,
  propellantMass: 42_000,
  thrustSeaLevel: 980_000,
  thrustVacuum: 1_090_000,
  ispSeaLevel: 265,
  ispVacuum: 295,
  dragArea: 4.2,
  minThrottle: 0.5,
};

export interface Payload {
  id: string;
  name: string;
  mass: number;
  /** Science value returned if the mission objective is met. */
  scienceValue: number;
  /** Peak electrical draw. W — matters in the operations phase. */
  powerDraw: number;
  description: string;
  /** Shown in the VAB when the player inspects the part. */
  briefing: string;
}

export const PAYLOADS: Payload[] = [
  {
    id: 'comms-probe',
    name: 'Comsat Relay',
    mass: 3_000,
    scienceValue: 40,
    powerDraw: 300,
    description: 'Light, forgiving, low return.',
    briefing:
      'A basic communications relay. At three tonnes it barely dents your delta-v budget, which makes it the right choice while you are still learning to fly the ascent.',
  },
  {
    id: 'telescope',
    name: 'Orbital Telescope',
    mass: 8_000,
    scienceValue: 100,
    powerDraw: 900,
    description: 'The balanced choice.',
    briefing:
      'A one-metre survey telescope. Eight tonnes is the reference payload this vehicle was designed around, so if you fly a clean gravity turn you will make orbit with propellant to spare.',
  },
  {
    id: 'science-lab',
    name: 'Pressurised Science Lab',
    mass: 14_000,
    scienceValue: 180,
    powerDraw: 2_100,
    description: 'Heavy. Demands a near-perfect ascent.',
    briefing:
      'Fourteen tonnes of laboratory. The rocket equation is unforgiving here: this payload eats roughly 600 m/s of your budget compared with the telescope, and it will punish a sloppy pitch programme.',
  },
  {
    id: 'crew-capsule',
    name: 'Crew Capsule',
    mass: 11_000,
    scienceValue: 150,
    powerDraw: 1_400,
    description: 'Three people are aboard. Fly it carefully.',
    briefing:
      'Eleven tonnes, and three crew. Structural limits are the same as any other payload, but a loss here ends the campaign differently — the review board scene is not a formality.',
  },
];

/**
 * The Mission 2 launch vehicle, verified by headless simulation:
 * 435 t on the pad, liftoff TWR 1.38, 10,569 m/s total delta-v.
 *
 * A flown gravity turn reaches roughly 100 x 280 km with propellant left.
 * Straight-up and pitch-over-immediately profiles both fail, which is the
 * behaviour we want: the player has to actually learn the manoeuvre.
 */
export const ATLAS_CLASS_TWO_STAGE: Vehicle = {
  stages: [CORE_BOOSTER, UPPER_STAGE],
  payloadMass: 8_000,
  payloadName: 'Orbital Telescope',
};

/** Mission 1: a single stage that deliberately cannot reach orbit. */
export const SOUNDING_ROCKET: Vehicle = {
  stages: [SOUNDING_BOOSTER],
  payloadMass: 500,
  payloadName: 'Instrument Package',
};

export function vehicleWithPayload(base: Vehicle, payload: Payload): Vehicle {
  return {
    stages: base.stages,
    payloadMass: payload.mass,
    payloadName: payload.name,
  };
}

/**
 * Sources for the hardware these parts are modelled on. The submission needs a
 * citations page, and it is far easier to keep this current than to reconstruct
 * it in week four.
 */
export const CITATIONS = [
  {
    subject: 'Atlas V launch vehicle performance',
    source: 'NASA Launch Services Program, Atlas V Mission Planner’s Guide',
    url: 'https://www.nasa.gov/launch-services-program/',
  },
  {
    subject: 'US Standard Atmosphere 1976 density tables',
    source: 'NOAA / NASA / USAF, US Standard Atmosphere 1976',
    url: 'https://ntrs.nasa.gov/citations/19770009539',
  },
  {
    subject: 'Earth gravitational parameter and radius',
    source: 'NASA Goddard, Earth Fact Sheet',
    url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html',
  },
  {
    subject: 'Moon gravitational parameter, radius and orbit',
    source: 'NASA Goddard, Moon Fact Sheet',
    url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html',
  },
  {
    subject: 'RL10 upper-stage engine performance',
    source: 'NASA Glenn Research Center engine documentation',
    url: 'https://www1.grc.nasa.gov/',
  },
];
