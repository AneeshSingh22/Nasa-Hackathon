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

export const INTRO = [
  'Morning, engineer. Welcome to the assembly building.',
  'Read the contract on your right before you touch anything. The Science Directorate wants an instrument package in orbit above two hundred kilometres, returning at least a hundred units of science. How you do that is up to you.',
  'Walk into the painted circle on the floor. You can only work on the vehicle from inside it, same as any real assembly bay. Once you are there, press E to fit the first stage.',
  'And I will warn you now: the payload is your decision, not mine. The cheap one will not satisfy the contract and the heavy one will barely make orbit. Choose carefully, because the rocket equation does not care what you were hoping for.',
];

/** Said the first time the player looks at a part on the stack. */
export const FIRST_INSPECTION =
  'That panel on your right tells you what you are looking at, and why it is built that way. Worth reading before you commit the budget.';

/** Per-part lines, spoken as each is fitted. */
export const ON_FIT: Record<string, string> = {
  'core-booster':
    'Core booster is on the stand. Three hundred and ten tonnes of kerosene and oxygen, and only sixteen tonnes of structure. Almost the entire stage is fuel. That is not a design choice, that is the rocket equation forcing our hand.',
  'upper-stage':
    'Upper stage mated. Watch the delta-v figure jump. Hydrogen gives us better efficiency than the booster, and up there efficiency is worth more than raw thrust.',
  telescope:
    'Telescope is installed. Now look at what happened to your margin. Eight tonnes of payload just cost you about three thousand metres per second of delta-v. Every mission planner in the world makes that trade, and none of them enjoy it.',
  'comms-probe':
    'Relay is on. It flies beautifully and it does not satisfy the contract. Check the science requirement before you roll that out.',
  'crew-capsule':
    'Capsule is mated, and there are three people who will be sitting in it. More science than the telescope, less margin. I would want to fly a very clean ascent with that on top.',
  'science-lab':
    'Laboratory is on. That is the most science available and almost none of the delta-v margin. It satisfies the contract on paper. Whether it survives a real ascent depends entirely on how well you fly.',
  fairing:
    'Fairing closed out. That shell is dead weight we throw away at a hundred kilometres, but without it the payload would not survive the lower atmosphere. The stack is flight ready. Check the board.',
};

/** Said when the completed stack can reach orbit. */
export const STACK_READY =
  'Good vehicle, engineer. You have margin above the orbital requirement, and margin is what saves missions when the ascent does not go to plan. Stand by for roll out.';

/** Said when the completed stack cannot reach orbit. */
export const STACK_SHORT =
  'That stack will not make orbit. Check the delta-v against the requirement on the board, and change something before we waste a launch window on it.';

/** Said on removing a part. */
export const ON_REMOVE = [
  'Part is off the stack. That cost us days and half the money, and the crew noticed.',
  'Taking it apart again. Every teardown spends schedule and goodwill we do not have much of.',
  'Removed. I will remind you that we refund less than half of what a part costs. Rebuilding is never free.',
];

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
  'Lower stages are on. Now the decision that matters. Press Tab to cycle the payloads and read what each one costs you, then climb the ladder on the gantry and fit it from the top platform. Fifty tonnes of rocket does not get built from the floor.';

/** Said when the player tries to roll out a vehicle that cannot make orbit. */
export const ROLLOUT_REFUSED =
  'I am not rolling that to the pad. The board says it cannot reach orbit, and I will not spend a launch window finding out you were right. Fix the vehicle.';

/** Said when the player rolls out a flight-ready vehicle. */
export const ROLLOUT_ACCEPTED = [
  'Roll out approved. Crawler is under the stand and we are moving to the pad.',
  'Vehicle is on the pad. Good work, engineer.',
  'That is as far as this build takes us for now. The ascent is the next thing we will fly, and your margin is what you will be glad of when we do.',
];

/** Said when the stack is complete and the player is standing at the stand. */
export const ROLLOUT_PROMPT =
  'Stack is complete. Press F to roll out to the pad when you are satisfied with it.';

/** Pick a line from a rotating set so repeats do not feel scripted. */
export function rotate(lines: readonly string[], index: number): string {
  return lines[index % lines.length] ?? lines[0] ?? '';
}
