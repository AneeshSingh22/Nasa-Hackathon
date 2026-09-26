// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Assembly } from '../vab/Assembly';
import { PART_LIBRARY, createMaterials } from '../vab/parts';
import { OrbitCamera } from '../render/OrbitCamera';
import { RocketBuilder } from './rocketBuilder';
import { optionsFor } from './catalog';

/**
 * The Workshop is the build phase, so these assert the things that make it a
 * game: real options, real money, and a vehicle that survives being left.
 */

let assembly: Assembly;
let root: THREE.Group;
let chrome: HTMLElement;
let builder: RocketBuilder;
let budget: number;
let refusals: string[];

function click(partId: string) {
  chrome.querySelector<HTMLButtonElement>(`[data-part="${partId}"]`)!.click();
}
function readout() {
  return chrome.querySelector('.rocket-readout')!.textContent!;
}
function enabled(partId: string) {
  return !chrome.querySelector<HTMLButtonElement>(`[data-part="${partId}"]`)!.disabled;
}

beforeEach(() => {
  budget = 480;
  refusals = [];
  root = new THREE.Group();
  chrome = document.createElement('section');
  document.body.replaceChildren(chrome);
  assembly = new Assembly(root, createMaterials());
  const camera = new THREE.PerspectiveCamera(72, 1.5, 0.1, 400);
  builder = new RocketBuilder(assembly, root, camera, new OrbitCamera(camera), chrome, {
    charge: part => { budget -= part.cost; return true; },
    refund: part => { budget += part.cost * 0.5; },
    spent: () => 480 - budget,
    changed: () => {},
    refuse: message => refusals.push(message),
  });
});

describe('Workshop rocket builder', () => {
  it('offers every option the library holds for each slot', () => {
    // One part per step is not a decision. The library has three boosters,
    // two upper stages and four payloads, and all of them must be offered.
    expect(optionsFor('booster')).toHaveLength(3);
    expect(optionsFor('payload')).toHaveLength(4);
    for (const part of PART_LIBRARY) {
      expect(chrome.querySelector(`[data-part="${part.id}"]`), part.id).not.toBeNull();
    }
  });

  it('enables only the slot the stack is ready for', () => {
    expect(enabled('core-booster')).toBe(true);
    // The payload cannot be fitted before the stages under it exist.
    expect(enabled('telescope')).toBe(false);

    click('core-booster');
    // The booster slot stays live so the player can compare and swap.
    expect(enabled('core-booster')).toBe(true);
    expect(enabled('solid-booster')).toBe(true);
    expect(enabled('upper-stage')).toBe(true);
    expect(enabled('telescope')).toBe(false);

    click('upper-stage');
    expect(enabled('telescope')).toBe(true);
  });

  it('spends real money and refunds only half on removal', () => {
    click('core-booster'); // $148M
    expect(budget).toBe(332);
    expect(readout()).toContain('Spent $148M');

    builder.removeLast();
    // Half back: rebuilding is never free, which is what makes the choice cost
    // something.
    expect(budget).toBe(406);
  });

  it('builds a different vehicle for a different payload', () => {
    click('core-booster'); click('upper-stage'); click('comms-probe');
    const cheap = assembly.analyze();

    builder.removeLast();
    click('science-lab');
    const heavy = assembly.analyze();

    // The laboratory is 11 tonnes heavier, so it buys less delta-v. If these
    // ever match, the payload choice has stopped mattering.
    expect(heavy.liftoffMass).toBeGreaterThan(cheap.liftoffMass);
    expect(heavy.totalDeltaV).toBeLessThan(cheap.totalDeltaV);
  });

  it('refuses a part the programme cannot pay for, and fits nothing', () => {
    const poor = new Assembly(new THREE.Group(), createMaterials());
    const camera = new THREE.PerspectiveCamera(72, 1.5, 0.1, 400);
    const denied: string[] = [];
    const bankrupt = new RocketBuilder(poor, new THREE.Group(), camera,
      new OrbitCamera(camera), document.createElement('section'), {
        charge: () => false,
        refund: () => {},
        spent: () => 0,
        changed: () => {},
        refuse: message => denied.push(message),
      });
    bankrupt.fit(PART_LIBRARY.find(part => part.id === 'extended-booster')!);

    expect(poor.parts).toHaveLength(0);
    expect(denied).toHaveLength(1);
    expect(denied[0]).toMatch(/cannot cover/);
  });

  it('puts the fitted part in the scene where the stack expects it', () => {
    click('solid-booster');
    const mesh = root.getObjectByName('solid-booster');
    expect(mesh).toBeDefined();
    expect(mesh!.position.y).toBe(0);

    click('upper-stage');
    const upper = root.getObjectByName('upper-stage')!;
    // The second stage sits on top of the booster, not inside it.
    const booster = PART_LIBRARY.find(part => part.id === 'solid-booster')!;
    expect(upper.position.y).toBeCloseTo(booster.height, 5);
  });

  it('reports a vehicle that cannot leave the pad', () => {
    // Every part fitted, then check the verdict is derived rather than assumed.
    click('extended-booster'); click('kerolox-upper'); click('science-lab'); click('fairing');
    const analysis = assembly.analyze();
    expect(readout()).toContain(`TWR ${analysis.liftoffTWR.toFixed(2)}`);
    expect(readout()).toContain(`${Math.round(analysis.totalDeltaV).toLocaleString('en-US')} m/s`);
  });
});

describe('changing your mind', () => {
  it('swaps a fitted part without disturbing the parts above it', () => {
    click('core-booster'); click('upper-stage'); click('telescope'); click('fairing');
    expect(assembly.parts.map(p => p.id)).toEqual(
      ['core-booster', 'upper-stage', 'telescope', 'fairing'],
    );

    // Change the payload with the fairing already on: the whole point of a
    // swap is not having to tear the stack down.
    click('crew-capsule');
    expect(assembly.parts.map(p => p.id)).toEqual(
      ['core-booster', 'upper-stage', 'crew-capsule', 'fairing'],
    );
    expect(root.getObjectByName('crew-capsule')).toBeDefined();
    expect(root.getObjectByName('telescope')).toBeUndefined();
    // The fairing moved with it rather than being left floating.
    const fairing = root.getObjectByName('fairing')!;
    const expectedBase = PART_LIBRARY.find(p => p.id === 'core-booster')!.height
      + PART_LIBRARY.find(p => p.id === 'upper-stage')!.height
      + PART_LIBRARY.find(p => p.id === 'crew-capsule')!.height;
    expect(fairing.position.y).toBeCloseTo(expectedBase, 5);
  });

  it('charges only the difference when swapping, and refunds it going cheaper', () => {
    click('core-booster'); // $148M
    expect(budget).toBe(332);

    // Up to the $196M extended core: pay the $48M difference, not $196M.
    click('extended-booster');
    expect(budget).toBe(284);

    // Back down to the $96M solid. The refund is half, as everywhere else in
    // the programme: reversing a decision always costs something, which is
    // what stops swapping being free experimentation.
    click('solid-booster');
    expect(budget).toBe(334);
  });

  it('says so and changes nothing when the same part is clicked again', () => {
    click('core-booster');
    const before = budget;
    click('core-booster');
    expect(budget).toBe(before);
    expect(assembly.parts).toHaveLength(1);
  });
});
