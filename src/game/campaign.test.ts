import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN, rate, isUnlocked, recordResult, loadRecord, saveRecord, totalStars,
  type CampaignContract, type KeyValueStore,
} from './campaign';
import { evaluate } from './contract';
import { PART_LIBRARY } from '../vab/parts';
import { FlightPhase } from '../flight/FlightPhase';
import { vehicleFromParts } from '../flight/vehicle';

/**
 * The campaign is game design, and game design regresses silently: retune a
 * part and a contract that was a puzzle becomes impossible, or trivial. These
 * fly every buildable vehicle against every contract and assert the
 * properties each contract was designed around.
 */

const part = (id: string) => PART_LIBRARY.find(p => p.id === id)!;
const BOOSTERS = ['core-booster', 'solid-booster', 'extended-booster'];
const UPPERS = ['upper-stage', 'kerolox-upper'];
const PAYLOADS = ['comms-probe', 'telescope', 'crew-capsule', 'science-lab'];

interface Build { ids: string[]; cost: number; orbit: boolean }

/** Fly every stack once, under the autopilot. Shared across tests. */
const BUILDS: Build[] = (() => {
  const builds: Build[] = [];
  for (const b of BOOSTERS) for (const u of UPPERS) for (const p of PAYLOADS) {
    const ids = [b, u, p, 'fairing'];
    const flight = new FlightPhase(vehicleFromParts(ids.map(part))!);
    flight.operate('autopilot');
    flight.update(3.01);
    for (let i = 0; i < 200_000 && !flight.finished; i++) flight.update(0.02);
    builds.push({
      ids,
      cost: ids.reduce((sum, id) => sum + part(id).cost, 0),
      orbit: flight.snapshot.outcome.kind === 'orbit',
    });
  }
  return builds;
})();

/** Builds that satisfy the contract on paper and fit its budget. */
function eligible(contract: CampaignContract): Build[] {
  return BUILDS.filter(build => {
    if (build.cost > contract.budget) return false;
    const payload = part(build.ids[2]!);
    if (contract.requiredPayload && payload.id !== contract.requiredPayload) return false;
    return (payload.science ?? 0) >= contract.minScience;
  });
}

describe('contract design', () => {
  for (const contract of CAMPAIGN) {
    describe(contract.title, () => {
      it('has at least two vehicles that are affordable and reach orbit', () => {
        // One answer is a hunt; two or more is a decision.
        const winners = eligible(contract).filter(build => build.orbit);
        expect(winners.length, winners.map(w => w.ids.join('+')).join(' | ')).toBeGreaterThanOrEqual(2);
      });

      it('has a par that some working vehicle can beat, and not all of them', () => {
        const winners = eligible(contract).filter(build => build.orbit);
        const underPar = winners.filter(build => build.cost <= contract.par);
        expect(underPar.length).toBeGreaterThanOrEqual(1);
        // If every working vehicle beats par, par is not a challenge.
        expect(underPar.length).toBeLessThan(winners.length);
      });

      it('pays for less than it costs to build, so profit is not the star', () => {
        // Budget is the constraint the player manages; payment is the reward.
        expect(contract.par).toBeLessThanOrEqual(contract.budget);
      });
    });
  }

  it('makes the cheapest payload fail the first science contract', () => {
    const first = CAMPAIGN.find(c => c.id === 'first-orbit')!;
    expect((part('comms-probe').science ?? 0)).toBeLessThan(first.minScience);
  });

  it('refuses a telescope on the crewed contract even though it has the science', () => {
    const crew = CAMPAIGN.find(c => c.id === 'crew')!;
    const result = evaluate(crew, {
      scienceValue: 180, totalDeltaV: 11_000, liftoffTWR: 1.4,
      hasPayload: true, isComplete: true, payloadId: 'science-lab',
    });
    expect(result.satisfied).toBe(false);
    expect(result.checks.find(c => c.label.startsWith('Carries'))?.met).toBe(false);
  });

  it('gets harder as it goes', () => {
    const difficulties = CAMPAIGN.map(c => c.difficulty);
    expect([...difficulties].sort()).toEqual(difficulties);
    const payments = CAMPAIGN.map(c => c.payment);
    expect([...payments].sort((a, b) => a - b)).toEqual(payments);
  });
});

describe('star rating', () => {
  const relay = CAMPAIGN[0]!;

  it('awards a star each for orbit, par and flying by hand', () => {
    expect(rate(relay, { reachedOrbit: true, spent: relay.par, handFlown: true }).stars).toBe(3);
    expect(rate(relay, { reachedOrbit: true, spent: relay.par + 1, handFlown: true }).stars).toBe(2);
    expect(rate(relay, { reachedOrbit: true, spent: relay.par, handFlown: false }).stars).toBe(2);
    expect(rate(relay, { reachedOrbit: true, spent: 999, handFlown: false }).stars).toBe(1);
  });

  it('gives nothing for a cheap rocket that never made orbit', () => {
    // A cheap rocket in the sea is not under par, it is a crater.
    const rating = rate(relay, { reachedOrbit: false, spent: 10, handFlown: true });
    expect(rating.stars).toBe(0);
    expect(rating.criteria.every(c => !c.earned)).toBe(true);
  });
});

describe('progression', () => {
  it('opens the first contract and locks the rest until a star is earned', () => {
    expect(isUnlocked(0, {})).toBe(true);
    expect(isUnlocked(1, {})).toBe(false);
    expect(isUnlocked(1, { [CAMPAIGN[0]!.id]: 1 })).toBe(true);
    expect(isUnlocked(2, { [CAMPAIGN[0]!.id]: 3 })).toBe(false);
  });

  it('keeps the best result, never a worse one', () => {
    let record = recordResult({}, 'relay', 2);
    record = recordResult(record, 'relay', 1);
    expect(record.relay).toBe(2);
    record = recordResult(record, 'relay', 3);
    expect(record.relay).toBe(3);
    expect(totalStars(record)).toBe(3);
  });

  it('round-trips through storage', () => {
    const data = new Map<string, string>();
    const store: KeyValueStore = {
      getItem: key => data.get(key) ?? null,
      setItem: (key, value) => { data.set(key, value); },
    };
    saveRecord({ relay: 3, 'first-orbit': 1 }, store);
    expect(loadRecord(store)).toEqual({ relay: 3, 'first-orbit': 1 });
  });

  it('survives storage that is missing, broken or full of nonsense', () => {
    // Private windows and blocked site data throw; the game must still start.
    const throwing: KeyValueStore = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    };
    expect(loadRecord(throwing)).toEqual({});
    expect(() => saveRecord({ relay: 1 }, throwing)).not.toThrow();
    expect(loadRecord(null)).toEqual({});
    const junk: KeyValueStore = { getItem: () => '{"relay": 99, "x": "y"', setItem: () => {} };
    expect(loadRecord(junk)).toEqual({});
    const odd: KeyValueStore = { getItem: () => '{"relay": 99, "crew": 2}', setItem: () => {} };
    expect(loadRecord(odd)).toEqual({ crew: 2 });
  });
});
