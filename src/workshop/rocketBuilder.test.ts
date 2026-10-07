// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Assembly } from '../vab/Assembly';
import { PART_LIBRARY, createMaterials, DISPLAY_SCALE } from '../vab/parts';
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
/** Let any falling parts land, as a few frames of play would. */
function settle(target: RocketBuilder = builder) {
  target.tick(performance.now() + 10_000);
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
    launch: () => {},
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
        launch: () => {},
      });
    bankrupt.fit(PART_LIBRARY.find(part => part.id === 'extended-booster')!);

    expect(poor.parts).toHaveLength(0);
    expect(denied).toHaveLength(1);
    expect(denied[0]).toMatch(/cannot cover/);
  });

  it('puts the fitted part in the scene where the stack expects it', () => {
    click('solid-booster');
    settle();
    const mesh = root.getObjectByName('solid-booster');
    expect(mesh).toBeDefined();
    expect(mesh!.position.y).toBe(0);

    click('upper-stage');
    settle();
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
    settle();
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

describe('reaching the launch', () => {
  it('offers a launch button that is disabled until the vehicle is complete', () => {
    // The flight phase was unreachable for a whole session: the only route to
    // it was a roll-out screen behind a key the Workshop disables. A build
    // phase with no way out is not a game, and nothing failed to say so.
    const button = () => chrome.querySelector<HTMLButtonElement>('.palette-launch')!;
    expect(button()).not.toBeNull();
    expect(button().disabled).toBe(true);
    // And it says what is missing rather than sitting there inert.
    expect(button().textContent).toMatch(/booster/i);

    click('core-booster');
    expect(button().disabled).toBe(true);
    click('upper-stage');
    click('telescope');
    expect(button().disabled).toBe(true);
    click('fairing');

    expect(button().disabled).toBe(false);
    expect(button().textContent).toMatch(/launch/i);
  });

  it('calls the launch hook when the finished vehicle is sent to the pad', () => {
    let launched = 0;
    const camera = new THREE.PerspectiveCamera(72, 1.5, 0.1, 400);
    const chrome2 = document.createElement('section');
    document.body.append(chrome2);
    const root2 = new THREE.Group();
    const assembly2 = new Assembly(root2, createMaterials());
    const builder2 = new RocketBuilder(assembly2, root2, camera,
      new OrbitCamera(camera), chrome2, {
        charge: () => true, refund: () => {}, spent: () => 0,
        changed: () => {}, refuse: () => {},
        launch: () => { launched++; },
      });
    for (const id of ['core-booster', 'upper-stage', 'telescope', 'fairing']) {
      builder2.fit(PART_LIBRARY.find(p => p.id === id)!);
    }
    chrome2.querySelector<HTMLButtonElement>('.palette-launch')!.click();
    expect(launched).toBe(1);
  });
});

describe('framing', () => {
  it('keeps the camera inside the building for every stack it can build', () => {
    // The camera once had to back out through the wall to frame a full-size
    // rocket, and the bay read as a doll's house around it. The vehicle is a
    // scale mockup now, so every stack must be viewable from indoors.
    const VAB_HALF_DEPTH = 23;
    const camera = new THREE.PerspectiveCamera(72, 1.9, 0.1, 400);
    const orbit = new OrbitCamera(camera);
    const chrome2 = document.createElement('section');
    const root2 = new THREE.Group();
    root2.scale.setScalar(DISPLAY_SCALE);
    const assembly2 = new Assembly(root2, createMaterials());
    const builder2 = new RocketBuilder(assembly2, root2, camera, orbit, chrome2, {
      charge: () => true, refund: () => {}, spent: () => 0,
      changed: () => {}, refuse: () => {},
      launch: () => {},
    });

    // The tallest vehicle in the library.
    for (const id of ['extended-booster', 'upper-stage', 'science-lab', 'fairing']) {
      builder2.fit(PART_LIBRARY.find(part => part.id === id)!);
    }
    settle(builder2);
    const box = new THREE.Box3().setFromObject(root2);
    const size = box.getSize(new THREE.Vector3());
    // A mockup, not a 67 m rocket.
    expect(size.y).toBeLessThan(30);

    orbit.update();
    expect(Math.abs(camera.position.z)).toBeLessThan(VAB_HALF_DEPTH);
    expect(Math.abs(camera.position.x)).toBeLessThan(VAB_HALF_DEPTH);
    // And the whole vehicle is actually in shot.
    for (const corner of [box.min, box.max]) {
      const projected = corner.clone().project(camera);
      expect(Math.abs(projected.y)).toBeLessThan(1);
    }
  });
});

describe('feel and feedback', () => {
  function rig(start: number) {
    let money = start;
    const camera = new THREE.PerspectiveCamera(72, 1.5, 0.1, 400);
    const shell = document.createElement('section');
    document.body.append(shell);
    const stackRoot = new THREE.Group();
    const stack = new Assembly(stackRoot, createMaterials());
    const built = new RocketBuilder(stack, stackRoot, camera, new OrbitCamera(camera), shell, {
      charge: part => { money -= part.cost; return true; },
      refund: part => { money += part.cost * 0.5; },
      spent: () => start - money,
      changed: () => {},
      refuse: () => {},
      launch: () => {},
      available: () => money,
      par: () => 240,
    });
    return { built, stack, stackRoot, shell, money: () => money };
  }

  it('refuses a part the budget cannot cover instead of going bankrupt', () => {
    // The charge used to always succeed and drive the budget negative, which
    // failed the whole mission rather than simply saying no.
    const { built, stack, shell, money } = rig(100);
    built.fit(PART_LIBRARY.find(p => p.id === 'core-booster')!); // $148M
    expect(stack.parts).toHaveLength(0);
    expect(money()).toBe(100);
    expect(shell.querySelector('.rocket-palette')!.classList.contains('shake')).toBe(true);
  });

  it('drops a fitted part from above and lands it exactly on its seat', () => {
    const { built, stackRoot } = rig(480);
    built.fit(PART_LIBRARY.find(p => p.id === 'core-booster')!);
    const mesh = stackRoot.getObjectByName('core-booster')!;
    const start = performance.now();
    expect(mesh.position.y).toBeGreaterThan(10);
    built.tick(start + 200);
    const midway = mesh.position.y;
    expect(midway).toBeGreaterThan(0);
    built.tick(start + 10_000);
    expect(mesh.position.y).toBe(0);
  });

  it('floats the cost off the readout', () => {
    const { built, shell } = rig(480);
    built.fit(PART_LIBRARY.find(p => p.id === 'solid-booster')!);
    const float = shell.querySelector('.cost-float.spend');
    expect(float?.textContent).toMatch(/96/);
  });

  it('shows Mission Control\u2019s call and the par as the stack is built', () => {
    const { built, shell } = rig(300);
    const verdict = () => shell.querySelector<HTMLElement>('.mission-verdict')!;
    expect(verdict().dataset.verdict).toBe('incomplete');
    for (const id of ['solid-booster', 'kerolox-upper', 'comms-probe', 'fairing']) {
      built.fit(PART_LIBRARY.find(p => p.id === id)!);
    }
    // 10 385 m/s on the cheapest relay build: comfortably GO.
    expect(verdict().dataset.verdict).toBe('go');
    expect(verdict().textContent).toMatch(/Par \$240M · spent \$236M/);
  });
});
