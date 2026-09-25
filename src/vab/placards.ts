import * as THREE from 'three';
import { PART_LIBRARY, type PartDefinition } from './parts';

/**
 * Station placards: the printed signs on each bench.
 *
 * The bay was unreadable — identical grey benches with blank white boards, so
 * the player had no way to tell which station held what without walking up to
 * every one of them. Each placard now carries the part's name, a schematic
 * pictogram of the component, and the numbers that matter for the decision.
 *
 * Drawn to a canvas and used as a texture. That keeps everything in one bundle
 * with no font or image assets to load, and canvas text stays crisp at the
 * distances the player reads it from.
 */

/** Pixel size of the placard texture. Wide, because the sign is landscape. */
const TEX_WIDTH = 1024;
const TEX_HEIGHT = 512;

const INK = '#16202f';
const DIM = '#5b6880';
const RULE = '#c3ccd9';

/** Bay accent colours, matching the stripe on the bench front. */
const BAY_COLOUR: Record<string, string> = {
  stages: '#ff6b3d',
  payloads: '#2e9fc4',
  structure: '#d89a1f',
};

export interface PlacardOptions {
  part: PartDefinition;
  /** Heading above the part name, e.g. "Step 3 - Option B". */
  label: string;
  bay: 'stages' | 'payloads' | 'structure';
  /** Build step, drawn very large so stations are distinguishable at range. */
  step: number;
  /** Δv margin this part would leave, for payloads. Omitted for structure. */
  marginHint?: number;
}

/**
 * Draw a schematic of the component.
 *
 * Deliberately diagrammatic rather than pictorial: a technical sign on a bench
 * would carry an outline drawing, and an outline reads at a glance where a
 * shaded render does not.
 */
function drawPictogram(
  ctx: CanvasRenderingContext2D,
  part: PartDefinition,
  x: number,
  y: number,
  w: number,
  h: number,
  accent: string,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';

  const cx = w / 2;

  if (part.kind === 'booster' || part.kind === 'upper') {
    // Body.
    const bodyW = w * 0.42;
    const bodyH = h * 0.62;
    const top = h * 0.12;
    ctx.fillStyle = '#eef2f7';
    ctx.beginPath();
    ctx.rect(cx - bodyW / 2, top, bodyW, bodyH);
    ctx.fill();
    ctx.stroke();

    // Interstage band.
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.rect(cx - bodyW / 2, top + bodyH * 0.08, bodyW, h * 0.05);
    ctx.fill();

    // Engine bells: several for a booster, one large for an upper stage.
    const bells = part.kind === 'booster' ? 3 : 1;
    const bellW = part.kind === 'booster' ? bodyW / 3.4 : bodyW * 0.5;
    for (let i = 0; i < bells; i++) {
      const offset = bells === 1 ? 0 : (i - 1) * (bodyW / 3);
      ctx.beginPath();
      ctx.moveTo(cx + offset - bellW * 0.28, top + bodyH);
      ctx.lineTo(cx + offset - bellW * 0.5, top + bodyH + h * 0.16);
      ctx.lineTo(cx + offset + bellW * 0.5, top + bodyH + h * 0.16);
      ctx.lineTo(cx + offset + bellW * 0.28, top + bodyH);
      ctx.closePath();
      ctx.fillStyle = '#d3dae4';
      ctx.fill();
      ctx.stroke();
    }
  } else if (part.kind === 'fairing') {
    // Ogive nose over a short barrel.
    const bodyW = w * 0.44;
    const top = h * 0.14;
    ctx.fillStyle = '#eef2f7';
    ctx.beginPath();
    ctx.moveTo(cx - bodyW / 2, h * 0.86);
    ctx.lineTo(cx - bodyW / 2, top + h * 0.3);
    ctx.quadraticCurveTo(cx - bodyW / 2, top, cx, top);
    ctx.quadraticCurveTo(cx + bodyW / 2, top, cx + bodyW / 2, top + h * 0.3);
    ctx.lineTo(cx + bodyW / 2, h * 0.86);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Split line, since a fairing comes apart.
    ctx.strokeStyle = accent;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(cx, top);
    ctx.lineTo(cx, h * 0.86);
    ctx.stroke();
    ctx.setLineDash([]);
  } else {
    // Payload: a bus with solar wings, scaled by how big the payload is.
    const scale = Math.min(1.15, 0.55 + (part.dryMass / 14000) * 0.6);
    const busW = w * 0.24 * scale;
    const busH = h * 0.42 * scale;
    const top = h * 0.29;

    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.rect(cx - busW / 2, top, busW, busH);
    ctx.fill();
    ctx.stroke();

    // Solar arrays.
    ctx.fillStyle = '#2c3f6b';
    for (const side of [-1, 1]) {
      const panelW = w * 0.17 * scale;
      const px = cx + side * (busW / 2 + w * 0.035);
      ctx.beginPath();
      ctx.rect(side < 0 ? px - panelW : px, top + busH * 0.2, panelW, busH * 0.42);
      ctx.fill();
      ctx.stroke();
      // Boom.
      ctx.beginPath();
      ctx.moveTo(cx + side * (busW / 2), top + busH * 0.41);
      ctx.lineTo(px, top + busH * 0.41);
      ctx.stroke();
    }

    // A dish, or a telescope barrel, depending on the payload.
    if (part.id === 'telescope') {
      ctx.fillStyle = '#b9c6d8';
      ctx.beginPath();
      ctx.rect(cx - busW * 0.3, top - h * 0.16, busW * 0.6, h * 0.16);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(cx, top - h * 0.04, w * 0.055, Math.PI, 0);
      ctx.fillStyle = '#eef2f7';
      ctx.fill();
      ctx.stroke();
    }

    // Crew capsules get a hatch marker, so the stakes read from the sign.
    if (part.id === 'crew-capsule') {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(cx, top + busH * 0.55, busW * 0.2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.restore();
}

/** Build the placard texture for one station. */
export function createPlacardTexture(options: PlacardOptions): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_WIDTH;
  canvas.height = TEX_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get a 2D context for the placard');

  const accent = BAY_COLOUR[options.bay] ?? '#2e9fc4';

  // Sign face.
  ctx.fillStyle = '#f7f9fb';
  ctx.fillRect(0, 0, TEX_WIDTH, TEX_HEIGHT);

  // Accent bar down the left, keyed to the bay.
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 26, TEX_HEIGHT);

  // Header rule.
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(230, 118);
  ctx.lineTo(TEX_WIDTH - 40, 118);
  ctx.stroke();

  // Enormous step number on the left. Every placard previously looked the
  // same from a distance, which is what made the bay so hard to read.
  ctx.fillStyle = accent;
  ctx.font = '700 150px Arial, Helvetica, sans-serif';
  ctx.fillText(String(options.step), 52, 250);

  ctx.fillStyle = DIM;
  ctx.font = '600 24px "Courier New", monospace';
  ctx.fillText('STEP', 60, 288);

  // Bay label, moved right to clear the step number.
  ctx.fillStyle = accent;
  ctx.font = '600 34px "Courier New", monospace';
  ctx.fillText(options.label.toUpperCase(), 230, 78);

  // Part name, wrapped to two lines if needed.
  ctx.fillStyle = INK;
  ctx.font = '700 62px Arial, Helvetica, sans-serif';
  const words = options.part.name.split(' ');
  let line = '';
  let y = 190;
  const maxWidth = TEX_WIDTH - 580;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, 230, y);
      line = word;
      y += 68;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, 230, y);

  // Specification block. These are the numbers the decision turns on, so they
  // belong on the sign rather than only in a HUD panel.
  const mass = options.part.dryMass + options.part.propellantMass;
  const rows: Array<[string, string]> = [['MASS', `${(mass / 1000).toFixed(1)} t`]];

  if (options.part.thrust > 0) {
    rows.push(['THRUST', `${(options.part.thrust / 1e6).toFixed(2)} MN`]);
    rows.push(['ISP', `${options.part.isp} s`]);
  }
  if (options.part.science) {
    rows.push(['SCIENCE', String(options.part.science)]);
  }
  rows.push(['COST', `$${options.part.cost}M`]);
  if (options.marginHint !== undefined) {
    const sign = options.marginHint >= 0 ? '+' : '';
    rows.push(['ΔV MARGIN', `${sign}${options.marginHint.toFixed(0)} m/s`]);
  }

  let rowY = y + 62;
  for (const [term, value] of rows) {
    ctx.fillStyle = DIM;
    ctx.font = '500 28px "Courier New", monospace';
    ctx.fillText(term, 230, rowY);

    ctx.fillStyle = INK;
    ctx.font = '700 32px "Courier New", monospace';
    ctx.fillText(value, 470, rowY);

    rowY += 44;
  }

  // Pictogram on the right, inside a ruled box so it reads as a drawing.
  const boxX = TEX_WIDTH - 330;
  const boxY = 150;
  const boxW = 270;
  const boxH = 300;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 3;
  ctx.strokeRect(boxX, boxY, boxW, boxH);
  drawPictogram(ctx, options.part, boxX, boxY, boxW, boxH, accent);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Build a placard for the part a station holds, by part id. */
export function placardFor(
  partId: string,
  label: string,
  bay: 'stages' | 'payloads' | 'structure',
  step: number,
  marginHint?: number,
): THREE.CanvasTexture | null {
  const part = PART_LIBRARY.find((p) => p.id === partId);
  if (!part) return null;
  return createPlacardTexture({ part, label, bay, step, marginHint });
}
