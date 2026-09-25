import { describe, it, expect } from 'vitest';
import { carrySpeedFactor, needsCrane, holdOffset, CRANE_THRESHOLD } from './carry';

/**
 * Carrying is where the cost of mass is felt rather than read. These tests keep
 * the feedback monotonic and keep the penalty from becoming a chore.
 */

describe('carrying parts', () => {
  it('does not slow an empty-handed player', () => {
    expect(carrySpeedFactor(0)).toBe(1);
  });

  it('slows the player more for heavier parts', () => {
    const relay = carrySpeedFactor(3_000);
    const telescope = carrySpeedFactor(8_000);
    const lab = carrySpeedFactor(14_000);

    expect(relay).toBeGreaterThan(telescope);
    expect(telescope).toBeGreaterThan(lab);
  });

  it('never slows the player to a crawl', () => {
    // A penalty the player has to endure for a minute is a chore, not
    // feedback.
    expect(carrySpeedFactor(100_000)).toBeGreaterThanOrEqual(0.5);
  });

  it('keeps every carryable part above half speed', () => {
    for (const mass of [3_000, 8_000, 11_000, 14_000]) {
      expect(carrySpeedFactor(mass), `${mass} kg`).toBeGreaterThan(0.55);
    }
  });

  it('sends the stages to the crane rather than the player', () => {
    // A 310-tonne booster is not a two-handed lift.
    expect(needsCrane(326_000)).toBe(true);
    expect(needsCrane(100_500)).toBe(true);
  });

  it('lets a person carry the payloads and the fairing', () => {
    for (const mass of [3_000, 8_000, 11_000, 14_000, 1_900]) {
      expect(needsCrane(mass), `${mass} kg`).toBe(false);
    }
  });

  it('puts the crane threshold above every payload', () => {
    expect(CRANE_THRESHOLD).toBeGreaterThan(14_000);
  });

  it('holds bigger parts further away and smaller', () => {
    const light = holdOffset(1_900);
    const heavy = holdOffset(14_000);

    expect(heavy.forward).toBeGreaterThan(light.forward);
    expect(heavy.scale).toBeLessThan(light.scale);
    expect(heavy.scale).toBeGreaterThan(0);
  });
});
