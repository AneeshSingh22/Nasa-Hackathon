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
export function drawPictogram(
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

  if (part.id === 'solid-booster') {
    // Segmented casing and one big nozzle: a solid motor, not a liquid core.
    const bodyW = w * 0.4;
    const top = h * 0.1;
    const bodyH = h * 0.66;
    ctx.fillStyle = '#eef2f7';
    ctx.beginPath();
    ctx.rect(cx - bodyW / 2, top, bodyW, bodyH);
    ctx.fill();
    ctx.stroke();

    // Segment joints.
    for (let i = 1; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(cx - bodyW / 2, top + (bodyH / 5) * i);
      ctx.lineTo(cx + bodyW / 2, top + (bodyH / 5) * i);
      ctx.stroke();
    }

    // Nose cap.
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(cx, top - h * 0.08);
    ctx.lineTo(cx - bodyW / 2, top);
    ctx.lineTo(cx + bodyW / 2, top);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Single large nozzle.
    ctx.fillStyle = '#d3dae4';
    ctx.beginPath();
    ctx.moveTo(cx - bodyW * 0.3, top + bodyH);
    ctx.lineTo(cx - bodyW * 0.62, h * 0.94);
    ctx.lineTo(cx + bodyW * 0.62, h * 0.94);
    ctx.lineTo(cx + bodyW * 0.3, top + bodyH);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (part.id === 'extended-booster') {
    // Stretched core, flared base, four engines.
    const bodyW = w * 0.46;
    const top = h * 0.06;
    const bodyH = h * 0.72;
    ctx.fillStyle = '#eef2f7';
    ctx.beginPath();
    ctx.moveTo(cx - bodyW / 2, top);
    ctx.lineTo(cx - bodyW * 0.55, top + bodyH);
    ctx.lineTo(cx + bodyW * 0.55, top + bodyH);
    ctx.lineTo(cx + bodyW / 2, top);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Two insulation bands, marking the extra tank sections.
    ctx.fillStyle = '#e8c96a';
    for (const frac of [0.3, 0.56]) {
      ctx.beginPath();
      ctx.rect(cx - bodyW / 2, top + bodyH * frac, bodyW, h * 0.045);
      ctx.fill();
      ctx.stroke();
    }

    // Four engines.
    ctx.fillStyle = '#d3dae4';
    for (let i = 0; i < 4; i++) {
      const dx = (i - 1.5) * (bodyW / 4);
      ctx.beginPath();
      ctx.moveTo(cx + dx - bodyW * 0.1, top + bodyH);
      ctx.lineTo(cx + dx - bodyW * 0.14, h * 0.94);
      ctx.lineTo(cx + dx + bodyW * 0.14, h * 0.94);
      ctx.lineTo(cx + dx + bodyW * 0.1, top + bodyH);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  } else if (part.id === 'kerolox-upper') {
    // Bare ribbed tank, short nozzle, no insulation blanket.
    const bodyW = w * 0.4;
    const top = h * 0.16;
    const bodyH = h * 0.56;
    ctx.fillStyle = '#eef2f7';
    ctx.beginPath();
    ctx.rect(cx - bodyW / 2, top, bodyW, bodyH);
    ctx.fill();
    ctx.stroke();

    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(cx - bodyW / 2, top + (bodyH / 4) * i);
      ctx.lineTo(cx + bodyW / 2, top + (bodyH / 4) * i);
      ctx.stroke();
    }

    ctx.fillStyle = '#d3dae4';
    ctx.beginPath();
    ctx.moveTo(cx - bodyW * 0.22, top + bodyH);
    ctx.lineTo(cx - bodyW * 0.4, h * 0.88);
    ctx.lineTo(cx + bodyW * 0.4, h * 0.88);
    ctx.lineTo(cx + bodyW * 0.22, top + bodyH);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (part.id === 'comms-probe') {
    // Small bus dominated by a dish.
    const busW = w * 0.26;
    const top = h * 0.44;
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.rect(cx - busW / 2, top, busW, h * 0.34);
    ctx.fill();
    ctx.stroke();

    // Big dish above.
    ctx.beginPath();
    ctx.arc(cx, top, w * 0.2, Math.PI, 0);
    ctx.fillStyle = '#eef2f7';
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, top - w * 0.2);
    ctx.lineTo(cx, top);
    ctx.stroke();

    // Small stowed arrays.
    ctx.fillStyle = '#2c3f6b';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.rect(
        side < 0 ? cx - busW / 2 - w * 0.06 : cx + busW / 2,
        top + h * 0.06,
        w * 0.06,
        h * 0.2,
      );
      ctx.fill();
      ctx.stroke();
    }
  } else if (part.id === 'crew-capsule') {
    // Blunt cone with a heat shield and a docking ring.
    const topW = w * 0.2;
    const baseW = w * 0.38;
    const top = h * 0.3;
    const bodyH = h * 0.36;
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(cx - topW / 2, top);
    ctx.lineTo(cx - baseW / 2, top + bodyH);
    ctx.lineTo(cx + baseW / 2, top + bodyH);
    ctx.lineTo(cx + topW / 2, top);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Heat shield.
    ctx.fillStyle = '#5a6472';
    ctx.beginPath();
    ctx.moveTo(cx - baseW / 2, top + bodyH);
    ctx.quadraticCurveTo(cx, top + bodyH + h * 0.12, cx + baseW / 2, top + bodyH);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Docking ring.
    ctx.beginPath();
    ctx.ellipse(cx, top, topW * 0.55, h * 0.022, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Windows.
    ctx.fillStyle = accent;
    for (const dx of [-0.09, 0.09]) {
      ctx.beginPath();
      ctx.arc(cx + w * dx, top + bodyH * 0.42, w * 0.022, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (part.id === 'science-lab') {
    // Long pressurised module with big arrays.
    const modW = w * 0.3;
    const top = h * 0.34;
    const bodyH = h * 0.3;
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.rect(cx - modW / 2, top, modW, bodyH);
    ctx.fill();
    ctx.stroke();

    // End domes.
    for (const [y, start, end] of [
      [top, Math.PI, 0],
      [top + bodyH, 0, Math.PI],
    ] as Array<[number, number, number]>) {
      ctx.beginPath();
      ctx.arc(cx, y, modW / 2, start, end);
      ctx.fill();
      ctx.stroke();
    }

    // Large arrays, the visual signature of the power-hungry payload.
    ctx.fillStyle = '#2c3f6b';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.rect(
        side < 0 ? cx - modW / 2 - w * 0.26 : cx + modW / 2 + w * 0.06,
        top + bodyH * 0.16,
        w * 0.2,
        bodyH * 0.6,
      );
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + side * (modW / 2), top + bodyH * 0.46);
      ctx.lineTo(cx + side * (modW / 2 + w * 0.06), top + bodyH * 0.46);
      ctx.stroke();
    }
  } else if (part.kind === 'booster' || part.kind === 'upper') {
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

/**
 * Placard for a whole step's station.
 *
 * Shows which section of the rocket this station issues, drawn large, plus how
 * many options it holds. The player picks between them at the station, so the
 * sign identifies the *step* rather than one specific part — every placard
 * looking the same was what made the bay unreadable.
 */
export function placardForStation(
  kind: PartDefinition['kind'],
  label: string,
  bay: 'stages' | 'payloads' | 'structure',
  step: number,
  selectedId?: string,
): THREE.CanvasTexture | null {
  const options = PART_LIBRARY.filter((p) => p.kind === kind);
  // Draw the selected variant, so the sign on the bench follows Tab.
  const exemplar = options.find((p) => p.id === selectedId) ?? options[0];
  if (!exemplar) return null;

  const canvas = document.createElement('canvas');
  canvas.width = TEX_WIDTH;
  canvas.height = TEX_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const accent = BAY_COLOUR[bay] ?? '#2e9fc4';

  ctx.fillStyle = '#f7f9fb';
  ctx.fillRect(0, 0, TEX_WIDTH, TEX_HEIGHT);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 30, TEX_HEIGHT);

  // Enormous step number.
  ctx.fillStyle = accent;
  ctx.font = '700 210px Arial, Helvetica, sans-serif';
  ctx.fillText(String(step), 58, 268);
  ctx.fillStyle = DIM;
  ctx.font = '600 28px "Courier New", monospace';
  ctx.fillText('STEP', 74, 312);

  // Section name.
  ctx.fillStyle = INK;
  ctx.font = '700 66px Arial, Helvetica, sans-serif';
  const heading = label.split('·').pop()?.trim() ?? label;
  ctx.fillText(heading.toUpperCase(), 300, 132);

  ctx.strokeStyle = RULE;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(300, 166);
  ctx.lineTo(TEX_WIDTH - 44, 166);
  ctx.stroke();

  ctx.fillStyle = accent;
  ctx.font = '600 40px "Courier New", monospace';
  ctx.fillText(
    `${options.length} option${options.length === 1 ? '' : 's'} — press TAB to compare`,
    300,
    232,
  );

  ctx.fillStyle = INK;
  ctx.font = '600 34px Arial, Helvetica, sans-serif';
  ctx.fillText(exemplar.name, 300, 292);

  ctx.fillStyle = DIM;
  ctx.font = '500 26px "Courier New", monospace';
  const exMass = (exemplar.dryMass + exemplar.propellantMass) / 1000;
  ctx.fillText(
    `${exMass.toFixed(1)} t  ·  $${exemplar.cost}M  ·  press E to collect`,
    300,
    336,
  );

  // Big diagram of this section on the right.
  const boxX = TEX_WIDTH - 420;
  const boxY = 72;
  const boxW = 360;
  const boxH = 380;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 3;
  ctx.strokeRect(boxX, boxY, boxW, boxH);
  drawPictogram(ctx, exemplar, boxX, boxY, boxW, boxH, accent);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
