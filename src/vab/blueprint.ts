import * as THREE from 'three';
import { PART_LIBRARY, type PartDefinition } from './parts';

/**
 * The blueprint board.
 *
 * A wall-sized exploded diagram of the vehicle showing every slot, what goes
 * in it, and which ones are done. Slots fill in as the player builds.
 *
 * This exists because reading ten near-identical placards to work out what was
 * missing was the most confusing thing in the bay. A diagram answers "what do
 * I still need" at a glance, which is how people actually keep track.
 */

const TEX_W = 1600;
const TEX_H = 1100;

const PAPER = '#132132';

const INK = '#e9f2fb';
const DIM = '#7e93ab';
const DONE = '#5fd99a';
const PENDING = '#ffbc4d';
const RULE = '#2c4560';

/** The four slots, bottom to top, with the alternatives available for each. */
export interface BlueprintSlot {
  kind: PartDefinition['kind'];
  heading: string;
  /** Where the options for this slot are stored, for the "collect from" line. */
  bayLabel: string;
}

export const BLUEPRINT_SLOTS: BlueprintSlot[] = [
  { kind: 'booster', heading: 'First stage', bayLabel: 'Left wall' },
  { kind: 'upper', heading: 'Second stage', bayLabel: 'Left wall, rear' },
  { kind: 'payload', heading: 'Payload', bayLabel: 'Back wall' },
  { kind: 'fairing', heading: 'Fairing', bayLabel: 'Right wall' },
];

export interface BlueprintState {
  /** The part fitted in each slot, by kind. Absent means still open. */
  fitted: Map<PartDefinition['kind'], PartDefinition>;
  /** The slot the player should work on next. */
  nextKind: PartDefinition['kind'] | null;
}

/** Draw a schematic of one stage in the exploded view. */
function drawSlotDiagram(
  ctx: CanvasRenderingContext2D,
  kind: PartDefinition['kind'],
  x: number,
  y: number,
  w: number,
  h: number,
  done: boolean,
  active: boolean,
): void {
  const stroke = done ? DONE : active ? PENDING : DIM;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = done || active ? 4 : 2.5;
  ctx.fillStyle = done ? 'rgba(95,217,154,0.14)' : 'rgba(255,255,255,0.03)';

  const cx = w / 2;

  if (kind === 'booster' || kind === 'upper') {
    const bodyW = w * 0.5;
    ctx.beginPath();
    ctx.rect(cx - bodyW / 2, h * 0.1, bodyW, h * 0.66);
    ctx.fill();
    ctx.stroke();

    // Engine bells.
    const bells = kind === 'booster' ? 3 : 1;
    const bw = kind === 'booster' ? bodyW / 3.6 : bodyW * 0.44;
    for (let i = 0; i < bells; i++) {
      const dx = bells === 1 ? 0 : (i - 1) * (bodyW / 3);
      ctx.beginPath();
      ctx.moveTo(cx + dx - bw * 0.3, h * 0.76);
      ctx.lineTo(cx + dx - bw * 0.52, h * 0.94);
      ctx.lineTo(cx + dx + bw * 0.52, h * 0.94);
      ctx.lineTo(cx + dx + bw * 0.3, h * 0.76);
      ctx.closePath();
      ctx.stroke();
    }
  } else if (kind === 'fairing') {
    const bodyW = w * 0.5;
    ctx.beginPath();
    ctx.moveTo(cx - bodyW / 2, h * 0.92);
    ctx.lineTo(cx - bodyW / 2, h * 0.42);
    ctx.quadraticCurveTo(cx - bodyW / 2, h * 0.08, cx, h * 0.08);
    ctx.quadraticCurveTo(cx + bodyW / 2, h * 0.08, cx + bodyW / 2, h * 0.42);
    ctx.lineTo(cx + bodyW / 2, h * 0.92);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    // Payload: bus with solar wings.
    const busW = w * 0.3;
    ctx.beginPath();
    ctx.rect(cx - busW / 2, h * 0.3, busW, h * 0.44);
    ctx.fill();
    ctx.stroke();
    for (const side of [-1, 1]) {
      const pw = w * 0.2;
      const px = cx + side * (busW / 2 + w * 0.05);
      ctx.beginPath();
      ctx.rect(side < 0 ? px - pw : px, h * 0.4, pw, h * 0.22);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + side * (busW / 2), h * 0.51);
      ctx.lineTo(px, h * 0.51);
      ctx.stroke();
    }
  }

  ctx.restore();
}

/** Render the blueprint to a canvas texture. */
export function drawBlueprint(state: BlueprintState): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2D context for the blueprint');

  // Paper.
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  // Engineering grid.
  ctx.strokeStyle = '#1d3350';
  ctx.lineWidth = 1;
  for (let gx = 0; gx <= TEX_W; gx += 40) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, TEX_H);
    ctx.stroke();
  }
  for (let gy = 0; gy <= TEX_H; gy += 40) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(TEX_W, gy);
    ctx.stroke();
  }

  // Border and title block.
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 4;
  ctx.strokeRect(24, 24, TEX_W - 48, TEX_H - 48);

  ctx.fillStyle = INK;
  ctx.font = '700 52px Arial, Helvetica, sans-serif';
  ctx.fillText('LAUNCH VEHICLE — ASSEMBLY SEQUENCE', 60, 100);

  ctx.fillStyle = DIM;
  ctx.font = '500 26px "Courier New", monospace';
  ctx.fillText('AD ASTRA PROGRAMME  ·  MISSION 02  ·  BUILD BOTTOM-UP', 60, 142);

  ctx.strokeStyle = RULE;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(60, 168);
  ctx.lineTo(TEX_W - 60, 168);
  ctx.stroke();

  // Exploded stack down the left, stage by stage from the bottom up.
  const diagramX = 110;
  const diagramW = 300;
  const rowH = 200;
  const startY = 210;

  // Order the drawing bottom-to-top visually: reverse so first stage is lowest.
  const rows = [...BLUEPRINT_SLOTS].reverse();

  rows.forEach((slot, index) => {
    const y = startY + index * rowH;
    const fitted = state.fitted.get(slot.kind);
    const done = fitted !== undefined;
    const active = !done && state.nextKind === slot.kind;

    drawSlotDiagram(ctx, slot.kind, diagramX, y, diagramW, rowH - 30, done, active);

    // Connector line to the text column.
    ctx.strokeStyle = RULE;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(diagramX + diagramW + 10, y + (rowH - 30) / 2);
    ctx.lineTo(560, y + (rowH - 30) / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Status marker.
    const markerX = 600;
    const markerY = y + (rowH - 30) / 2;
    ctx.beginPath();
    ctx.arc(markerX, markerY - 8, 22, 0, Math.PI * 2);
    ctx.fillStyle = done ? DONE : active ? PENDING : '#1e3149';
    ctx.fill();
    ctx.strokeStyle = done ? DONE : active ? PENDING : RULE;
    ctx.lineWidth = 3;
    ctx.stroke();

    if (done) {
      // Tick.
      ctx.strokeStyle = PAPER;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(markerX - 10, markerY - 8);
      ctx.lineTo(markerX - 2, markerY + 1);
      ctx.lineTo(markerX + 11, markerY - 17);
      ctx.stroke();
    } else {
      ctx.fillStyle = active ? PAPER : DIM;
      ctx.font = '700 26px Arial, Helvetica, sans-serif';
      ctx.fillText(String(rows.length - index), markerX - 8, markerY + 2);
    }

    // Heading and detail.
    ctx.fillStyle = done ? DONE : active ? INK : DIM;
    ctx.font = '700 40px Arial, Helvetica, sans-serif';
    ctx.fillText(slot.heading.toUpperCase(), markerX + 48, markerY - 4);

    ctx.font = '500 25px "Courier New", monospace';
    if (fitted) {
      ctx.fillStyle = INK;
      ctx.fillText(fitted.name, markerX + 48, markerY + 36);
      ctx.fillStyle = DIM;
      const mass = (fitted.dryMass + fitted.propellantMass) / 1000;
      ctx.fillText(
        `${mass.toFixed(1)} t   $${fitted.cost}M   FITTED`,
        markerX + 48,
        markerY + 70,
      );
    } else {
      const options = PART_LIBRARY.filter((p) => p.kind === slot.kind);
      ctx.fillStyle = active ? PENDING : DIM;
      ctx.fillText(
        `${options.length} option${options.length === 1 ? '' : 's'}  ·  ${slot.bayLabel}`,
        markerX + 48,
        markerY + 36,
      );
      if (active) {
        ctx.fillStyle = PENDING;
        ctx.font = '700 25px "Courier New", monospace';
        ctx.fillText('← NEXT', markerX + 48, markerY + 70);
      }
    }
  });

  // Legend.
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(60, TEX_H - 120);
  ctx.lineTo(TEX_W - 60, TEX_H - 120);
  ctx.stroke();

  const legend: Array<[string, string]> = [
    [DONE, 'Fitted'],
    [PENDING, 'Next'],
    [DIM, 'Not started'],
  ];
  let lx = 62;
  for (const [colour, label] of legend) {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(lx + 12, TEX_H - 72, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = DIM;
    ctx.font = '500 26px "Courier New", monospace';
    ctx.fillText(label, lx + 36, TEX_H - 63);
    lx += 40 + ctx.measureText(label).width + 50;
  }

  return canvas;
}

export interface BlueprintBoard {
  group: THREE.Group;
  /** Redraw the board after a part is fitted. */
  refresh: (state: BlueprintState) => void;
}

/** Build the physical board, mounted on the wall beside the entrance. */
export function createBlueprintBoard(state: BlueprintState): BlueprintBoard {
  const group = new THREE.Group();

  const canvas = drawBlueprint(state);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  const faceMat = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.78,
    metalness: 0.05,
  });
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x3c4756,
    metalness: 0.5,
    roughness: 0.5,
  });

  // The board itself: 11 m wide, angled slightly off the wall so it catches
  // the light and reads from across the floor.
  // Large enough to read from the middle of the bay: this is a mission-control
  // display, not a poster.
  const boardW = 20;
  const boardH = 12;

  const face = new THREE.Mesh(new THREE.PlaneGeometry(boardW, boardH), faceMat);
  face.position.set(0, 14, 0.09);
  group.add(face);

  const backing = new THREE.Mesh(
    new THREE.BoxGeometry(boardW + 0.7, boardH + 0.7, 0.3),
    frameMat,
  );
  backing.position.set(0, 14, 0);
  backing.castShadow = true;
  group.add(backing);

  // Two lights aimed at it, because an unlit board at the back of a dim bay is
  // unreadable.
  for (const lx of [-7, 0, 7]) {
    const lamp = new THREE.PointLight(0xffffff, 22, 26, 2);
    lamp.position.set(lx, 14 + boardH / 2 + 1.4, 3.0);
    group.add(lamp);

    const housing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.28, 0.42, 12),
      frameMat,
    );
    housing.position.set(lx, 14 + boardH / 2 + 1.8, 3.0);
    housing.rotation.x = 0.65;
    group.add(housing);
  }

  // Make the screen self-lit, so it reads as a display rather than a printed
  // board and stays legible from across the bay.
  faceMat.emissive = new THREE.Color(0xffffff);
  faceMat.emissiveMap = texture;
  faceMat.emissiveIntensity = 0.55;

  return {
    group,
    refresh(next: BlueprintState) {
      const redrawn = drawBlueprint(next);
      texture.image = redrawn;
      texture.needsUpdate = true;
    },
  };
}
