import { CONTRACT_FIRST_ORBIT, type Contract } from './contract';

/**
 * The campaign: a board of contracts, each a small engineering puzzle, with a
 * star rating that rewards doing it well rather than merely doing it.
 *
 * ## Why this exists
 *
 * With a single contract the build phase was a tutorial: one goal, one
 * obvious answer, the narrator reading out the build order. A game needs a
 * choice of goal, a reason to replay, and a way to do better than "done".
 *
 * ## How the contracts were designed
 *
 * Not by feel. Every buildable stack was flown to orbit under the autopilot,
 * and each contract's budget and par were set against that table so that:
 *
 * - every contract has at least two working builds, so it is a decision and
 *   not a hunt for the single answer;
 * - par is reachable by exactly the cheap-but-sound builds, so beating it means
 *   finding the efficient vehicle rather than over-building;
 * - difficulty rises with how little margin the working builds have. The deep
 *   survey's two solutions both sit in the MARGINAL band: they reach orbit
 *   under the autopilot and demand a clean ascent by hand.
 *
 * `campaign.test.ts` pins those properties against the real library and the
 * real flight model, so a part retune that breaks a contract fails the suite.
 */

export interface CampaignContract extends Contract {
  /** 1 (easy) to 4 (expert). */
  readonly difficulty: 1 | 2 | 3 | 4;
  /** One line for the mission board. */
  readonly tagline: string;
  /** Starting budget for this mission, millions of dollars. */
  readonly budget: number;
  /**
   * Par: the cost of an efficient vehicle, millions. Spending no more than
   * this — swaps and refunds included — earns a star.
   */
  readonly par: number;
  /** What the flight director says when the mission is accepted. */
  readonly briefing: string;
}

export const CAMPAIGN: readonly CampaignContract[] = [
  {
    id: 'relay',
    customer: 'TeleNet Communications',
    title: 'Relay Run',
    tagline: 'Any satellite, any vehicle. Do not overspend.',
    brief: 'Put a communications relay in orbit above 200 kilometres. TeleNet pays on '
      + 'insertion and has no interest in how you get there.',
    briefing: 'TeleNet wants a relay in orbit and they are paying 180 million. Cheap and '
      + 'cheerful will do. Just make sure it gets there.',
    difficulty: 1,
    budget: 300,
    par: 240,
    minScience: 40,
    targetAltitude: 200_000,
    deltaVRequired: 9_400,
    payment: 180,
    marginBonus: { threshold: 800, payment: 20 },
  },
  {
    ...CONTRACT_FIRST_ORBIT,
    tagline: 'A real instrument. A real science floor.',
    briefing: 'The Science Directorate wants an instrument package in orbit, at least '
      + '100 units of science. The cheapest payloads will not clear that.',
    difficulty: 2,
    budget: 480,
    par: 350,
  },
  {
    id: 'crew',
    customer: 'Orbital Crew Programme',
    title: 'Crewed Flight',
    tagline: 'Three people on top. Every kilogram counts.',
    brief: 'Carry the crew capsule to orbit above 200 kilometres. The capsule is eleven '
      + 'tonnes and the budget does not stretch to the biggest stages.',
    briefing: 'This one carries a crew. The capsule is heavy and the budget is tight, so '
      + 'the obvious vehicle is not affordable. Think before you buy.',
    difficulty: 3,
    budget: 430,
    par: 400,
    minScience: 150,
    requiredPayload: 'crew-capsule',
    targetAltitude: 200_000,
    deltaVRequired: 9_400,
    payment: 420,
    marginBonus: { threshold: 800, payment: 40 },
  },
  {
    id: 'survey',
    customer: 'Deep Survey Consortium',
    title: 'Deep Survey',
    tagline: 'The heaviest payload. Almost no margin.',
    brief: 'Fly the pressurised laboratory to orbit above 200 kilometres. Fourteen tonnes '
      + 'of science and a budget that leaves no room to waste a stage.',
    briefing: 'The laboratory is fourteen tonnes. Any vehicle that can lift it is right on '
      + 'the edge, so you will have to fly it cleanly as well as build it right.',
    difficulty: 4,
    budget: 480,
    par: 460,
    minScience: 180,
    requiredPayload: 'science-lab',
    targetAltitude: 200_000,
    deltaVRequired: 9_400,
    payment: 520,
    marginBonus: { threshold: 400, payment: 60 },
  },
];

/** Best stars earned per contract id. */
export type StarRecord = Readonly<Record<string, number>>;

/** How a finished mission went, as far as the rating cares. */
export interface MissionResult {
  readonly reachedOrbit: boolean;
  /** Millions spent, including what swaps and removals cost. */
  readonly spent: number;
  /** True if the autopilot was never engaged in flight. */
  readonly handFlown: boolean;
}

export interface Rating {
  readonly stars: number;
  /** Each star and whether it was earned, in display order. */
  readonly criteria: ReadonlyArray<{ readonly label: string; readonly earned: boolean }>;
}

/**
 * Three stars, each for something a player can choose to do better.
 *
 * Par and hand-flying only count if the vehicle reached orbit: a cheap rocket
 * that falls back into the sea is not under par, it is a crater.
 */
export function rate(contract: CampaignContract, result: MissionResult): Rating {
  const orbit = result.reachedOrbit;
  const underPar = orbit && result.spent <= contract.par;
  const byHand = orbit && result.handFlown;
  const criteria = [
    { label: 'Reach orbit', earned: orbit },
    { label: `Spend $${contract.par}M or less`, earned: underPar },
    { label: 'Fly it by hand', earned: byHand },
  ];
  return { stars: criteria.filter(c => c.earned).length, criteria };
}

/** A contract is open once the one before it has earned at least one star. */
export function isUnlocked(index: number, record: StarRecord): boolean {
  if (index <= 0) return true;
  const previous = CAMPAIGN[index - 1];
  return previous !== undefined && (record[previous.id] ?? 0) >= 1;
}

/** Keep the best rating, never a worse one. */
export function recordResult(record: StarRecord, contractId: string, stars: number): StarRecord {
  return { ...record, [contractId]: Math.max(record[contractId] ?? 0, stars) };
}

// ---------------------------------------------------------- persistence

const STORAGE_KEY = 'adastra.campaign.v1';

/** Minimal storage interface, so tests can pass a fake. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStore(): KeyValueStore | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/**
 * Load saved progress.
 *
 * Browser storage is a convenience, not a guarantee: private windows, blocked
 * site data and sandboxed previews can all throw or return nothing. Every
 * failure path returns an empty record, so the worst case is a fresh campaign
 * rather than a game that will not start.
 */
export function loadRecord(store: KeyValueStore | null = defaultStore()): StarRecord {
  if (!store) return {};
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const record: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'number' && value >= 0 && value <= 3) record[key] = Math.floor(value);
    }
    return record;
  } catch {
    return {};
  }
}

export function saveRecord(record: StarRecord, store: KeyValueStore | null = defaultStore()): void {
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Storage full or blocked: progress is lost for this session, the game is not.
  }
}

/** Total stars, for the board header. */
export function totalStars(record: StarRecord): number {
  return CAMPAIGN.reduce((sum, contract) => sum + (record[contract.id] ?? 0), 0);
}
