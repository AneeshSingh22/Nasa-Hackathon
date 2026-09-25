/**
 * The mission contract: what the customer actually wants.
 *
 * This is what makes assembly a decision rather than a sequence. Before the
 * contract existed, the build order was hardcoded and pressing E four times
 * always produced the one correct vehicle — a tutorial, not a game.
 *
 * Now the contract states an objective and leaves the vehicle to the player.
 * Several designs satisfy it, they cost different amounts, and some of them
 * only just work. The player has to read the requirement, pick a payload, pick
 * enough rocket to lift it, and live with the margin they chose.
 */

export interface Contract {
  id: string;
  customer: string;
  title: string;
  /** The requirement, in the customer's words. */
  brief: string;
  /** Minimum science value the payload must return. */
  minScience: number;
  /** Target orbit altitude in metres — drives the delta-v requirement. */
  targetAltitude: number;
  /** Delta-v the ascent needs, including gravity and drag losses. m/s */
  deltaVRequired: number;
  /** Payment on success, millions. */
  payment: number;
  /** A bonus for finishing with margin to spare. */
  marginBonus: {
    /** Delta-v margin above the requirement that earns the bonus. m/s */
    threshold: number;
    payment: number;
  };
}

/**
 * Mission 2's contract.
 *
 * Deliberately tuned so the obvious choice is wrong: the heaviest payload
 * returns the most science and pays best, but it needs a vehicle the budget
 * can only just afford. The comfortable payload does not meet the science
 * floor on its own.
 */
export const CONTRACT_FIRST_ORBIT: Contract = {
  id: 'first-orbit',
  customer: 'National Science Directorate',
  title: 'First Orbit',
  brief:
    'Place an instrument package in a stable low orbit above 200 kilometres, returning at least 100 units of science. Vehicle design is at the contractor\u2019s discretion. Payment on orbital insertion.',
  minScience: 100,
  targetAltitude: 200_000,
  deltaVRequired: 9400,
  payment: 340,
  marginBonus: {
    threshold: 800,
    payment: 60,
  },
};

export interface ContractEvaluation {
  /** Does the vehicle satisfy every requirement? */
  satisfied: boolean;
  /** Per-requirement detail, for the contract panel. */
  checks: Array<{
    label: string;
    met: boolean;
    detail: string;
  }>;
  /** Total payment if rolled out now. */
  payment: number;
  /** True when the margin bonus is earned. */
  bonusEarned: boolean;
}

export interface VehicleSummary {
  scienceValue: number;
  totalDeltaV: number;
  liftoffTWR: number;
  hasPayload: boolean;
  isComplete: boolean;
}

/** Check a vehicle against a contract. */
export function evaluate(
  contract: Contract,
  vehicle: VehicleSummary,
): ContractEvaluation {
  const margin = vehicle.totalDeltaV - contract.deltaVRequired;
  const bonusEarned = margin >= contract.marginBonus.threshold;

  const checks = [
    {
      label: 'Stack complete',
      met: vehicle.isComplete,
      detail: vehicle.isComplete ? 'All parts fitted' : 'Parts still missing',
    },
    {
      label: `Science \u2265 ${contract.minScience}`,
      met: vehicle.scienceValue >= contract.minScience,
      detail: `Payload returns ${vehicle.scienceValue}`,
    },
    {
      label: `\u0394v \u2265 ${contract.deltaVRequired} m/s`,
      met: vehicle.totalDeltaV >= contract.deltaVRequired,
      detail:
        margin >= 0
          ? `${margin.toFixed(0)} m/s of margin`
          : `${Math.abs(margin).toFixed(0)} m/s short`,
    },
    {
      label: 'Can leave the pad',
      met: vehicle.liftoffTWR >= 1.0,
      detail: `TWR ${vehicle.liftoffTWR.toFixed(2)}`,
    },
  ];

  const satisfied = checks.every((c) => c.met);

  return {
    satisfied,
    checks,
    payment: satisfied
      ? contract.payment + (bonusEarned ? contract.marginBonus.payment : 0)
      : 0,
    bonusEarned: satisfied && bonusEarned,
  };
}
