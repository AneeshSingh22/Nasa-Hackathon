import * as THREE from 'three';
import { PART_LIBRARY, type PartDefinition } from './parts';

/**
 * The mission-control blueprint display.
 *
 * A large screen showing the whole launch vehicle as an assembly drawing: the
 * four sections stacked in the order they are built, each filling in as it is
 * fitted. Reading ten placards to work out what was still missing was the most
 * confusing thing in the bay; a picture of the rocket answers it instantly.
 */

const TEX_W = 2048;
const TEX_H = 1280;

const PAPER = '#0f1b2b';
const INK = '#e9f2fb';
const DIM = '#7e93ab';
const DONE = '#5fd99a';
const PENDING = '#ffbc4d';
const RULE = '#2c4560';
const GRIDLINE = '#17283c';

export interface BlueprintSlot {
  kind: PartDefinition['kind'];
  heading: string;
  /** Where the options for this slot are stored. */
  bayLabel: string;
  /** Build step number. */
  step: number;
  /** Fraction of the drawing's height this section occupies. */
  heightShare: number;
}

/** The four sections, listed bottom-up as the vehicle is built. */
export const BLUEPRINT_SLOTS: BlueprintSlot[] = [
  {
    kind: 'booster',
    heading: 'First stage',
    bayLabel: 'Left wall',
    step: 1,
    heightShare: 0.46,
  },
  {
    kind: 'upper',
    heading: 'Second stage',
    bayLabel: 'Left wall, rear',
    step: 2,
    heightShare: 0.2,
  },
  {
    kind: 'payload',
    heading: 'Payload',
    bayLabel: 'Back wall',
    step: 3,
    heightShare: 0.13,
  },
  {
    kind: 'fairing',
    heading: 'Fairing',
    bayLabel: 'Right wall',
    step: 4,
    heightShare: 0.21,
  },
];

export interface BlueprintState {
  /** The part fitted in each slot, by kind. Absent means still open. */
  fitted: Map<PartDefinition['kind'], PartDefinition>;
  /** The slot the player should work on next. */
  nextKind: PartDefinition['kind'] | null;
}

/** Colour for a section given its status. */
function statusColour(done: boolean, active: boolean): string {
  return done ? DONE : active ? PENDING : DIM;
}

/**
 * Draw one section of the assembled vehicle, in elevation.
 *
 * Sections touch one another so the result reads as a single rocket rather
 * than four separate diagrams.
 */
function drawSection(
  ctx: CanvasRenderingContext2D,
  slot: BlueprintSlot,
  cx: number,
  top: number,
  height: number,
  bodyWidth: number,
  done: boolean,
  active: boolean,
): void {
  const colour = statusColour(done, active);
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineWidth = done || active ? 5 : 3;
  ctx.fillStyle = done
    ? 'rgba(95,217,154,0.16)'
    : active
      ? 'rgba(255,188,77,0.12)'
      : 'rgba(126,147,171,0.05)';
  if (!done && !active) ctx.setLineDash([12, 9]);

  const halfW = bodyWidth / 2;

  if (slot.kind === 'fairing') {
    // Ogive nose, tapering to a point at the top of the stack.
    ctx.beginPath();
    ctx.moveTo(cx - halfW, top + height);
    ctx.lineTo(cx - halfW, top + height * 0.42);
    ctx.quadraticCurveTo(cx - halfW, top, cx, top);
    ctx.quadraticCurveTo(cx + halfW, top, cx + halfW, top + height * 0.42);
    ctx.lineTo(cx + halfW, top + height);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Split line: a fairing comes apart in two halves.
    ctx.setLineDash([10, 8]);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx, top + 6);
    ctx.lineTo(cx, top + height);
    ctx.stroke();
  } else if (slot.kind === 'payload') {
    // The payload rides inside the fairing, so draw it narrower.
    const busW = bodyWidth * 0.52;
    ctx.beginPath();
    ctx.rect(cx - busW / 2, top, busW, height);
    ctx.fill();
    ctx.stroke();

    // Solar arrays folded against the bus.
    ctx.lineWidth = 2.5;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.rect(
        side < 0 ? cx - busW / 2 - bodyWidth * 0.14 : cx + busW / 2,
        top + height * 0.2,
        bodyWidth * 0.14,
        height * 0.5,
      );
      ctx.stroke();
    }
  } else {
    // A stage: tank body with an engine section at the base.
    ctx.beginPath();
    ctx.rect(cx - halfW, top, bodyWidth, height * 0.86);
    ctx.fill();
    ctx.stroke();

    // Tank division line, which is what makes it read as a stage.
    ctx.lineWidth = 2.5;
    ctx.setLineDash([9, 7]);
    ctx.beginPath();
    ctx.moveTo(cx - halfW, top + height * 0.42);
    ctx.lineTo(cx + halfW, top + height * 0.42);
    ctx.stroke();
    ctx.setLineDash(done || active ? [] : [12, 9]);

    // Engine bells: several on the first stage, one on the second.
    const bells = slot.kind === 'booster' ? 3 : 1;
    const bellW = slot.kind === 'booster' ? bodyWidth / 4 : bodyWidth * 0.42;
    const bellTop = top + height * 0.86;
    const bellH = height * 0.14;
    ctx.lineWidth = done || active ? 4 : 3;
    for (let i = 0; i < bells; i++) {
      const dx = bells === 1 ? 0 : (i - 1) * (bodyWidth / 3.2);
      ctx.beginPath();
      ctx.moveTo(cx + dx - bellW * 0.3, bellTop);
      ctx.lineTo(cx + dx - bellW * 0.55, bellTop + bellH);
      ctx.lineTo(cx + dx + bellW * 0.55, bellTop + bellH);
      ctx.lineTo(cx + dx + bellW * 0.3, bellTop);
      ctx.closePath();
      ctx.stroke();
    }
  }

  ctx.restore();
}

/** Render the blueprint to a canvas. */
export function drawBlueprint(state: BlueprintState): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2D context for the blueprint');

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  // Engineering grid.
  ctx.strokeStyle = GRIDLINE;
  ctx.lineWidth = 1;
  for (let gx = 0; gx <= TEX_W; gx += 48) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, TEX_H);
    ctx.stroke();
  }
  for (let gy = 0; gy <= TEX_H; gy += 48) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(TEX_W, gy);
    ctx.stroke();
  }

  ctx.strokeStyle = RULE;
  ctx.lineWidth = 5;
  ctx.strokeRect(28, 28, TEX_W - 56, TEX_H - 56);

  ctx.fillStyle = INK;
  ctx.font = '700 62px Arial, Helvetica, sans-serif';
  ctx.fillText('LAUNCH VEHICLE ASSEMBLY', 70, 116);

  ctx.fillStyle = DIM;
  ctx.font = '500 30px "Courier New", monospace';
  ctx.fillText(
    'AD ASTRA PROGRAMME  ·  MISSION 02  ·  BUILD FROM THE BOTTOM UP',
    70,
    162,
  );

  ctx.strokeStyle = RULE;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(70, 190);
  ctx.lineTo(TEX_W - 70, 190);
  ctx.stroke();

  // ---- the assembled vehicle, drawn as one stack ----
  const drawTop = 240;
  const drawHeight = TEX_H - 420;
  const cx = 420;
  const bodyWidth = 210;

  // Centre line.
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 2;
  ctx.setLineDash([16, 10, 4, 10]);
  ctx.beginPath();
  ctx.moveTo(cx, drawTop - 30);
  ctx.lineTo(cx, drawTop + drawHeight + 40);
  ctx.stroke();
  ctx.setLineDash([]);

  // Canvas y increases downward, so iterate the slots in reverse to draw the
  // top of the rocket first.
  const topDown = [...BLUEPRINT_SLOTS].reverse();
  let y = drawTop;
  const bounds: Array<{ slot: BlueprintSlot; top: number; height: number }> = [];

  for (const slot of topDown) {
    const height = drawHeight * slot.heightShare;
    const fitted = state.fitted.get(slot.kind);
    const done = fitted !== undefined;
    const active = !done && state.nextKind === slot.kind;

    drawSection(ctx, slot, cx, y, height, bodyWidth, done, active);
    bounds.push({ slot, top: y, height });
    y += height;
  }

  // ---- leader lines and labels down the right ----
  const labelX = 740;
  for (const { slot, top, height } of bounds) {
    const fitted = state.fitted.get(slot.kind);
    const done = fitted !== undefined;
    const active = !done && state.nextKind === slot.kind;
    const colour = statusColour(done, active);
    const midY = top + height / 2;

    ctx.strokeStyle = RULE;
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    ctx.moveTo(cx + bodyWidth / 2 + 14, midY);
    ctx.lineTo(labelX - 92, midY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Status badge: a tick when fitted, the step number otherwise.
    ctx.beginPath();
    ctx.arc(labelX - 52, midY, 30, 0, Math.PI * 2);
    ctx.fillStyle = done ? DONE : active ? PENDING : '#1b2c42';
    ctx.fill();
    ctx.strokeStyle = colour;
    ctx.lineWidth = 3;
    ctx.stroke();

    if (done) {
      ctx.strokeStyle = PAPER;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(labelX - 66, midY);
      ctx.lineTo(labelX - 56, midY + 12);
      ctx.lineTo(labelX - 36, midY - 16);
      ctx.stroke();
    } else {
      ctx.fillStyle = active ? PAPER : DIM;
      ctx.font = '700 34px Arial, Helvetica, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(slot.step), labelX - 52, midY + 12);
      ctx.textAlign = 'left';
    }

    ctx.fillStyle = done ? DONE : active ? INK : DIM;
    ctx.font = '700 44px Arial, Helvetica, sans-serif';
    ctx.fillText(slot.heading.toUpperCase(), labelX, midY - 4);

    ctx.font = '500 28px "Courier New", monospace';
    if (fitted) {
      ctx.fillStyle = INK;
      ctx.fillText(fitted.name, labelX, midY + 42);
      ctx.fillStyle = DIM;
      const mass = (fitted.dryMass + fitted.propellantMass) / 1000;
      ctx.fillText(`${mass.toFixed(1)} t   $${fitted.cost}M`, labelX + 660, midY + 42);
    } else {
      const options = PART_LIBRARY.filter((p) => p.kind === slot.kind);
      ctx.fillStyle = active ? PENDING : DIM;
      ctx.fillText(
        `${options.length} option${options.length === 1 ? '' : 's'} · ${slot.bayLabel}`,
        labelX,
        midY + 42,
      );
      if (active) {
        ctx.fillStyle = PENDING;
        ctx.font = '700 30px "Courier New", monospace';
        ctx.fillText('FIT THIS NEXT', labelX + 660, midY + 42);
      }
    }
  }

  // ---- overall dimension on the left ----
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 2;
  const dimX = 180;
  ctx.beginPath();
  ctx.moveTo(dimX, drawTop);
  ctx.lineTo(dimX, drawTop + drawHeight);
  ctx.stroke();
  for (const ty of [drawTop, drawTop + drawHeight]) {
    ctx.beginPath();
    ctx.moveTo(dimX - 14, ty);
    ctx.lineTo(dimX + 14, ty);
    ctx.stroke();
  }
  ctx.save();
  ctx.translate(dimX - 28, drawTop + drawHeight / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = DIM;
  ctx.font = '500 28px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('FULL STACK', 0, 0);
  ctx.restore();
  ctx.textAlign = 'left';

  // ---- status strip along the bottom ----
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(70, TEX_H - 150);
  ctx.lineTo(TEX_W - 70, TEX_H - 150);
  ctx.stroke();

  const fittedCount = state.fitted.size;
  ctx.fillStyle = fittedCount === 4 ? DONE : INK;
  ctx.font = '700 42px Arial, Helvetica, sans-serif';
  ctx.fillText(`${fittedCount} OF 4 SECTIONS FITTED`, 70, TEX_H - 88);

  const totalMass = [...state.fitted.values()].reduce(
    (sum, p) => sum + p.dryMass + p.propellantMass,
    0,
  );
  if (totalMass > 0) {
    ctx.fillStyle = DIM;
    ctx.font = '500 30px "Courier New", monospace';
    ctx.fillText(`STACK MASS  ${(totalMass / 1000).toFixed(1)} t`, 800, TEX_H - 88);
  }

  // Legend.
  const legend: Array<[string, string]> = [
    [DONE, 'Fitted'],
    [PENDING, 'Next'],
    [DIM, 'Open'],
  ];
  let lx = TEX_W - 620;
  for (const [colour, label] of legend) {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(lx, TEX_H - 98, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = DIM;
    ctx.font = '500 30px "Courier New", monospace';
    ctx.fillText(label, lx + 28, TEX_H - 88);
    lx += 60 + ctx.measureText(label).width + 40;
  }

  return canvas;
}

export interface BlueprintBoard {
  group: THREE.Group;
  /** Redraw the board after a part is fitted. */
  refresh: (state: BlueprintState) => void;
}

/** Build the physical display, mounted high on the wall. */
export function createBlueprintBoard(state: BlueprintState): BlueprintBoard {
  const group = new THREE.Group();

  const canvas = drawBlueprint(state);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  // MeshBasicMaterial, so the screen is self-lit and legible from across the
  // bay regardless of how the room is lit. A MeshStandardMaterial rendered the
  // display almost black wherever the wall was in shadow.
  const faceMat = new THREE.MeshBasicMaterial({ map: texture });

  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x2b3542,
    metalness: 0.55,
    roughness: 0.45,
  });

  const boardW = 22;
  const boardH = 13.75; // 16:10, matching the texture aspect
  const centreY = 15;

  /**
   * Bezel behind the screen.
   *
   * Depth and position matter here. An earlier version put a 0.3 m deep box
   * centred at z = 0 with the screen at z = +0.09, so the bezel's front face
   * at z = +0.15 sat *in front of* the display — and since the board faces the
   * player, all they saw was a black rectangle. The bezel now sits entirely
   * behind the screen plane.
   */
  const bezel = new THREE.Mesh(
    new THREE.BoxGeometry(boardW + 0.8, boardH + 0.8, 0.35),
    frameMat,
  );
  bezel.position.set(0, centreY, -0.25);
  group.add(bezel);

  const face = new THREE.Mesh(new THREE.PlaneGeometry(boardW, boardH), faceMat);
  face.position.set(0, centreY, 0.03);
  group.add(face);

  // Mounting arms behind the panel.
  for (const lx of [-boardW / 2 + 1.5, boardW / 2 - 1.5]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 1.4), frameMat);
    arm.position.set(lx, centreY, -1.0);
    group.add(arm);
  }

  return {
    group,
    refresh(next: BlueprintState) {
      const redrawn = drawBlueprint(next);
      texture.image = redrawn;
      texture.needsUpdate = true;
    },
  };
}
