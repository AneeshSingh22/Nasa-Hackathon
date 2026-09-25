import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { drawBlueprint, BLUEPRINT_SLOTS } from '../src/vab/blueprint';
import { PART_LIBRARY } from '../src/vab/parts';

/**
 * The blueprint screen rendered as a plain black rectangle for two rounds of
 * playtesting. The cause was not the drawing code — it was a bezel box whose
 * front face sat in front of the display plane — but the drawing had no test
 * at all, so there was no way to tell which half was at fault.
 *
 * jsdom has no canvas 2D implementation and the native `canvas` package does
 * not build here, so these tests record every drawing call against a stub
 * context. That is more precise than sampling pixels anyway: it can assert
 * *what* was drawn, not merely that something was.
 */

interface Call {
  op: string;
  args: unknown[];
}

let calls: Call[] = [];

/** A 2D context stand-in that records what the drawing code asks for. */
function makeStubContext(): CanvasRenderingContext2D {
  const record = (op: string) => (...args: unknown[]) => {
    calls.push({ op, args });
  };

  const stub: Record<string, unknown> = {
    fillRect: record('fillRect'),
    strokeRect: record('strokeRect'),
    fillText: record('fillText'),
    beginPath: record('beginPath'),
    closePath: record('closePath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    quadraticCurveTo: record('quadraticCurveTo'),
    arc: record('arc'),
    rect: record('rect'),
    fill: record('fill'),
    stroke: record('stroke'),
    save: record('save'),
    restore: record('restore'),
    translate: record('translate'),
    rotate: record('rotate'),
    setLineDash: record('setLineDash'),
    measureText: () => ({ width: 100 }),
  };
  // Style properties are assigned, not called, so they just need to exist.
  for (const prop of [
    'fillStyle',
    'strokeStyle',
    'lineWidth',
    'font',
    'textAlign',
  ]) {
    stub[prop] = '';
  }
  return stub as unknown as CanvasRenderingContext2D;
}

beforeEach(() => {
  calls = [];
  // drawBlueprint creates its own canvas, so intercept getContext.
  const original = document.createElement.bind(document);
  // @ts-expect-error - deliberately narrowing for the test
  document.createElement = (tag: string) => {
    const element = original(tag);
    if (tag === 'canvas') {
      // @ts-expect-error - stubbing a DOM method
      element.getContext = () => makeStubContext();
    }
    return element;
  };
});

afterEach(() => {
  // @ts-expect-error - restoring the real implementation
  delete document.createElement;
});

/** All text drawn, joined for easy searching. */
const drawnText = (): string =>
  calls
    .filter((c) => c.op === 'fillText')
    .map((c) => String(c.args[0]))
    .join(' | ');

describe('blueprint drawing', () => {
  it('draws something substantial rather than a blank panel', () => {
    drawBlueprint({ fitted: new Map(), nextKind: 'booster' });
    // A blank screen would be a single fillRect and nothing else.
    expect(calls.length).toBeGreaterThan(100);
    expect(calls.filter((c) => c.op === 'stroke').length).toBeGreaterThan(20);
    expect(calls.filter((c) => c.op === 'fillText').length).toBeGreaterThan(10);
  });

  it('labels every build step', () => {
    drawBlueprint({ fitted: new Map(), nextKind: 'booster' });
    const text = drawnText();
    for (const slot of BLUEPRINT_SLOTS) {
      expect(text, slot.heading).toContain(slot.heading.toUpperCase());
    }
  });

  it('tells the player how many options each open step has', () => {
    drawBlueprint({ fitted: new Map(), nextKind: 'booster' });
    const text = drawnText();
    // Three first stages and two upper stages are available.
    expect(text).toContain('3 options');
    expect(text).toContain('2 options');
  });

  it('marks the next step so the player knows where to go', () => {
    drawBlueprint({ fitted: new Map(), nextKind: 'booster' });
    expect(drawnText()).toContain('FIT THIS NEXT');
  });

  it('names the fitted part instead of its option count', () => {
    const booster = PART_LIBRARY.find((p) => p.kind === 'booster');
    expect(booster).toBeDefined();
    if (!booster) return;

    drawBlueprint({
      fitted: new Map([['booster', booster]]),
      nextKind: 'upper',
    });

    const text = drawnText();
    expect(text).toContain(booster.name);
    expect(text).toContain('1 OF 4 SECTIONS FITTED');
  });

  it('reports the running stack mass once parts are on', () => {
    const booster = PART_LIBRARY.find((p) => p.kind === 'booster');
    if (!booster) return;
    drawBlueprint({
      fitted: new Map([['booster', booster]]),
      nextKind: 'upper',
    });
    expect(drawnText()).toContain('STACK MASS');
  });

  it('shows all four fitted when the vehicle is complete', () => {
    const fitted = new Map(
      (['booster', 'upper', 'payload', 'fairing'] as const).map((kind) => {
        const part = PART_LIBRARY.find((p) => p.kind === kind);
        if (!part) throw new Error(`no part for ${kind}`);
        return [kind, part] as const;
      }),
    );
    drawBlueprint({ fitted, nextKind: null });

    const text = drawnText();
    expect(text).toContain('4 OF 4 SECTIONS FITTED');
    expect(text).not.toContain('FIT THIS NEXT');
  });

  it('draws the sections as a connected stack', () => {
    drawBlueprint({ fitted: new Map(), nextKind: 'booster' });
    // Each section is a rect or a path; the fairing uses quadratic curves for
    // its ogive nose, so that call proves the nose is drawn.
    expect(calls.some((c) => c.op === 'quadraticCurveTo')).toBe(true);
    expect(calls.filter((c) => c.op === 'rect').length).toBeGreaterThan(3);
  });

  it('carries a legend so the colours are readable', () => {
    drawBlueprint({ fitted: new Map(), nextKind: 'booster' });
    const text = drawnText();
    expect(text).toContain('Fitted');
    expect(text).toContain('Next');
    expect(text).toContain('Open');
  });

  it('sections sum to the full drawing height', () => {
    const total = BLUEPRINT_SLOTS.reduce((s, x) => s + x.heightShare, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it('covers the four kinds in build order', () => {
    expect(BLUEPRINT_SLOTS.map((s) => s.kind)).toEqual([
      'booster',
      'upper',
      'payload',
      'fairing',
    ]);
  });
});
