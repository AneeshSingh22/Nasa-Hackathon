import { describe, it, expect } from 'vitest';
import { CONTRACT_FIRST_ORBIT, evaluate } from './contract';
import { PART_LIBRARY } from '../vab/parts';
import { deltaV } from '../physics/rocket';
import { G0 } from '../physics/constants';

/**
 * The contract is what turns assembly from a sequence into a decision. These
 * tests pin the property that matters: several vehicles satisfy it, they are
 * not equally good, and the cheapest payload is a trap rather than an answer.
 */

const contract = CONTRACT_FIRST_ORBIT;
const part = (id: string) => {
  const found = PART_LIBRARY.find((p) => p.id === id);
  if (!found) throw new Error(`no part ${id}`);
  return found;
};

/** Build a stack with the given payload and compute what it can do. */
function vehicleWith(payloadId: string) {
  const booster = part('core-booster');
  const upper = part('upper-stage');
  const fairing = part('fairing');
  const payload = part(payloadId);

  const deadMass = fairing.dryMass + payload.dryMass;

  const stage1Wet =
    deadMass +
    booster.dryMass +
    booster.propellantMass +
    upper.dryMass +
    upper.propellantMass;
  const stage1Dry = stage1Wet - booster.propellantMass;
  const stage2Wet = deadMass + upper.dryMass + upper.propellantMass;
  const stage2Dry = stage2Wet - upper.propellantMass;

  const totalDeltaV =
    deltaV(stage1Wet, stage1Dry, booster.isp) +
    deltaV(stage2Wet, stage2Dry, upper.isp);

  return {
    scienceValue: payload.science ?? 0,
    totalDeltaV,
    liftoffTWR: booster.thrust / (stage1Wet * G0),
    hasPayload: true,
    isComplete: true,
    cost: booster.cost + upper.cost + fairing.cost + payload.cost,
  };
}

describe('mission contract', () => {
  it('rejects an incomplete stack', () => {
    const result = evaluate(contract, {
      scienceValue: 0,
      totalDeltaV: 0,
      liftoffTWR: 0,
      hasPayload: false,
      isComplete: false,
    });
    expect(result.satisfied).toBe(false);
    expect(result.payment).toBe(0);
  });

  it('rejects the cheapest payload, because it misses the science floor', () => {
    // This is the trap the contract exists to create: the comsat is light,
    // cheap and flies beautifully, and it does not do the job.
    const vehicle = vehicleWith('comms-probe');
    const result = evaluate(contract, vehicle);

    expect(vehicle.totalDeltaV).toBeGreaterThan(contract.deltaVRequired);
    expect(result.satisfied).toBe(false);
    const science = result.checks.find((c) => c.label.includes('Science'));
    expect(science?.met).toBe(false);
  });

  it('accepts the telescope and pays the margin bonus', () => {
    const result = evaluate(contract, vehicleWith('telescope'));
    expect(result.satisfied).toBe(true);
    expect(result.bonusEarned).toBe(true);
    expect(result.payment).toBe(contract.payment + contract.marginBonus.payment);
  });

  it('accepts the science lab but denies the bonus, because margin is thin', () => {
    const vehicle = vehicleWith('science-lab');
    const result = evaluate(contract, vehicle);

    expect(result.satisfied).toBe(true);
    expect(result.bonusEarned).toBe(false);

    // The whole point of this payload: it only just works.
    const margin = vehicle.totalDeltaV - contract.deltaVRequired;
    expect(margin).toBeGreaterThan(0);
    expect(margin).toBeLessThan(200);
  });

  it('offers more than one valid answer', () => {
    const valid = ['telescope', 'crew-capsule', 'science-lab'].filter(
      (id) => evaluate(contract, vehicleWith(id)).satisfied,
    );
    // If only one payload worked, this would be a sequence again.
    expect(valid.length).toBeGreaterThanOrEqual(3);
  });

  it('makes the valid answers genuinely different from each other', () => {
    const tele = vehicleWith('telescope');
    const lab = vehicleWith('science-lab');

    // More science costs both margin and money, which is the trade the whole
    // phase is built on.
    expect(lab.scienceValue).toBeGreaterThan(tele.scienceValue);
    expect(lab.totalDeltaV).toBeLessThan(tele.totalDeltaV);
    expect(lab.cost).toBeGreaterThan(tele.cost);
  });

  it('keeps every valid vehicle inside the mission budget', () => {
    for (const id of ['telescope', 'crew-capsule', 'science-lab']) {
      // 480 is the Mission 2 budget; a contract nobody can afford is a bug.
      expect(vehicleWith(id).cost, id).toBeLessThanOrEqual(480);
    }
  });

  it('leaves the thin-margin choice almost no room for waste', () => {
    // The science lab should be affordable but punishing: one teardown of it
    // must put the programme underwater.
    const lab = vehicleWith('science-lab');
    const slack = 480 - lab.cost;
    const refundLoss = part('science-lab').cost * 0.5;
    expect(slack).toBeLessThan(refundLoss);
  });
});
