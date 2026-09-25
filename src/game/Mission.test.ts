import { describe, it, expect } from 'vitest';
import { Mission, MISSION_2_START, COSTS } from './Mission';
import { PART_LIBRARY } from '../vab/parts';

/**
 * The assembly phase had no way to lose, which made it a sandbox rather than a
 * game. These tests pin the balance: a clean build must succeed comfortably,
 * and careless rebuilding must actually end the mission.
 */

const cost = (id: string): number => {
  const part = PART_LIBRARY.find((p) => p.id === id);
  if (!part) throw new Error(`no such part: ${id}`);
  return part.cost;
};

/**
 * One valid vehicle, not the whole catalog.
 *
 * The library now offers four payloads and a build uses exactly one of them,
 * so summing every part would price a rocket nobody would build.
 */
const BUILD_PARTS = ['core-booster', 'upper-stage', 'telescope', 'fairing'];

const TOTAL_BUILD_COST = BUILD_PARTS.reduce((sum, id) => sum + cost(id), 0);

/** Fit one complete vehicle, the way a player who knows what they want would. */
function cleanBuild(mission: Mission): void {
  for (const id of BUILD_PARTS) mission.fitPart(cost(id));
}

describe('Mission constraints', () => {
  it('starts with every resource intact', () => {
    const m = new Mission();
    const s = m.status;
    expect(s.failed).toBe(false);
    expect(s.budget).toBe(MISSION_2_START.budget);
    expect(s.daysRemaining).toBe(MISSION_2_START.daysRemaining);
    expect(s.confidence).toBe(MISSION_2_START.confidence);
  });

  it('lets a clean build finish with margin on all three resources', () => {
    const m = new Mission();
    cleanBuild(m);
    const s = m.status;

    expect(s.failed).toBe(false);
    // A player who commits to a design should not feel squeezed.
    expect(s.budget).toBeGreaterThan(50);
    expect(s.daysRemaining).toBeGreaterThan(10);
    expect(s.confidence).toBe(MISSION_2_START.confidence);
  });

  it('costs less to build than the budget allows', () => {
    expect(TOTAL_BUILD_COST).toBeLessThan(MISSION_2_START.budget);
  });

  it('refunds only part of a removed part, so rebuilding is never free', () => {
    const m = new Mission();
    const before = m.status.budget;
    m.fitPart(100);
    m.removePart(100);
    expect(m.status.budget).toBeLessThan(before);
    expect(m.status.budget).toBeCloseTo(before - 100 * (1 - COSTS.refundFraction), 5);
  });

  it('bankrupts a player who keeps swapping the expensive payload', () => {
    const m = new Mission();
    cleanBuild(m);
    const payload = cost('telescope');

    // Two swaps of the most expensive optional part should end it.
    m.removePart(payload);
    m.fitPart(payload);
    expect(m.status.failed).toBe(false);

    m.removePart(payload);
    m.fitPart(payload);
    expect(m.status.failed).toBe(true);
    expect(m.status.failureReason).toBe('budget');
  });

  it('lets cheap swaps run longer than expensive ones', () => {
    const fairing = cost('fairing');
    const payload = cost('telescope');
    expect(fairing).toBeLessThan(payload / 3);

    const m = new Mission();
    cleanBuild(m);
    // Three swaps of the cheap fairing must not bankrupt the programme, so the
    // resource that kills you depends on what you waste.
    for (let i = 0; i < 3; i++) {
      m.removePart(fairing);
      m.fitPart(fairing);
    }
    expect(m.status.failureReason).not.toBe('budget');
  });

  it('scrubs the mission when the launch window closes', () => {
    const m = new Mission();
    // Burn days without spending much money, using the cheapest part.
    const cheap = cost('fairing');
    for (let i = 0; i < 12; i++) {
      if (m.status.failed) break;
      m.removePart(cheap);
      m.fitPart(cheap);
    }
    expect(m.status.failed).toBe(true);
    expect(m.status.failureReason).toBe('schedule');
    expect(m.status.failureText).toContain('window');
  });

  it('never lets confidence go negative', () => {
    const m = new Mission();
    for (let i = 0; i < 20; i++) m.removePart(1);
    expect(m.status.confidence).toBeGreaterThanOrEqual(0);
  });

  it('reports a failure exactly once', () => {
    const m = new Mission();
    let calls = 0;
    m.onFailure = () => {
      calls += 1;
    };
    // Drive it well past the failure point.
    for (let i = 0; i < 30; i++) m.fitPart(100);
    expect(calls).toBe(1);
  });

  it('refuses further actions once the mission has ended', () => {
    const m = new Mission();
    for (let i = 0; i < 30; i++) m.fitPart(100);
    expect(m.hasFailed).toBe(true);

    const frozen = m.status;
    expect(m.fitPart(50)).toBe(false);
    expect(m.status.budget).toBe(frozen.budget);
    expect(m.status.daysRemaining).toBe(frozen.daysRemaining);
  });

  it('warns before it kills, and only once per threshold', () => {
    const m = new Mission();
    const warnings: string[] = [];
    m.onWarning = (t) => warnings.push(t);

    const payload = cost('telescope');
    cleanBuild(m);
    m.removePart(payload);
    m.fitPart(payload);

    // The player should have been told the budget was tight before losing.
    expect(warnings.length).toBeGreaterThan(0);
    const budgetWarnings = warnings.filter((w) => w.includes('million'));
    expect(budgetWarnings.length).toBeLessThanOrEqual(1);
  });

  it('identifies which resource is closest to running out', () => {
    const m = new Mission();
    cleanBuild(m);
    const tightest = m.tightestMargin();
    expect(['budget', 'schedule', 'confidence']).toContain(tightest.resource);
    expect(tightest.fraction).toBeGreaterThan(0);
    expect(tightest.fraction).toBeLessThanOrEqual(1);
  });

  it('restores every resource on reset', () => {
    const m = new Mission();
    for (let i = 0; i < 30; i++) m.fitPart(100);
    expect(m.hasFailed).toBe(true);

    m.reset();
    expect(m.hasFailed).toBe(false);
    expect(m.status.budget).toBe(MISSION_2_START.budget);
    expect(m.status.daysRemaining).toBe(MISSION_2_START.daysRemaining);
    expect(m.status.confidence).toBe(MISSION_2_START.confidence);

    // And warnings must be able to fire again after a reset.
    const warnings: string[] = [];
    m.onWarning = (t) => warnings.push(t);
    cleanBuild(m);
    m.removePart(cost('telescope'));
    m.fitPart(cost('telescope'));
    expect(warnings.length).toBeGreaterThan(0);
  });
});

describe('accidents', () => {
  it('ends the mission outright', () => {
    // Working at height had no risk before this: falling cost a few days and
    // the elevator was a formality.
    const m = new Mission();
    m.abort('accident', 'You fell from the work platform.');

    expect(m.hasFailed).toBe(true);
    expect(m.status.failureReason).toBe('accident');
    expect(m.status.failureText).toContain('fell');
  });

  it('reports the accident through the failure callback', () => {
    const m = new Mission();
    let reported: string | null = null;
    m.onFailure = (reason) => {
      reported = reason;
    };
    m.abort('accident', 'Fell 45 metres.');
    expect(reported).toBe('accident');
  });

  it('cannot be overridden by a later failure', () => {
    const m = new Mission();
    let calls = 0;
    m.onFailure = () => {
      calls += 1;
    };
    m.abort('accident', 'Fell.');
    // Draining the budget afterwards must not fire a second ending.
    for (let i = 0; i < 20; i++) m.fitPart(100);
    expect(calls).toBe(1);
    expect(m.status.failureReason).toBe('accident');
  });

  it('freezes the programme after an accident', () => {
    const m = new Mission();
    const before = m.status.budget;
    m.abort('accident', 'Fell.');
    expect(m.fitPart(50)).toBe(false);
    expect(m.status.budget).toBe(before);
  });

  it('clears on reset, so the player can try again', () => {
    const m = new Mission();
    m.abort('accident', 'Fell.');
    m.reset();
    expect(m.hasFailed).toBe(false);
    expect(m.status.failureReason).toBeNull();
    expect(m.status.budget).toBe(MISSION_2_START.budget);
  });
});
