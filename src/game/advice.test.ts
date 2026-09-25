import { describe, it, expect } from 'vitest';
import { adviseOn, type AdviceContext } from './advice';

/**
 * Advice must assist without answering.
 *
 * The narrator previously volunteered everything and the result was
 * exhausting. Now she speaks on request, and the rule is that she names the
 * trade-off rather than the choice — otherwise asking for help deletes the
 * decision the phase exists to create.
 */

const base: AdviceContext = {
  fittedCount: 2,
  nextKind: 'payload',
  inPosition: true,
  onGantry: true,
  contractSatisfied: false,
  failingChecks: [],
  deltaVMargin: 1000,
  science: 0,
  scienceRequired: 100,
  budget: 200,
  days: 15,
  hasPayload: false,
};

const ctx = (over: Partial<AdviceContext>): AdviceContext => ({ ...base, ...over });

/** The names of the payloads, which advice must never recommend by name. */
const PAYLOAD_NAMES = ['telescope', 'comsat', 'capsule', 'laboratory', 'lab'];

describe('on-demand advice', () => {
  it('never names a payload to fit', () => {
    // This is the property that keeps it advice rather than an answer key.
    const situations: Array<Partial<AdviceContext>> = [
      { nextKind: 'payload' },
      { nextKind: 'payload', inPosition: false },
      { hasPayload: true, science: 40, contractSatisfied: false },
      { hasPayload: true, deltaVMargin: -300, science: 180 },
      { contractSatisfied: true, deltaVMargin: 59 },
      { fittedCount: 0, nextKind: 'booster' },
    ];
    for (const situation of situations) {
      const text = adviseOn(ctx(situation)).toLowerCase();
      for (const name of PAYLOAD_NAMES) {
        expect(text, `advised "${text}" for ${JSON.stringify(situation)}`)
          .not.toContain(name);
      }
    }
  });

  it('prioritises a resource that is about to end the run', () => {
    const broke = adviseOn(ctx({ budget: 20 }));
    expect(broke).toContain('million');

    const late = adviseOn(ctx({ days: 3 }));
    expect(late.toLowerCase()).toContain('window');
  });

  it('tells a lost player where to stand, not what to fit', () => {
    const text = adviseOn(ctx({ nextKind: 'payload', inPosition: false }));
    expect(text.toLowerCase()).toContain('ladder');
  });

  it('explains the trade at the payload decision', () => {
    const text = adviseOn(ctx({ nextKind: 'payload' })).toLowerCase();
    // It should mention both sides of the trade.
    expect(text).toContain('science');
    expect(text).toMatch(/margin|delta-v/);
  });

  it('diagnoses a science shortfall with the actual numbers', () => {
    const text = adviseOn(
      ctx({ hasPayload: true, science: 40, nextKind: null, contractSatisfied: false }),
    );
    expect(text).toContain('40');
    expect(text).toContain('100');
  });

  it('diagnoses a delta-v shortfall', () => {
    const text = adviseOn(
      ctx({
        hasPayload: true,
        science: 180,
        deltaVMargin: -250,
        nextKind: null,
        contractSatisfied: false,
      }),
    );
    expect(text).toContain('250');
  });

  it('warns about a thin margin without forbidding it', () => {
    const text = adviseOn(
      ctx({ contractSatisfied: true, deltaVMargin: 59, nextKind: null, hasPayload: true }),
    );
    expect(text).toContain('59');
    // It should leave the decision with the player.
    expect(text.toLowerCase()).toMatch(/your choice|risk/);
  });

  it('confirms a good vehicle and says how to proceed', () => {
    const text = adviseOn(
      ctx({ contractSatisfied: true, deltaVMargin: 1101, nextKind: null, hasPayload: true }),
    );
    expect(text).toContain('1101');
    expect(text).toContain('F');
  });

  it('always returns something to say', () => {
    const text = adviseOn(ctx({ nextKind: null, contractSatisfied: false, hasPayload: false }));
    expect(text.length).toBeGreaterThan(10);
  });
});
