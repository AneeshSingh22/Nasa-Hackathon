import * as THREE from 'three';

/**
 * Procedural surface detail.
 *
 * The scene's materials were flat colour, which is the real reason it read as
 * untextured plastic rather than as hardware. A real spacecraft surface is
 * covered in panel seams, fastener rows, weld lines and wear, and the eye reads
 * that density as "manufactured". Flat colour reads as "placeholder", however
 * good the lighting is.
 *
 * These are drawn to canvas at load time rather than downloaded, which keeps
 * the repository free of binary assets and licensing questions, costs nothing
 * to host, and lets a pattern follow the part rather than be tiled blindly over
 * it. The cost is a few milliseconds of startup per texture, so every generator
 * is cached.
 *
 * Each generator returns a colour map, a normal map and a roughness map. The
 * normal map is what makes a seam catch the light as the camera moves; without
 * it a panel line is a painted stripe and the surface still looks flat. The
 * roughness map is what stops a whole panel reflecting uniformly, which is the
 * other half of why untextured metal looks like plastic.
 */

const cache = new Map<string, MaterialMaps>();

export interface MaterialMaps {
  readonly map: THREE.CanvasTexture;
  readonly normalMap: THREE.CanvasTexture;
  readonly roughnessMap: THREE.CanvasTexture;
}

interface Surface {
  readonly ctx: CanvasRenderingContext2D;
  readonly element: HTMLCanvasElement;
}

/**
 * A drawable 2D surface, or null.
 *
 * Tests stub `getContext` with a handful of methods, and a locked-down browser
 * can return a context that is missing pieces too. Generating a texture must
 * never throw into module scope — an untextured scene is a degraded look, but a
 * throw here would take the whole game down before the start button is wired.
 * So the context is checked for everything the generators actually call.
 */
const REQUIRED_CONTEXT_METHODS = [
  'fillRect', 'beginPath', 'arc', 'fill', 'stroke', 'moveTo', 'lineTo',
  'createLinearGradient', 'getImageData', 'createImageData', 'putImageData',
] as const;

function surface(size: number): Surface | null {
  try {
    const element = document.createElement('canvas');
    element.width = size;
    element.height = size;
    const ctx = element.getContext('2d');
    if (!ctx) return null;
    for (const method of REQUIRED_CONTEXT_METHODS) {
      if (typeof (ctx as unknown as Record<string, unknown>)[method] !== 'function') return null;
    }
    return { ctx, element };
  } catch {
    return null;
  }
}

/** Deterministic noise, so a rebuild produces the same surface every time. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

/**
 * Derive a normal map from a greyscale height canvas.
 *
 * Central differences on the height field give the surface gradient, and the
 * normal is that gradient turned into a tangent-space vector. `strength` scales
 * how far a given height step tilts the normal, which is the difference between
 * a hairline seam and a deep channel.
 */
function normalFromHeight(height: HTMLCanvasElement, strength: number): THREE.CanvasTexture | null {
  const size = height.width;
  const source = height.getContext('2d');
  const target = surface(size);
  if (!source || !target) return null;

  const pixels = source.getImageData(0, 0, size, size).data;
  const out = target.ctx.createImageData(size, size);
  const at = (x: number, y: number) => {
    // Wrap, so a tiled texture has no seam at its own edge.
    const wx = (x + size) % size;
    const wy = (y + size) % size;
    return (pixels[(wy * size + wx) * 4] ?? 128) / 255;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const length = Math.hypot(dx, dy, 1);
      const index = (y * size + x) * 4;
      out.data[index] = ((-dx / length) * 0.5 + 0.5) * 255;
      out.data[index + 1] = ((-dy / length) * 0.5 + 0.5) * 255;
      out.data[index + 2] = (1 / length) * 255;
      out.data[index + 3] = 255;
    }
  }
  target.ctx.putImageData(out, 0, 0);
  return wrap(new THREE.CanvasTexture(target.element));
}

function wrap(texture: THREE.CanvasTexture): THREE.CanvasTexture {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

/**
 * Hull plating: panel seams, fastener rows and streaked wear.
 *
 * The workhorse for tank walls and structure. The panel grid is deliberately
 * irregular, because a perfectly even grid reads as wallpaper while varied
 * panel widths read as something assembled from stock plate.
 */
export function hullPlating(seed = 1, size = 512): MaterialMaps | null {
  const key = `hull:${seed}:${size}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const colour = surface(size);
  const height = surface(size);
  const rough = surface(size);
  if (!colour || !height || !rough) return null;

  const random = makeRandom(seed);

  colour.ctx.fillStyle = '#c8ced8';
  colour.ctx.fillRect(0, 0, size, size);
  height.ctx.fillStyle = '#808080';
  height.ctx.fillRect(0, 0, size, size);
  rough.ctx.fillStyle = '#6e6e6e';
  rough.ctx.fillRect(0, 0, size, size);

  // Mottling, so a large flat panel is not a dead area of colour.
  for (let i = 0; i < 1400; i++) {
    const shade = 196 + Math.floor(random() * 34);
    colour.ctx.fillStyle = `rgba(${shade},${shade + 4},${shade + 12},0.05)`;
    colour.ctx.beginPath();
    colour.ctx.arc(random() * size, random() * size, 6 + random() * 30, 0, Math.PI * 2);
    colour.ctx.fill();
  }

  const columns: number[] = [];
  for (let x = 0; x < size; x += Math.floor(size / 8 + random() * (size / 10))) {
    columns.push(x);
  }
  const rows: number[] = [];
  for (let y = 0; y < size; y += Math.floor(size / 6 + random() * (size / 8))) {
    rows.push(y);
  }

  const seam = (x0: number, y0: number, x1: number, y1: number) => {
    // A recessed joint: dark in colour, low in height, and rougher than the
    // plate because it collects dirt.
    colour.ctx.strokeStyle = 'rgba(96,106,124,0.85)';
    colour.ctx.lineWidth = 2.5;
    colour.ctx.beginPath();
    colour.ctx.moveTo(x0, y0);
    colour.ctx.lineTo(x1, y1);
    colour.ctx.stroke();

    height.ctx.strokeStyle = '#3a3a3a';
    height.ctx.lineWidth = 3;
    height.ctx.beginPath();
    height.ctx.moveTo(x0, y0);
    height.ctx.lineTo(x1, y1);
    height.ctx.stroke();

    rough.ctx.strokeStyle = '#a8a8a8';
    rough.ctx.lineWidth = 4;
    rough.ctx.beginPath();
    rough.ctx.moveTo(x0, y0);
    rough.ctx.lineTo(x1, y1);
    rough.ctx.stroke();
  };

  for (const x of columns) seam(x, 0, x, size);
  for (const y of rows) seam(0, y, size, y);

  // Fastener rows. These sell the scale of a panel: a viewer reads bolt
  // spacing as a real-world dimension.
  for (const y of rows) {
    for (let x = 14; x < size; x += 34) {
      colour.ctx.fillStyle = 'rgba(88,98,116,0.9)';
      colour.ctx.beginPath();
      colour.ctx.arc(x, y + 8, 2.1, 0, Math.PI * 2);
      colour.ctx.fill();
      height.ctx.fillStyle = '#bcbcbc';
      height.ctx.beginPath();
      height.ctx.arc(x, y + 8, 2.1, 0, Math.PI * 2);
      height.ctx.fill();
    }
  }

  // Vertical streaking below seams: the most recognisable sign that a surface
  // has spent time outdoors.
  for (let i = 0; i < 70; i++) {
    const x = random() * size;
    const y = rows[Math.floor(random() * rows.length)] ?? 0;
    const length = 30 + random() * 160;
    const width = 2 + random() * 5;

    const streak = colour.ctx.createLinearGradient(x, y, x, y + length);
    streak.addColorStop(0, 'rgba(120,126,138,0.34)');
    streak.addColorStop(1, 'rgba(120,126,138,0)');
    colour.ctx.fillStyle = streak;
    colour.ctx.fillRect(x, y, width, length);

    const dulled = rough.ctx.createLinearGradient(x, y, x, y + length);
    dulled.addColorStop(0, 'rgba(180,180,180,0.5)');
    dulled.addColorStop(1, 'rgba(180,180,180,0)');
    rough.ctx.fillStyle = dulled;
    rough.ctx.fillRect(x, y, width, length);
  }

  const normalMap = normalFromHeight(height.element, 2.6);
  if (!normalMap) return null;

  const maps: MaterialMaps = {
    map: wrap(new THREE.CanvasTexture(colour.element)),
    normalMap,
    roughnessMap: wrap(new THREE.CanvasTexture(rough.element)),
  };
  cache.set(key, maps);
  return maps;
}

/** Worn industrial floor: painted concrete, expansion joints and scuffs. */
export function bayFloor(size = 512): MaterialMaps | null {
  const key = `floor:${size}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const colour = surface(size);
  const height = surface(size);
  const rough = surface(size);
  if (!colour || !height || !rough) return null;

  const random = makeRandom(7);

  colour.ctx.fillStyle = '#5c6270';
  colour.ctx.fillRect(0, 0, size, size);
  height.ctx.fillStyle = '#888888';
  height.ctx.fillRect(0, 0, size, size);
  rough.ctx.fillStyle = '#c4c4c4';
  rough.ctx.fillRect(0, 0, size, size);

  // Aggregate speckle: concrete is never one colour.
  for (let i = 0; i < 9000; i++) {
    const shade = 70 + Math.floor(random() * 60);
    colour.ctx.fillStyle = `rgba(${shade},${shade + 5},${shade + 14},0.5)`;
    colour.ctx.fillRect(random() * size, random() * size, 1 + random() * 2.4, 1 + random() * 2.4);
  }

  const step = size / 4;
  for (let i = 0; i <= 4; i++) {
    const p = i * step;
    colour.ctx.strokeStyle = 'rgba(38,42,52,0.9)';
    colour.ctx.lineWidth = 4;
    colour.ctx.beginPath();
    colour.ctx.moveTo(p, 0);
    colour.ctx.lineTo(p, size);
    colour.ctx.moveTo(0, p);
    colour.ctx.lineTo(size, p);
    colour.ctx.stroke();

    height.ctx.strokeStyle = '#3c3c3c';
    height.ctx.lineWidth = 5;
    height.ctx.beginPath();
    height.ctx.moveTo(p, 0);
    height.ctx.lineTo(p, size);
    height.ctx.moveTo(0, p);
    height.ctx.lineTo(size, p);
    height.ctx.stroke();
  }

  // Scuffs from dragging heavy hardware around.
  for (let i = 0; i < 90; i++) {
    const x = random() * size;
    const y = random() * size;
    const length = 20 + random() * 120;
    const angle = random() * Math.PI * 2;
    const x1 = x + Math.cos(angle) * length;
    const y1 = y + Math.sin(angle) * length;

    colour.ctx.strokeStyle = `rgba(30,34,44,${0.05 + random() * 0.16})`;
    colour.ctx.lineWidth = 1 + random() * 7;
    colour.ctx.beginPath();
    colour.ctx.moveTo(x, y);
    colour.ctx.lineTo(x1, y1);
    colour.ctx.stroke();

    rough.ctx.strokeStyle = `rgba(90,90,90,${0.2 + random() * 0.3})`;
    rough.ctx.lineWidth = 2 + random() * 8;
    rough.ctx.beginPath();
    rough.ctx.moveTo(x, y);
    rough.ctx.lineTo(x1, y1);
    rough.ctx.stroke();
  }

  const normalMap = normalFromHeight(height.element, 1.5);
  if (!normalMap) return null;

  const maps: MaterialMaps = {
    map: wrap(new THREE.CanvasTexture(colour.element)),
    normalMap,
    roughnessMap: wrap(new THREE.CanvasTexture(rough.element)),
  };
  cache.set(key, maps);
  return maps;
}

/** Painted structural steel: primer coat, weld seams and chipped edges. */
export function paintedSteel(tint = '#3a4354', seed = 3, size = 512): MaterialMaps | null {
  const key = `steel:${tint}:${seed}:${size}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const colour = surface(size);
  const height = surface(size);
  const rough = surface(size);
  if (!colour || !height || !rough) return null;

  const random = makeRandom(seed);

  colour.ctx.fillStyle = tint;
  colour.ctx.fillRect(0, 0, size, size);
  height.ctx.fillStyle = '#808080';
  height.ctx.fillRect(0, 0, size, size);
  rough.ctx.fillStyle = '#9a9a9a';
  rough.ctx.fillRect(0, 0, size, size);

  // Uneven paint: brush density varies, and a flat coat reads as plastic.
  for (let i = 0; i < 900; i++) {
    colour.ctx.fillStyle = `rgba(255,255,255,${0.012 + random() * 0.03})`;
    colour.ctx.beginPath();
    colour.ctx.arc(random() * size, random() * size, 10 + random() * 60, 0, Math.PI * 2);
    colour.ctx.fill();
  }

  // Weld beads: a row of overlapping arcs, which is what a bead actually is.
  for (let i = 0; i < 3; i++) {
    const y = random() * size;
    for (let x = 0; x < size; x += 5) {
      const bulge = 2.6 + random() * 1.3;
      height.ctx.fillStyle = '#c2c2c2';
      height.ctx.beginPath();
      height.ctx.arc(x, y + Math.sin(x * 0.2) * 1.4, bulge, 0, Math.PI * 2);
      height.ctx.fill();
      colour.ctx.fillStyle = 'rgba(255,255,255,0.05)';
      colour.ctx.beginPath();
      colour.ctx.arc(x, y + Math.sin(x * 0.2) * 1.4, bulge, 0, Math.PI * 2);
      colour.ctx.fill();
    }
  }

  // Chipped paint showing bare metal underneath.
  for (let i = 0; i < 160; i++) {
    const x = random() * size;
    const y = random() * size;
    const r = 1 + random() * 4;
    colour.ctx.fillStyle = `rgba(168,174,186,${0.25 + random() * 0.45})`;
    colour.ctx.beginPath();
    colour.ctx.arc(x, y, r, 0, Math.PI * 2);
    colour.ctx.fill();
    // Bare metal is smoother than the paint around it.
    rough.ctx.fillStyle = 'rgba(70,70,70,0.6)';
    rough.ctx.beginPath();
    rough.ctx.arc(x, y, r, 0, Math.PI * 2);
    rough.ctx.fill();
  }

  const normalMap = normalFromHeight(height.element, 2);
  if (!normalMap) return null;

  const maps: MaterialMaps = {
    map: wrap(new THREE.CanvasTexture(colour.element)),
    normalMap,
    roughnessMap: wrap(new THREE.CanvasTexture(rough.element)),
  };
  cache.set(key, maps);
  return maps;
}

/** Set tiling density, in repeats across the surface. */
export function setRepeat(maps: MaterialMaps, x: number, y: number): void {
  for (const texture of [maps.map, maps.normalMap, maps.roughnessMap]) {
    texture.repeat.set(x, y);
    texture.needsUpdate = true;
  }
}

/** Drop the cache. Tests need this; the game builds each texture once. */
export function clearTextureCache(): void {
  cache.clear();
}
