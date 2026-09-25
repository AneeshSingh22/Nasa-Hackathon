import * as THREE from 'three';
import './style.css';
import { createVABScene, VAB_WIDTH, VAB_DEPTH } from './vab/VABScene';
import { PlayerController } from './vab/PlayerController';
import { Assembly, LEO_DELTA_V_REQUIRED } from './vab/Assembly';
import { PART_LIBRARY, type PartDefinition } from './vab/parts';
import { Narrator } from './ui/Narrator';
import { Mission, type FailureReason, type MissionStatus } from './game/Mission';
import * as script from './content/dialogue';
import {
  isInWorkZone,
  promptOpacity,
  distanceToStand,
  WORK_ZONE_RADIUS,
  canWorkOn,
  stationFor,
  isOnGantry,
  GANTRY_WORK_HEIGHT,
} from './game/workzone';
import { CONTRACT_FIRST_ORBIT, evaluate } from './game/contract';
import { adviseOn } from './game/advice';
import { deltaV } from './physics/rocket';

const contract = CONTRACT_FIRST_ORBIT;

/** Evaluate the current stack against the mission contract. */
function contractStatus() {
  const analysis = assembly.analyze();
  return evaluate(contract, {
    scienceValue: assembly.scienceValue(),
    totalDeltaV: analysis.totalDeltaV,
    liftoffTWR: analysis.liftoffTWR,
    hasPayload: assembly.parts.some((p) => p.kind === 'payload'),
    isComplete: assembly.isComplete(),
  });
}

/**
 * Ad Astra Program — Vertical slice: the Vehicle Assembly Building.
 *
 * What this slice proves: first-person movement in a 3D space at real
 * spacecraft scale, part-by-part assembly, and an engineering readout driven by
 * the same physics module the flight simulation will use.
 *
 * What comes next: roll out to the pad, then the flyable ascent.
 */

/**
 * Fetch an element the game cannot run without.
 *
 * Returns a non-nullable type, so the narrowing survives into the callbacks
 * and closures below — a plain null check on a module-level `const` does not.
 */
function required<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing required DOM node: ${selector}`);
  return node;
}

const canvas = required<HTMLCanvasElement>('#viewport');
const startOverlay = required<HTMLElement>('#start-overlay');
const startButton = required<HTMLButtonElement>('#start-button');
const hud = required<HTMLElement>('#hud');

// ---------------------------------------------------------------- renderer

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const camera = new THREE.PerspectiveCamera(
  72,
  window.innerWidth / window.innerHeight,
  0.1,
  400,
);

const env = createVABScene();
const assembly = new Assembly(env.assemblyRoot, env.materials);

const player = new PlayerController(camera, {
  minX: -VAB_WIDTH / 2 + 1.2,
  maxX: VAB_WIDTH / 2 - 1.2,
  minZ: -VAB_DEPTH / 2 + 1.2,
  maxZ: VAB_DEPTH / 2 - 1.2,
});
env.scene.add(player.yawObject);

const detachInput = player.attach(canvas);

/**
 * Falling off the gantry costs the programme.
 *
 * Working at height is the real hazard in an assembly building, and a fall
 * that cost nothing would make the climb a formality. The penalty scales with
 * the drop, and a serious fall takes days as well as confidence.
 */
player.onFall = (distance) => {
  if (mission.hasFailed || rolledOut) return;

  if (distance < 6) {
    log(`STUMBLE  ${distance.toFixed(0)} m drop`);
    say('Watch your footing up there.');
    return;
  }

  const days = distance > 25 ? 3 : 1;
  const confidence = distance > 25 ? 12 : 5;
  mission.penalise({
    days,
    confidence,
    reason: `fall from ${distance.toFixed(0)} m`,
  });
  log(`FALL  ${distance.toFixed(0)} m  −${days}d`);
  say(
    distance > 25
      ? 'Engineer down! Get the safety team in. That is days of paperwork and the director will hear about it.'
      : 'That was a fall. Safety will want a report, and we have lost a day.',
    true,
  );
};

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
resize();
window.addEventListener('resize', resize);

// ---------------------------------------------------------------- HUD refs

const el = {
  mass: document.querySelector<HTMLElement>('#ro-mass'),
  dv: document.querySelector<HTMLElement>('#ro-dv'),
  twr: document.querySelector<HTMLElement>('#ro-twr'),
  stages: document.querySelector<HTMLElement>('#ro-stages'),
  height: document.querySelector<HTMLElement>('#ro-height'),
  stackState: document.querySelector<HTMLElement>('#stack-state'),
  budgetFill: document.querySelector<HTMLElement>('#budget-fill'),
  verdict: document.querySelector<HTMLElement>('#verdict'),
  inspector: document.querySelector<HTMLElement>('#inspector'),
  inspKind: document.querySelector<HTMLElement>('#insp-kind'),
  inspName: document.querySelector<HTMLElement>('#insp-name'),
  inspFact: document.querySelector<HTMLElement>('#insp-fact'),
  inspBrief: document.querySelector<HTMLElement>('#insp-brief'),
  prompt: document.querySelector<HTMLElement>('#prompt'),
  promptText: document.querySelector<HTMLElement>('#prompt-text'),
  promptKey: document.querySelector<HTMLElement>('#prompt-key'),
  capcom: document.querySelector<HTMLElement>('#capcom-text'),
  log: document.querySelector<HTMLElement>('#build-log'),
  resBudget: document.querySelector<HTMLElement>('#res-budget'),
  resBudgetBar: document.querySelector<HTMLElement>('#res-budget-bar'),
  resDays: document.querySelector<HTMLElement>('#res-days'),
  resDaysBar: document.querySelector<HTMLElement>('#res-days-bar'),
  resConf: document.querySelector<HTMLElement>('#res-conf'),
  resConfBar: document.querySelector<HTMLElement>('#res-conf-bar'),
  failure: document.querySelector<HTMLElement>('#failure'),
  failReason: document.querySelector<HTMLElement>('#fail-reason'),
  failTitle: document.querySelector<HTMLElement>('#fail-title'),
  failText: document.querySelector<HTMLElement>('#fail-text'),
  failStats: document.querySelector<HTMLElement>('#fail-stats'),
  failLesson: document.querySelector<HTMLElement>('#fail-lesson'),
  failRetry: document.querySelector<HTMLButtonElement>('#fail-retry'),
  voiceButton: document.querySelector<HTMLButtonElement>('#voice-button'),
  voiceLabel: document.querySelector<HTMLElement>('#voice-label'),
  success: document.querySelector<HTMLElement>('#success'),
  winText: document.querySelector<HTMLElement>('#win-text'),
  winStats: document.querySelector<HTMLElement>('#win-stats'),
  winNote: document.querySelector<HTMLElement>('#win-note'),
  winAgain: document.querySelector<HTMLButtonElement>('#win-again'),
  contractBrief: document.querySelector<HTMLElement>('#contract-brief'),
  contractChecks: document.querySelector<HTMLElement>('#contract-checks'),
  contractPay: document.querySelector<HTMLElement>('#contract-pay'),
  picker: document.querySelector<HTMLElement>('#picker'),
  pickerOptions: document.querySelector<HTMLElement>('#picker-options'),
  altitude: document.querySelector<HTMLElement>('#altitude'),
};

// ------------------------------------------------------- narrator & mission

const narrator = new Narrator();
const mission = new Mission();

// The narrator drives the dialogue panel, so spoken and written lines can
// never drift apart.
narrator.onLine = (text) => {
  if (el.capcom) el.capcom.textContent = text;
};
narrator.onEnabledChange = (enabled) => {
  el.voiceButton?.setAttribute('aria-pressed', String(enabled));
  if (el.voiceLabel) el.voiceLabel.textContent = enabled ? 'Voice on' : 'Voice off';
};

function say(text: string, urgent = false): void {
  narrator.say(text, urgent ? 'urgent' : 'normal');
}

function log(text: string, good = false): void {
  if (!el.log) return;
  const line = document.createElement('div');
  line.className = good ? 'log-line good' : 'log-line';
  line.textContent = text;
  el.log.appendChild(line);
  // Keep the log short; it is ambience, not a transcript.
  while (el.log.children.length > 5) el.log.removeChild(el.log.firstChild!);
  window.setTimeout(() => line.remove(), 9000);
}

/** True once the player has dismissed the start overlay. */
let started = false;
/** The roll-out prompt is spoken once, when the stack first completes. */
let saidRolloutPrompt = false;
/** The payload-choice briefing is spoken once, when that slot opens. */
let saidPayloadChoice = false;

const KIND_LABEL: Record<PartDefinition['kind'], string> = {
  booster: 'First stage',
  upper: 'Second stage',
  payload: 'Payload',
  fairing: 'Fairing',
};

function refreshReadout(): void {
  const a = assembly.analyze();

  if (el.mass) el.mass.textContent = `${(a.liftoffMass / 1000).toFixed(1)} t`;
  if (el.dv) {
    el.dv.textContent = `${a.totalDeltaV.toFixed(0)} m/s`;
    el.dv.className =
      a.totalDeltaV >= LEO_DELTA_V_REQUIRED ? 'good' : a.totalDeltaV > 0 ? 'warn' : '';
  }
  if (el.twr) {
    el.twr.textContent = a.liftoffTWR > 0 ? a.liftoffTWR.toFixed(2) : '—';
    el.twr.className =
      a.liftoffTWR === 0 ? '' : a.liftoffTWR < 1 ? 'bad' : a.liftoffTWR < 1.2 ? 'warn' : 'good';
  }
  if (el.stages) el.stages.textContent = String(a.stageCount);
  if (el.height) el.height.textContent = `${assembly.stackHeight().toFixed(1)} m`;

  if (el.stackState) {
    el.stackState.textContent = assembly.isComplete()
      ? 'Stack complete'
      : assembly.parts.length === 0
        ? 'Empty stand'
        : `${assembly.parts.length} of 4 fitted`;
  }

  if (el.budgetFill) {
    const pct = Math.min(140, (a.totalDeltaV / LEO_DELTA_V_REQUIRED) * 100);
    el.budgetFill.style.width = `${Math.min(100, pct)}%`;
    el.budgetFill.style.background =
      a.totalDeltaV >= LEO_DELTA_V_REQUIRED ? 'var(--green)' : 'var(--amber)';
  }

  if (el.verdict) {
    el.verdict.textContent = a.verdict;
    el.verdict.className = `verdict ${a.verdictLevel}`;
  }

  refreshContract();
  refreshPicker();
  updatePrompt();
}

/** Show how high the player is, but only once they are off the floor. */
function updateAltitude(): void {
  if (!el.altitude) return;
  const feet = player.feetHeight;
  if (feet < 1.5) {
    el.altitude.classList.add('hidden');
    return;
  }
  el.altitude.classList.remove('hidden');
  const onStation = isOnGantry({
    x: player.position.x,
    z: player.position.z,
    y: feet,
  });
  el.altitude.textContent = onStation
    ? `FEET ${feet.toFixed(1)} m · WORK PLATFORM`
    : `FEET ${feet.toFixed(1)} m`;
}

/**
 * Delta-v margin this payload would leave, if fitted to the current stack.
 *
 * Shown in the picker so the cost of mass is visible while choosing rather
 * than only after the money has been spent.
 */
function projectedMargin(payload: PartDefinition): number {
  const booster = PART_LIBRARY.find((p) => p.id === 'core-booster');
  const upper = PART_LIBRARY.find((p) => p.id === 'upper-stage');
  const fairing = PART_LIBRARY.find((p) => p.id === 'fairing');
  if (!booster || !upper || !fairing) return 0;

  const dead = fairing.dryMass + payload.dryMass;
  const s1Wet =
    dead + booster.dryMass + booster.propellantMass + upper.dryMass + upper.propellantMass;
  const s2Wet = dead + upper.dryMass + upper.propellantMass;

  const total =
    deltaV(s1Wet, s1Wet - booster.propellantMass, booster.isp) +
    deltaV(s2Wet, s2Wet - upper.propellantMass, upper.isp);

  return total - contract.deltaVRequired;
}

/** Paint the contract requirement checklist. */
function refreshContract(): void {
  if (el.contractBrief) el.contractBrief.textContent = contract.brief;

  const evaluation = contractStatus();

  if (el.contractPay) {
    el.contractPay.textContent = evaluation.satisfied
      ? `$${evaluation.payment}M`
      : `$${contract.payment}M`;
  }

  if (!el.contractChecks) return;
  el.contractChecks.innerHTML = '';
  for (const check of evaluation.checks) {
    const li = document.createElement('li');
    li.className = check.met ? 'met' : 'unmet';

    const mark = document.createElement('span');
    mark.className = 'mark';
    mark.textContent = check.met ? '✓' : '✗';

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = check.label;

    const detail = document.createElement('span');
    detail.className = 'detail';
    detail.textContent = check.detail;

    li.append(mark, label, detail);
    el.contractChecks.appendChild(li);
  }
}

/**
 * The payload picker, shown only when the next slot offers a choice.
 *
 * Each option shows what it costs the player in the terms that matter: mass,
 * science, money, and whether it clears the contract's science floor.
 */
function refreshPicker(): void {
  if (!el.picker || !el.pickerOptions) return;

  if (!assembly.hasChoice() || mission.hasFailed || rolledOut) {
    el.picker.classList.add('hidden');
    return;
  }

  const options = assembly.candidates();
  const selected = assembly.nextExpected();
  el.picker.classList.remove('hidden');
  el.pickerOptions.innerHTML = '';

  for (const option of options) {
    const cell = document.createElement('div');
    cell.className = option.id === selected?.id ? 'pick active' : 'pick';

    const title = document.createElement('h4');
    title.textContent = option.name;

    const dl = document.createElement('dl');
    const science = option.science ?? 0;
    const margin = projectedMargin(option);
    const rows: Array<[string, string, string]> = [
      ['Mass', `${(option.dryMass / 1000).toFixed(0)} t`, ''],
      [
        'Science',
        String(science),
        science >= contract.minScience ? 'good' : 'fail',
      ],
      ['Cost', `$${option.cost}M`, option.cost > mission.status.budget ? 'fail' : ''],
      [
        'Δv margin',
        `${margin >= 0 ? '+' : ''}${margin.toFixed(0)}`,
        margin < 0 ? 'fail' : margin < 200 ? 'tight' : 'good',
      ],
    ];
    for (const [term, value, cls] of rows) {
      const dt = document.createElement('dt');
      dt.textContent = term;
      const dd = document.createElement('dd');
      dd.textContent = value;
      if (cls) dd.className = cls;
      dl.append(dt, dd);
    }

    cell.append(title, dl);
    el.pickerOptions.appendChild(cell);
  }
}

/**
 * The action prompt, driven by where the player is standing.
 *
 * Runs every frame rather than only on state change, because it depends on
 * position. Fades in as the player approaches the stand so the control
 * teaches itself through movement.
 */
function updatePrompt(): void {
  if (!el.prompt || !el.promptText) return;
  if (mission.hasFailed || rolledOut) {
    el.prompt.style.opacity = '0';
    return;
  }

  const opacity = promptOpacity(player.position);
  el.prompt.style.opacity = String(opacity);
  if (opacity === 0) return;

  const inZone = isInWorkZone(player.position);
  const next = assembly.nextExpected();

  if (!inZone) {
    el.promptText.textContent = next
      ? `Walk to the stand to fit the ${next.name}`
      : 'Walk to the stand';
    el.prompt.classList.add('prompt-far');
    return;
  }

  el.prompt.classList.remove('prompt-far');

  if (next) {
    el.promptText.textContent = `Fit the ${next.name}`;
    if (el.promptKey) el.promptKey.textContent = 'E';
    return;
  }

  // Stack is complete: the action is now roll out, and the board decides
  // whether it is allowed.
  const ready = assembly.analyze().canReachOrbit;
  if (el.promptKey) el.promptKey.textContent = 'F';
  el.promptText.textContent = ready
    ? 'Roll out to the pad'
    : 'Vehicle cannot reach orbit — change the design';

  if (ready && !saidRolloutPrompt) {
    saidRolloutPrompt = true;
    window.setTimeout(() => {
      if (!mission.hasFailed && !rolledOut) say(script.ROLLOUT_PROMPT);
    }, 2600);
  }
}

// ------------------------------------------------------- part inspection

const raycaster = new THREE.Raycaster();
raycaster.far = 26;
const screenCentre = new THREE.Vector2(0, 0);

/** Find which part definition an intersected object belongs to. */
function partFromObject(obj: THREE.Object3D): PartDefinition | null {
  let node: THREE.Object3D | null = obj;
  while (node) {
    const match = PART_LIBRARY.find((p) => p.id === node!.name);
    if (match) return match;
    node = node.parent;
  }
  return null;
}

let inspected: PartDefinition | null = null;

function updateInspector(): void {
  raycaster.setFromCamera(screenCentre, camera);
  const hits = raycaster.intersectObject(env.assemblyRoot, true);
  const part = hits.length > 0 && hits[0] ? partFromObject(hits[0].object) : null;

  if (part?.id === inspected?.id) return;
  inspected = part;

  if (!el.inspector) return;
  if (!part) {
    el.inspector.classList.add('hidden');
    return;
  }

  el.inspector.classList.remove('hidden');
  if (el.inspKind) el.inspKind.textContent = KIND_LABEL[part.kind];
  if (el.inspName) el.inspName.textContent = part.name;
  if (el.inspFact) el.inspFact.textContent = part.keyFact;
  if (el.inspBrief) el.inspBrief.textContent = part.briefing;
}

// ------------------------------------------------------------- build flow

// ------------------------------------------------------ resource display

/** Paint one resource bar, recolouring it as the margin shrinks. */
function paintResource(
  valueEl: HTMLElement | null,
  barEl: HTMLElement | null,
  text: string,
  fraction: number,
): void {
  const clamped = Math.max(0, Math.min(1, fraction));
  if (valueEl) {
    valueEl.textContent = text;
    valueEl.className = clamped < 0.15 ? 'critical' : clamped < 0.35 ? 'low' : '';
  }
  if (barEl) {
    barEl.style.width = `${clamped * 100}%`;
    // Keep the base fill class and add the severity class on top of it.
    const base = barEl.classList[0] ?? '';
    barEl.className = base;
    if (clamped < 0.15) barEl.classList.add('critical');
    else if (clamped < 0.35) barEl.classList.add('low');
  }
}

function refreshResources(status: MissionStatus): void {
  paintResource(
    el.resBudget,
    el.resBudgetBar,
    `$${Math.max(0, status.budget).toFixed(0)}M`,
    status.budget / 480,
  );
  paintResource(
    el.resDays,
    el.resDaysBar,
    `${Math.max(0, status.daysRemaining)} days`,
    status.daysRemaining / 24,
  );
  paintResource(
    el.resConf,
    el.resConfBar,
    `${Math.max(0, status.confidence).toFixed(0)}%`,
    status.confidence / 100,
  );
}

// ---------------------------------------------------------- failure screen

const FAIL_TITLES: Record<string, string> = {
  budget: 'Out of money',
  schedule: 'Launch window closed',
  confidence: 'Programme cancelled',
};

const FAIL_EYEBROWS: Record<string, string> = {
  budget: 'Finance review',
  schedule: 'Mission scrubbed',
  confidence: 'Director’s decision',
};

function showFailure(reason: FailureReason, text: string): void {
  if (!reason) return;
  const status = mission.status;

  player.releaseLock();
  setHelp(false);

  if (el.failReason) el.failReason.textContent = FAIL_EYEBROWS[reason] ?? 'Programme halted';
  if (el.failTitle) el.failTitle.textContent = FAIL_TITLES[reason] ?? 'Mission scrubbed';
  if (el.failText) el.failText.textContent = text;
  if (el.failLesson) el.failLesson.textContent = script.FAILURE_LESSON[reason] ?? '';

  if (el.failStats) {
    const spent = 480 - status.budget;
    el.failStats.innerHTML = '';
    const stats: Array<[string, string, boolean]> = [
      ['Spent', `$${spent.toFixed(0)}M`, reason === 'budget'],
      ['Days used', `${24 - status.daysRemaining}`, reason === 'schedule'],
      ['Confidence', `${Math.max(0, status.confidence).toFixed(0)}%`, reason === 'confidence'],
    ];
    for (const [label, value, highlight] of stats) {
      const cell = document.createElement('div');
      cell.className = highlight ? 'fail-stat spent' : 'fail-stat';
      const span = document.createElement('span');
      span.textContent = label;
      const b = document.createElement('b');
      b.textContent = value;
      cell.append(span, b);
      el.failStats.appendChild(cell);
    }
  }

  el.failure?.classList.remove('hidden');
  // Urgent, so it interrupts whatever line was mid-sentence.
  narrator.say(script.ON_FAILURE[reason] ?? 'The mission is over.', 'urgent');
}

mission.onChange = (status) => refreshResources(status);
mission.onFailure = (reason, text) => showFailure(reason, text);
mission.onWarning = (text) => {
  log('CAUTION', false);
  narrator.say(text, 'urgent');
};

/**
 * Refuse a build action and say why, when the player is not at the stand.
 * Returns true when the action was blocked.
 */
function blockedByDistance(kind?: string): boolean {
  const position = {
    x: player.position.x,
    z: player.position.z,
    y: player.feetHeight,
  };

  // One source of truth for the rule, shared with the tests. Duplicating the
  // check here is how the "fit the booster from 56 m up" bug got in.
  if (kind && canWorkOn(kind, position)) return false;
  if (!kind && isInWorkZone(player.position) && position.y <= 1.5) return false;

  if (kind && stationFor(kind) === 'gantry') {
    log('OUT OF REACH  fit from the top gantry platform');
    say(
      `That goes on top of the stack, ${GANTRY_WORK_HEIGHT.toFixed(0)} metres up. Take the ladder on the far side of the gantry and fit it from the top platform.`,
    );
    return true;
  }

  if (position.y > 1.5) {
    log('OUT OF REACH  come back down to the floor');
    say('You cannot work on the lower stages from up there. Come back down.');
    return true;
  }

  const away = distanceToStand(player.position) - WORK_ZONE_RADIUS;
  log(`OUT OF REACH  ${away.toFixed(0)} m from the stand`);
  say('You are not at the stand, engineer. Walk into the painted circle.');
  return true;
}

function attachNextPart(): void {
  if (mission.hasFailed) return;

  const part = assembly.nextExpected();
  if (!part) {
    say('Nothing left to fit. The vehicle is complete.');
    return;
  }
  if (blockedByDistance(part.kind)) return;

  // Charge first: if the programme cannot afford the part, the mission ends
  // and the part never goes on.
  mission.fitPart(part.cost);
  if (mission.hasFailed) return;

  assembly.attachNext();
  log(`FITTED  ${part.name}  −$${part.cost}M`, true);
  say(script.ON_FIT[part.id] ?? `${part.name} fitted.`);
  refreshReadout();

  // When the stack completes, the director passes judgement on it.
  // The payload slot is the first real decision, so it gets one short line.
  // Everything beyond this is on request only.
  if (assembly.hasChoice() && !saidPayloadChoice) {
    saidPayloadChoice = true;
    window.setTimeout(() => {
      if (!mission.hasFailed) say(script.PAYLOAD_CHOICE);
    }, 1200);
  }

  if (assembly.isComplete()) {
    const analysis = assembly.analyze();
    window.setTimeout(() => {
      if (mission.hasFailed) return;
      say(analysis.canReachOrbit ? script.STACK_READY : script.STACK_SHORT);
    }, 900);
  }
}

let removeLineIndex = 0;

function detachTopPart(): void {
  if (mission.hasFailed) return;
  if (blockedByDistance()) return;

  const part = assembly.detachTop();
  if (!part) {
    say('The stand is already empty.');
    return;
  }

  mission.removePart(part.cost);
  log(`REMOVED  ${part.name}  +$${(part.cost * 0.5).toFixed(0)}M`);
  refreshReadout();
  if (mission.hasFailed) return;
  say(script.rotate(script.ON_REMOVE, removeLineIndex++));
}

function clearStand(): void {
  if (mission.hasFailed) return;
  if (blockedByDistance()) return;
  if (assembly.parts.length === 0) {
    say('The stand is already empty.');
    return;
  }

  const refund = assembly.parts.reduce((sum, p) => sum + p.cost, 0);
  assembly.clear();
  mission.clearStand(refund);
  log('STAND CLEARED');
  refreshReadout();
  if (mission.hasFailed) return;
  say(script.ON_CLEAR);
}

/**
 * Swap the fitted payload for the currently-selected one.
 *
 * Costs the difference in price plus a day, rather than the full teardown a
 * removal would. Changing your mind about the payload is a normal thing to do
 * on a real stand.
 */
function swapPayload(): void {
  if (mission.hasFailed || rolledOut) return;

  const index = assembly.indexOfKind('payload');
  if (index === -1) {
    say('There is no payload fitted yet.');
    return;
  }
  if (blockedByDistance('payload')) return;

  const options = PART_LIBRARY.filter((p) => p.kind === 'payload');
  const current = assembly.parts[index];
  if (!current) return;

  // Pick the next option along, so G alone cycles through swaps.
  const at = options.findIndex((p) => p.id === current.id);
  const next = options[(at + 1) % options.length];
  if (!next) return;

  const result = assembly.swapPart(index, next.id);
  if (!result) return;

  const difference = result.fitted.cost - result.removed.cost;
  mission.penalise({ days: 1, confidence: 2, reason: 'payload swap' });
  if (difference > 0) mission.fitPart(difference);
  else mission.removePart(-difference * 2);

  log(`SWAPPED  ${result.fitted.name}`, true);
  refreshReadout();
  if (!mission.hasFailed) {
    say(`${result.fitted.name} fitted in place of the ${result.removed.name}.`);
  }
}

/**
 * Give advice about the situation the player is actually in.
 *
 * Bound to a key and a button, never volunteered. Points at the trade-off
 * rather than naming the answer, so asking for help does not remove the
 * decision.
 */
function requestAdvice(): void {
  if (mission.hasFailed || rolledOut) return;

  const nextKind = assembly.nextSlot();
  const position = {
    x: player.position.x,
    z: player.position.z,
    y: player.feetHeight,
  };
  const evaluation = contractStatus();
  const analysis = assembly.analyze();
  const status = mission.status;

  const advice = adviseOn({
    fittedCount: assembly.parts.length,
    nextKind,
    inPosition: nextKind ? canWorkOn(nextKind, position) : true,
    onGantry: isOnGantry(position),
    contractSatisfied: evaluation.satisfied,
    failingChecks: evaluation.checks.filter((c) => !c.met).map((c) => c.label),
    deltaVMargin: analysis.totalDeltaV - contract.deltaVRequired,
    science: assembly.scienceValue(),
    scienceRequired: contract.minScience,
    budget: status.budget,
    days: status.daysRemaining,
    hasPayload: assembly.parts.some((p) => p.kind === 'payload'),
  });

  // Advice is always spoken if voice is on, and always written.
  narrator.say(advice, 'urgent');
}

/** True once the vehicle has left the building, so actions stop. */
let rolledOut = false;

/**
 * Roll the finished vehicle out to the pad.
 *
 * Gated on the engineering analysis: a vehicle the board says cannot reach
 * orbit never gets to try. That turns the delta-v readout from a number the
 * player can ignore into a gate they have to satisfy.
 */
function rollOut(): void {
  if (mission.hasFailed || rolledOut) return;
  if (blockedByDistance()) return;

  if (!assembly.isComplete()) {
    say('The stack is not finished. Fit the remaining parts first.');
    return;
  }

  const evaluation = contractStatus();
  if (!evaluation.satisfied) {
    const failed = evaluation.checks.filter((c) => !c.met).map((c) => c.label);
    log(`ROLL OUT REFUSED  ${failed.join(', ')}`);
    say(script.ROLLOUT_REFUSED, true);
    return;
  }
  const analysis = assembly.analyze();

  rolledOut = true;
  const status = mission.status;
  player.releaseLock();
  setHelp(false);
  log('ROLL OUT APPROVED', true);

  const margin = analysis.totalDeltaV - LEO_DELTA_V_REQUIRED;

  if (el.winText) {
    el.winText.textContent =
      `Your vehicle is ${assembly.stackHeight().toFixed(1)} metres tall, masses ` +
      `${(analysis.liftoffMass / 1000).toFixed(0)} tonnes on the pad, and carries ` +
      `${margin.toFixed(0)} m/s of delta-v above what low Earth orbit costs. ` +
      `That margin is the difference between a mission that survives a mistake ` +
      `and one that does not.`;
  }

  if (el.winStats) {
    el.winStats.innerHTML = '';
    const stats: Array<[string, string, boolean]> = [
      ['Budget left', `$${status.budget.toFixed(0)}M`, status.budget > 60],
      ['Days to spare', `${status.daysRemaining}`, status.daysRemaining > 8],
      ['Confidence', `${status.confidence.toFixed(0)}%`, status.confidence >= 70],
    ];
    for (const [label, value, good] of stats) {
      const cell = document.createElement('div');
      cell.className = good ? 'fail-stat good' : 'fail-stat';
      const span = document.createElement('span');
      span.textContent = label;
      const b = document.createElement('b');
      b.textContent = value;
      cell.append(span, b);
      el.winStats.appendChild(cell);
    }
  }

  if (el.winNote) {
    el.winNote.textContent =
      'Next phase, in development: fly this vehicle by hand. Throttle, pitch ' +
      'and staging against real drag and gravity — the ascent physics is ' +
      'already verified, and a clean gravity turn reaches about 100 by 280 km.';
  }

  el.success?.classList.remove('hidden');
  for (const line of script.ROLLOUT_ACCEPTED) narrator.say(line);
}

window.addEventListener('keydown', (e) => {
  // Build actions work whenever the game is showing, not only under pointer
  // lock — pointer lock can be refused, and the game must still be playable.
  if (!started) return;
  if (e.repeat) return;
  if (e.code === 'KeyE') attachNextPart();
  if (e.code === 'KeyQ') detachTopPart();
  if (e.code === 'KeyR') clearStand();
  if (e.code === 'KeyH' || e.code === 'Slash') toggleHelp();
  if (e.code === 'KeyV') narrator.toggle();
  if (e.code === 'KeyF') rollOut();
  if (e.code === 'KeyG') swapPayload();
  if (e.code === 'KeyT') requestAdvice();
  if (e.code === 'Tab') {
    // Cycling is silent. Narrating every option was the single most annoying
    // thing in the build: the player is reading a comparison table, not
    // asking to be read to.
    e.preventDefault();
    const picked = assembly.cyclePayload(e.shiftKey ? -1 : 1);
    if (picked) refreshReadout();
  }
});

// --------------------------------------------------------------- start up

startButton.addEventListener('click', () => {
  started = true;
  startOverlay.classList.add('hidden');
  hud.classList.remove('hidden');
  player.requestLock(canvas);
  // Speech synthesis needs a user gesture on most browsers, so the briefing
  // starts here rather than on page load.
  runIntro();
});

// Clicking the viewport re-acquires pointer lock after Escape, which is what
// players expect. The start overlay deliberately does not come back: losing
// the cursor should not throw away the stack you have built.
canvas.addEventListener('click', () => {
  if (started && !player.isLocked) player.requestLock(canvas);
});

// ------------------------------------------------------------ help panel

const helpPanel = document.querySelector<HTMLElement>('#help');
const helpButton = document.querySelector<HTMLButtonElement>('#help-button');
const helpClose = document.querySelector<HTMLButtonElement>('#help-close');

function setHelp(open: boolean): void {
  if (!helpPanel) return;
  helpPanel.classList.toggle('hidden', !open);
  helpButton?.setAttribute('aria-expanded', String(open));
  // Reading the controls means using the cursor, so release the mouse while
  // the panel is open and hand it back when the player closes it.
  if (open) player.releaseLock();
}

function toggleHelp(): void {
  if (!helpPanel) return;
  setHelp(helpPanel.classList.contains('hidden'));
}

helpButton?.addEventListener('click', () => toggleHelp());
helpClose?.addEventListener('click', () => {
  setHelp(false);
  if (started) player.requestLock(canvas);
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && helpPanel && !helpPanel.classList.contains('hidden')) {
    setHelp(false);
  }
});

el.voiceButton?.addEventListener('click', () => narrator.toggle());

document.querySelector<HTMLButtonElement>('#advice-button')
  ?.addEventListener('click', () => {
    requestAdvice();
    // Hand the cursor back so the player can keep playing straight away.
    if (started && !player.isLocked) player.requestLock(canvas);
  });

// Hide the voice control entirely where speech synthesis is unavailable,
// rather than offering a button that cannot do anything.
if (!narrator.available) {
  el.voiceButton?.classList.add('hidden');
}

function restartMission(): void {
  assembly.clear();
  mission.reset();
  removeLineIndex = 0;
  rolledOut = false;
  spokenIntro = false;
  saidRolloutPrompt = false;
  saidPayloadChoice = false;
  el.failure?.classList.add('hidden');
  el.success?.classList.add('hidden');
  refreshReadout();
  refreshResources(mission.status);
  player.requestLock(canvas);
  runIntro();
}

el.winAgain?.addEventListener('click', () => restartMission());

el.failRetry?.addEventListener('click', () => {
  assembly.clear();
  mission.reset();
  removeLineIndex = 0;
  spokenIntro = false;
  el.failure?.classList.add('hidden');
  refreshReadout();
  refreshResources(mission.status);
  player.requestLock(canvas);
  runIntro();
});

// ------------------------------------------------------- intro sequence

let spokenIntro = false;
let introTimers: number[] = [];

/**
 * Speak the opening briefing as a paced sequence rather than one wall of
 * text. The narrator queues utterances itself, but staggering them keeps the
 * written panel readable at the same pace as the voice.
 */
function runIntro(): void {
  for (const t of introTimers) window.clearTimeout(t);
  introTimers = [];
  if (spokenIntro) return;
  spokenIntro = true;

  script.INTRO.forEach((line, i) => {
    const id = window.setTimeout(() => {
      if (!mission.hasFailed) say(line);
    }, i * 7200);
    introTimers.push(id);
  });
}

// ------------------------------------------------------------- main loop

const clock = new THREE.Clock();
let inspectorTimer = 0;

function frame(): void {
  const dt = Math.min(0.05, clock.getDelta());
  const elapsed = clock.elapsedTime;

  // Tell the controller what it is standing on before it moves, so climbing
  // and falling use this frame's geometry.
  const pos = player.position;
  const ladder = env.ladderAt(pos.x, pos.z);
  player.onLadder = ladder !== null;
  player.ladderX = ladder?.x ?? null;
  player.ladderTop = ladder?.top ?? Infinity;
  player.supportHeight = env.supportHeightAt(pos.x, pos.z, player.feetHeight);

  // The rocket is solid, and it grows as it is built.
  player.obstacles = assembly.parts.length > 0
    ? [{ x: 0, z: 0, radius: 3.4, top: assembly.topWorldY() }]
    : [];

  player.update(dt);
  env.update(elapsed);

  // Raycasting every frame is wasteful for a static stack; 12 Hz is plenty
  // for a panel the player reads.
  inspectorTimer += dt;
  if (inspectorTimer > 1 / 12) {
    inspectorTimer = 0;
    updateInspector();
    updatePrompt();
    updateAltitude();
  }

  renderer.render(env.scene, camera);
  requestAnimationFrame(frame);
}

refreshReadout();
refreshResources(mission.status);
frame();

// Vite HMR: drop the input listeners so reloads do not stack handlers.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    detachInput();
    renderer.dispose();
  });
}
