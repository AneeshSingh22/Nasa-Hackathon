/**
 * On-demand advice.
 *
 * The narrator used to volunteer everything: four paragraphs of intro, a
 * lecture per part, a line for every payload the player tabbed past. It talked
 * over the panels that say the same thing faster, and it was exhausting.
 *
 * Now she says almost nothing unprompted, and the player presses a key when
 * they want help. Advice is chosen from the actual game state, so it addresses
 * the situation the player is in.
 *
 * The rule these lines follow: point at the trade-off, never state the answer.
 * "The lab leaves you under a hundred metres per second" teaches something.
 * "Fit the telescope" teaches nothing and removes the decision.
 */

export interface AdviceContext {
  /** Parts fitted so far. */
  fittedCount: number;
  /** The kind of part the next slot expects, or null when complete. */
  nextKind: string | null;
  /** Is the player standing where they can fit the next part? */
  inPosition: boolean;
  /** Is the player up on the gantry? */
  onGantry: boolean;
  /** Does the current stack satisfy the contract? */
  contractSatisfied: boolean;
  /** Requirement checks that are currently failing, by label. */
  failingChecks: string[];
  /** Delta-v margin above the requirement. Negative means short. */
  deltaVMargin: number;
  /** Science the fitted payload returns. */
  science: number;
  /** Science the contract demands. */
  scienceRequired: number;
  /** Money left, millions. */
  budget: number;
  /** Days left in the window. */
  days: number;
  /** Is a payload already fitted? */
  hasPayload: boolean;
}

/**
 * Pick the most useful thing to say, given where the player actually is.
 *
 * Ordered by urgency: a resource about to run out matters more than a hint
 * about what to fit next.
 */
export function adviseOn(ctx: AdviceContext): string {
  // Resources first — these end the run.
  if (ctx.budget < 40) {
    return `You have ${ctx.budget.toFixed(0)} million left. A teardown refunds half, so another change of mind probably ends the programme. Commit to what is on the stand.`;
  }
  if (ctx.days <= 4) {
    return `${ctx.days} days to the window. Whatever is on the stand is what flies — stop refining it.`;
  }

  // Nothing built yet.
  if (ctx.fittedCount === 0) {
    return 'Start with the core booster from inside the painted circle. Read the contract first: the science requirement is what rules payloads in and out.';
  }

  // Standing in the wrong place for the next part.
  if (ctx.nextKind && !ctx.inPosition) {
    if (ctx.nextKind === 'payload' || ctx.nextKind === 'fairing') {
      return 'That part goes on top of the stack. Take the service elevator on the right of the bay — step into the car, press E to ride up, then walk out along the work deck toward the rocket and press E to place it.';
    }
    return 'You need to be inside the painted circle to work on the lower stages.';
  }

  // At the payload decision: name the trade, not the answer.
  if (ctx.nextKind === 'payload') {
    return `The contract wants ${ctx.scienceRequired} science. More payload mass means more science and less delta-v margin, and the rocket equation makes that trade steeply. Compare the options with Tab and decide how much margin you are willing to give up.`;
  }

  // Contract not satisfied, with a payload on.
  if (ctx.hasPayload && !ctx.contractSatisfied) {
    if (ctx.science < ctx.scienceRequired) {
      return `Your payload returns ${ctx.science} against a requirement of ${ctx.scienceRequired}. Science comes from mass, and mass comes out of your margin — press G on the gantry to swap for something heavier.`;
    }
    if (ctx.deltaVMargin < 0) {
      return `You are ${Math.abs(ctx.deltaVMargin).toFixed(0)} metres per second short of orbit. Either the payload comes down in mass or the vehicle goes up in propellant.`;
    }
    return `The contract panel lists what is failing: ${ctx.failingChecks.join(', ')}.`;
  }

  // Complete and valid.
  if (ctx.contractSatisfied) {
    if (ctx.deltaVMargin < 200) {
      return `It satisfies the contract with ${ctx.deltaVMargin.toFixed(0)} metres per second of margin. That is very little. It will reach orbit only if the ascent is flown cleanly — your choice whether that is a risk worth taking.`;
    }
    return `Good vehicle. ${ctx.deltaVMargin.toFixed(0)} metres per second of margin, which is what saves a mission when the ascent does not go to plan. Press F to roll out.`;
  }

  // Mid-build, in position.
  if (ctx.nextKind === 'fairing') {
    return 'The fairing is the last part. It is dead mass you throw away at altitude, and without it the payload does not survive the lower atmosphere.';
  }
  if (ctx.nextKind === 'upper') {
    return 'The upper stage has less thrust than the booster and a much better specific impulse. Up there efficiency matters more than thrust.';
  }

  return 'Nothing pressing. The contract panel tells you what is still outstanding.';
}
