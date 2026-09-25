import * as THREE from 'three';
import './style.css';
import { createVABScene, VAB_WIDTH, VAB_DEPTH } from './vab/VABScene';
import { PlayerController } from './vab/PlayerController';
import { Assembly, LEO_DELTA_V_REQUIRED } from './vab/Assembly';
import { PART_LIBRARY, type PartDefinition } from './vab/parts';

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
};

function say(text: string): void {
  if (el.capcom) el.capcom.textContent = text;
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
  if (el.inspKind) el.inspKind.textContent = KIND_LABEL[part.kind];
  if (el.inspName) el.inspName.textContent = part.name;
  if (el.inspFact) el.inspFact.textContent = part.keyFact;
  if (el.inspBrief) el.inspBrief.textContent = part.briefing;
}

// ------------------------------------------------------------- build flow

/** Flight-director lines for each assembly step. */
const BUILD_DIALOGUE: Record<string, string> = {
  'core-booster':
    'Core booster is on the stand. Three hundred and ten tonnes of kerosene and oxygen — that is 95% of the stage by mass. Now fit the upper stage.',
  'upper-stage':
    'Upper stage mated. Notice the delta-v jump: hydrogen gives 348 seconds of specific impulse against the booster’s 311, and that efficiency is worth more up here than raw thrust.',
  telescope:
    'Telescope is installed. Eight tonnes, and you just watched your delta-v margin drop for it. That is the trade every mission planner makes.',
  fairing:
    'Fairing closed out. Stack is flight ready — check the board, then we roll out to the pad.',
};

function attachNextPart(): void {
  const part = assembly.attachNext();
  if (!part) {
    say('Nothing left to fit. The vehicle is complete.');
    return;
  }
  log(`FITTED  ${part.name}`, true);
  say(BUILD_DIALOGUE[part.id] ?? `${part.name} fitted.`);
  refreshReadout();
}

function detachTopPart(): void {
  const part = assembly.detachTop();
  if (!part) {
    say('The stand is already empty.');
    return;
  }
  log(`REMOVED  ${part.name}`);
  say(`${part.name} removed. Watch what that does to the delta-v figure.`);
  refreshReadout();
}

window.addEventListener('keydown', (e) => {
  if (!player.isLocked) return;
  if (e.code === 'KeyE') attachNextPart();
  if (e.code === 'KeyQ') detachTopPart();
  if (e.code === 'KeyR') {
    assembly.clear();
    log('STACK CLEARED');
    say('Stand cleared. Start again from the core booster.');
    refreshReadout();
  }
});

// --------------------------------------------------------------- start up

startButton.addEventListener('click', () => {
  startOverlay.classList.add('hidden');
  hud.classList.remove('hidden');
  player.requestLock(canvas);
});

// Returning to the overlay when the player releases the cursor keeps the
// controls discoverable instead of leaving them stuck with a dead screen.
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) return;
  startOverlay.classList.remove('hidden');
  startButton.textContent = 'Resume';
});

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
say(
  'Morning, engineer. That stand is empty and we launch in three weeks. Start with the core booster and work up.',
);
frame();

// Vite HMR: drop the input listeners so reloads do not stack handlers.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    detachInput();
    renderer.dispose();
  });
}
