import * as THREE from 'three';
import './style.css';
import { createVABScene, VAB_WIDTH, VAB_DEPTH } from './vab/VABScene';
import { PlayerController } from './vab/PlayerController';
import { Assembly, LEO_DELTA_V_REQUIRED } from './vab/Assembly';
import { PART_LIBRARY, type PartDefinition } from './vab/parts';
import { Narrator } from './ui/Narrator';
import { Mission, type FailureReason, type MissionStatus } from './game/Mission';
import * as script from './content/dialogue';

/**
 * Ad Astra Program — Vertical slice: the Vehicle Assembly Building.
 *
 * What this slice proves: first-person movement in a 3D space at real
 * spacecraft scale, part-by-part assembly, and an engineering readout driven by
 * the same physics module the flight simulation will use.
 *
 * What comes next: roll out to the pad, then the flyable ascent.
 */

const canvas = document.querySelector<HTMLCanvasElement>('#viewport');
const startOverlay = document.querySelector<HTMLElement>('#start-overlay');
const startButton = document.querySelector<HTMLButtonElement>('#start-button');
const hud = document.querySelector<HTMLElement>('#hud');

if (!canvas || !startOverlay || !startButton || !hud) {
  throw new Error('Missing required DOM nodes');
}

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
/** The inspection-panel hint is spoken once, on first look. */
let saidInspectionHint = false;

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

  // Next-action prompt.
  const next = assembly.nextExpected();
  if (el.prompt && el.promptText) {
    if (next) {
      el.promptText.textContent = `Fit the ${next.name}`;
      el.prompt.classList.remove('hidden');
    } else {
      el.promptText.textContent = 'Stack complete — roll out to the pad';
      el.prompt.classList.remove('hidden');
    }
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
  // Point the panel out the first time the player looks at something, then
  // never mention it again.
  if (!saidInspectionHint) {
    saidInspectionHint = true;
    window.setTimeout(() => say(script.FIRST_INSPECTION), 1400);
  }
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

function attachNextPart(): void {
  if (mission.hasFailed) return;

  const part = assembly.nextExpected();
  if (!part) {
    say('Nothing left to fit. The vehicle is complete.');
    return;
  }

  // Charge first: if the programme cannot afford the part, the mission ends
  // and the part never goes on.
  mission.fitPart(part.cost);
  if (mission.hasFailed) return;

  assembly.attachNext();
  log(`FITTED  ${part.name}  −$${part.cost}M`, true);
  say(script.ON_FIT[part.id] ?? `${part.name} fitted.`);
  refreshReadout();

  // When the stack completes, the director passes judgement on it.
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

// Hide the voice control entirely where speech synthesis is unavailable,
// rather than offering a button that cannot do anything.
if (!narrator.available) {
  el.voiceButton?.classList.add('hidden');
}

el.failRetry?.addEventListener('click', () => {
  assembly.clear();
  mission.reset();
  removeLineIndex = 0;
  spokenIntro = false;
  saidInspectionHint = false;
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

  player.update(dt);
  env.update(elapsed);

  // Raycasting every frame is wasteful for a static stack; 12 Hz is plenty
  // for a panel the player reads.
  inspectorTimer += dt;
  if (inspectorTimer > 1 / 12) {
    inspectorTimer = 0;
    updateInspector();
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
