/**
 * Mission Control's call on the vehicle: GO, MARGINAL or NO-GO.
 *
 * The build phase needs a verdict that reacts to every choice, so the player
 * feels a part go on rather than reading a number change. It must also be
 * right, because a GO on a vehicle that cannot reach orbit would be a lie the
 * flight phase exposes immediately.
 *
 * ## Calibration
 *
 * Every buildable stack was flown under the autopilot. Every vehicle with
 * 9 386 m/s of delta-v or more reached orbit; every one with 9 086 m/s or less
 * did not. There is nothing in between, so the NO-GO line sits in that gap.
 * MARGINAL marks vehicles that reach orbit under guidance but have little
 * spare, which in practice means a sloppy hand-flown ascent will strand them.
 * `readiness.test.ts` re-flies the library against these lines, so a part
 * retune that moves the boundary fails the suite rather than the player.
 */

export type Verdict = 'incomplete' | 'nogo' | 'marginal' | 'go';

/** Below this, the calibration flights all failed. m/s */
export const NOGO_BELOW = 9_300;
/** Below this, the vehicle makes orbit but with little to spare. m/s */
export const MARGINAL_BELOW = 9_900;
/** A vehicle that cannot lift its own weight goes nowhere. */
export const MIN_LIFTOFF_TWR = 1.05;

export interface Readiness {
  readonly verdict: Verdict;
  /** Two or three words, in capitals, for the badge. */
  readonly headline: string;
  /** One line explaining the call, in Mission Control's voice. */
  readonly detail: string;
  /** 0..1, how far along the scale from hopeless to comfortable. */
  readonly gauge: number;
}

export interface ReadinessInput {
  readonly complete: boolean;
  readonly totalDeltaV: number;
  readonly liftoffTWR: number;
}

export function assessReadiness(input: ReadinessInput): Readiness {
  const gauge = Math.max(0, Math.min(1, (input.totalDeltaV - 8_000) / (11_000 - 8_000)));

  if (!input.complete) {
    return {
      verdict: 'incomplete',
      headline: 'BUILDING',
      detail: 'Mission Control will make the call once the stack is complete.',
      gauge,
    };
  }
  if (input.liftoffTWR < MIN_LIFTOFF_TWR) {
    return {
      verdict: 'nogo',
      headline: 'NO-GO',
      detail: `Thrust-to-weight ${input.liftoffTWR.toFixed(2)}: it will not leave the pad.`,
      gauge,
    };
  }
  if (input.totalDeltaV < NOGO_BELOW) {
    const short = Math.round(NOGO_BELOW - input.totalDeltaV);
    return {
      verdict: 'nogo',
      headline: 'NO-GO',
      detail: `About ${short} m/s short of orbit. Lighter payload or stronger stages.`,
      gauge,
    };
  }
  if (input.totalDeltaV < MARGINAL_BELOW) {
    return {
      verdict: 'marginal',
      headline: 'MARGINAL',
      detail: 'It can make orbit, with almost nothing to spare. Fly it cleanly.',
      gauge,
    };
  }
  return {
    verdict: 'go',
    headline: 'GO',
    detail: `${Math.round(input.totalDeltaV - NOGO_BELOW)} m/s to spare. Mission Control is happy.`,
    gauge,
  };
}
