/**
 * The flight director's script.
 *
 * Every line is written to be *heard*, not read: short sentences, no
 * parentheses, no numbers that only make sense written down. The narrator
 * speaks these aloud through the Web Speech API while the same text appears in
 * the dialogue panel.
 *
 * Elena Vásquez is calm, dry, and more impressed by margin than by daring. She
 * never explains physics abstractly — she tells you what just happened to your
 * vehicle and lets you draw the conclusion.
 */

/**
 * The opening briefing. Two short lines.
 *
 * An earlier version spoke four paragraphs and then narrated every part, every
 * removal and every payload the player tabbed past. It was exhausting, and it
 * talked over the panels that already say the same thing in less time. The
 * narrator now states the objective and stops; anything more is requested
 * through the advice button.
 */
export const INTRO = [
  'Morning, engineer. Contract is on your right. Parts are on the stations around the bay.',
  'Collect the first stage from the left wall, carry it to the stand, and press E to fit it. Press T any time you want my advice.',
];

/** Said the first time the player looks at a part on the stack. */
export const FIRST_INSPECTION = '';

/** Per-part lines, spoken as each is fitted. */
/**
 * Spoken when a part is fitted. Deliberately terse.
 *
 * The engineering explanation lives on the inspection panel, which the player
 * reads when they choose to. Saying it aloud every time turned a fact into
 * nagging.
 */
export const ON_FIT: Record<string, string> = {
  'core-booster': 'Core booster is on the stand.',
  'upper-stage': 'Upper stage mated.',
  'comms-probe': 'Relay fitted. Check the science requirement.',
  telescope: 'Telescope fitted.',
  'crew-capsule': 'Capsule mated. Three crew aboard.',
  'science-lab': 'Laboratory fitted. Margin is thin.',
  fairing: 'Fairing closed out. Check the contract.',
};

/** Said when the completed stack can reach orbit. */
export const STACK_READY = 'Contract satisfied. Press F to roll out.';

/** Said when the completed stack cannot reach orbit. */
export const STACK_SHORT =
  'That does not satisfy the contract. Check the panel on your right.';

/** Said on removing a part. */
export const ON_REMOVE = ['Part removed.', 'Off the stack.', 'Removed.'];

/** Said on clearing the whole stand. */
export const ON_CLEAR =
  'Stand cleared. All of it. That is five days and a serious dent in the director\u2019s patience. Start from the booster and commit this time.';

/** Failure narration, spoken urgently when the mission ends. */
export const ON_FAILURE: Record<string, string> = {
  budget:
    'Engineer, finance has stopped the work. We are out of money. The programme is over.',
  schedule:
    'That is the window closed. Orbital geometry does not reschedule for us. This mission is scrubbed.',
  confidence:
    'Director Reyes has cancelled the programme. Too many teardowns. The funding went elsewhere.',
};

/** The lesson shown on the review-board screen for each failure. */
export const FAILURE_LESSON: Record<string, string> = {
  budget:
    'Lesson: commit to a design before you build it. Real programmes cost most of their budget in rework, which is why NASA runs design reviews on paper long before hardware is cut.',
  schedule:
    'Lesson: launch windows are set by orbital geometry, not by the programme. Mars windows open roughly every twenty six months, and missing one costs years.',
  confidence:
    'Lesson: engineering credibility is a resource like any other. Every decision you reverse spends some of it, and you need it when you have to argue for something unpopular.',
};

/** Said the first time the player reaches the payload slot. */
export const PAYLOAD_CHOICE =
  'Payload is your call. Four options along the back wall — read the placards, then carry your pick up the gantry ladder.';

/** Said when the player tries to roll out a vehicle that cannot make orbit. */
export const ROLLOUT_REFUSED =
  'Not rolling that out. The contract is not satisfied.';

/** Said when the player rolls out a flight-ready vehicle. */
export const ROLLOUT_ACCEPTED = ['Roll out approved. Good work, engineer.'];

/** Said when the stack is complete and the player is standing at the stand. */
export const ROLLOUT_PROMPT = 'Stack complete. Press F when you are ready.';

/** Pick a line from a rotating set so repeats do not feel scripted. */
export function rotate(lines: readonly string[], index: number): string {
  return lines[index % lines.length] ?? lines[0] ?? '';
}
