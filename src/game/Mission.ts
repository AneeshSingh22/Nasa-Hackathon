/**
 * Mission state: the constraints that make assembly a game rather than a
 * sandbox.
 *
 * Three resources, all of which can run out:
 *
 *  - **Budget.** Every part costs money to fit. Workshop returns refund the full
 *    purchase price, allowing players to experiment within a timed budget.
 *    Legacy removal penalties remain only for prototype paths.
 *  - **Days to the launch window.** One day is twenty seconds of active build
 *    time. Miss the window and
 *    the mission is scrubbed.
 *  - **Director confidence.** Starts at a workable level and falls when you
 *    waste money or time. Lose it and the programme is cancelled.
 *
 * Any of the three hitting bottom ends the mission. That is the lose condition
 * the assembly phase was missing.
 */

export type FailureReason =
  | 'budget'
  | 'schedule'
  | 'confidence'
  | 'accident'
  | null;

export interface MissionConstraints {
  /** Millions of dollars. */
  budget: number;
  /** Days remaining before the launch window closes. */
  daysRemaining: number;
  /** 0-100. */
  confidence: number;
}

export interface MissionStatus extends MissionConstraints {
  failed: boolean;
  failureReason: FailureReason;
  /** A sentence explaining the loss, written for the review-board screen. */
  failureText: string | null;
}

/** Mission 2: reach orbit with a useful payload. */
export const MISSION_2_START: MissionConstraints = {
  budget: 480,
  daysRemaining: 24,
  confidence: 80,
};

/** Seconds of active hub/Workshop play per build-schedule day. */
export const BUILD_SECONDS_PER_DAY = 20;

/** Legacy carry-and-place penalties. Workshop uses returnHardware instead. */
export const COSTS = {
  /** Confidence lost each time a fitted part is removed. */
  removeConfidence: 13,
  /** Confidence lost when the stand is cleared entirely. */
  clearConfidence: 26,
  /** Fraction of a part's cost refunded on removal. */
  refundFraction: 0.5,
} as const;

export class Mission {
  private state: MissionConstraints;
  private start: MissionConstraints;
  private failure: FailureReason = null;
  private failureMessage: string | null = null;

  /** Fired the first time the mission fails. */
  onFailure: ((reason: FailureReason, text: string) => void) | null = null;
  /** Fired when any resource changes, so the HUD can refresh. */
  onChange: ((status: MissionStatus) => void) | null = null;
  /** Fired when a resource crosses into a worrying band. */
  onWarning: ((text: string) => void) | null = null;

  constructor(start: MissionConstraints = MISSION_2_START) {
    this.start = { ...start };
    this.state = { ...start };
  }

  get status(): MissionStatus {
    return {
      ...this.state,
      failed: this.failure !== null,
      failureReason: this.failure,
      failureText: this.failureMessage,
    };
  }

  get hasFailed(): boolean {
    return this.failure !== null;
  }

  /** The budget this mission began with, millions. */
  get startingBudget(): number {
    return this.start.budget;
  }

  /**
   * Begin a different contract, with its own budget.
   *
   * Each contract on the board sets its own starting money, so the same
   * mission object is re-seeded rather than replaced: the HUD's listeners are
   * wired to this instance.
   */
  restart(start: MissionConstraints): void {
    this.start = { ...start };
    this.reset();
  }

  reset(): void {
    this.state = { ...this.start };
    this.failure = null;
    this.failureMessage = null;
    this.warned.clear();
    this.onChange?.(this.status);
  }

  private warned = new Set<string>();

  /** Warn once per threshold crossing, so the narrator does not nag. */
  private checkWarnings(): void {
    if (this.state.budget < 60 && !this.warned.has('budget')) {
      this.warned.add('budget');
      this.onWarning?.(
        `Finance is on the line. You have ${this.state.budget.toFixed(0)} million left. Stop rebuilding and commit to a design.`,
      );
    }
    if (this.state.daysRemaining <= 6 && !this.warned.has('schedule')) {
      this.warned.add('schedule');
      this.onWarning?.(
        `Six days to the window. The Moon will not wait for us, engineer. Finish the stack.`,
      );
    }
    if (this.state.confidence < 35 && !this.warned.has('confidence')) {
      this.warned.add('confidence');
      this.onWarning?.(
        `Director Reyes has been asking questions about your judgement. Get this vehicle built.`,
      );
    }
  }

  private checkFailure(): void {
    if (this.failure !== null) return;

    if (this.state.budget < 0) {
      this.fail(
        'budget',
        'The programme is out of money. You spent 480 million dollars fitting and refitting parts without committing to a design, and the finance office has stopped the work. Choose hardware within the available grant. Workshop returns refund the full purchase price.',
      );
    } else if (this.state.daysRemaining <= 0) {
      this.fail(
        'schedule',
        'The launch window has closed. Departure windows are set by orbital geometry, not by the programme schedule, and the next one is months away. The vehicle on your stand will never fly this mission.',
      );
    } else if (this.state.confidence <= 0) {
      this.fail(
        'confidence',
        'The programme has been cancelled. Director Reyes lost confidence in the engineering after too many teardowns, and the funding went to another centre. The hardware is yours to look at, not to launch.',
      );
    }
  }

  private fail(reason: FailureReason, text: string): void {
    this.failure = reason;
    this.failureMessage = text;
    this.onFailure?.(reason, text);
    this.onChange?.(this.status);
  }

  /**
   * End the mission outright.
   *
   * Used for an accident that cannot be absorbed by a resource penalty — a
   * fatal fall from the work platform. Without a consequence this severe,
   * working at height carried no risk at all.
   */
  abort(reason: FailureReason, text: string): void {
    if (this.hasFailed || !reason) return;
    this.fail(reason, text);
  }

  /** Advance only during active build play. The caller pauses for the mission
   *  board, flight, completed/failed missions, and hidden browser tabs. */
  advanceBuildTime(seconds: number): void {
    if (this.hasFailed || !Number.isFinite(seconds) || seconds <= 0) return;
    const remaining = this.state.daysRemaining - seconds / BUILD_SECONDS_PER_DAY;
    this.state.daysRemaining = remaining < 1e-9 ? 0 : remaining;
    this.onChange?.(this.status);
    this.checkWarnings();
    this.checkFailure();
  }

  /** Charge for fitting a part. Returns false if the mission has already ended. */
  fitPart(costMillions: number): boolean {
    if (this.hasFailed) return false;
    this.state.budget -= costMillions;
    this.onChange?.(this.status);
    this.checkWarnings();
    this.checkFailure();
    return true;
  }

  /** Return unlaunched Workshop hardware at its full paid price. No schedule
   *  or confidence penalty: previews and design revisions are reversible. */
  returnHardware(costMillions: number): boolean {
    if (this.hasFailed || !Number.isFinite(costMillions) || costMillions < 0) return false;
    this.state.budget += costMillions;
    this.onChange?.(this.status);
    return true;
  }

  /** Charge for removing a part, refunding part of its cost. */
  removePart(costMillions: number): boolean {
    if (this.hasFailed) return false;
    this.state.budget += costMillions * COSTS.refundFraction;
    this.state.confidence = Math.max(
      0,
      this.state.confidence - COSTS.removeConfidence,
    );
    this.onChange?.(this.status);
    this.checkWarnings();
    this.checkFailure();
    return true;
  }

  /**
   * Apply a penalty that is not a build action — a fall from the gantry, a
   * safety stand-down, anything that costs schedule and goodwill without
   * touching the vehicle.
   */
  penalise(penalty: { days: number; confidence: number; reason: string }): boolean {
    if (this.hasFailed) return false;
    this.state.daysRemaining -= penalty.days;
    this.state.confidence = Math.max(0, this.state.confidence - penalty.confidence);
    this.onChange?.(this.status);
    this.checkWarnings();
    this.checkFailure();
    return true;
  }

  /** Charge for clearing the entire stand. */
  clearStand(refundMillions: number): boolean {
    if (this.hasFailed) return false;
    this.state.budget += refundMillions * COSTS.refundFraction;
    this.state.confidence = Math.max(
      0,
      this.state.confidence - COSTS.clearConfidence,
    );
    this.onChange?.(this.status);
    this.checkWarnings();
    this.checkFailure();
    return true;
  }

  /** Which resource is closest to running out, as a 0-1 fraction remaining. */
  tightestMargin(): { resource: string; fraction: number } {
    const margins = [
      { resource: 'budget', fraction: this.state.budget / this.start.budget },
      {
        resource: 'schedule',
        fraction: this.state.daysRemaining / this.start.daysRemaining,
      },
      { resource: 'confidence', fraction: this.state.confidence / 100 },
    ];
    return margins.reduce((a, b) => (a.fraction < b.fraction ? a : b));
  }
}
