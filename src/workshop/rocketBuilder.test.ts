// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { Assembly } from '../vab/Assembly';
import { createMaterials, DISPLAY_SCALE } from '../vab/parts';
import { OrbitCamera } from '../render/OrbitCamera';
import { RocketBuilder } from './rocketBuilder';
import { MODULAR_PARTS } from './modularParts';
import { BUILD_ANCHOR_Y, ATTACHMENT_RADIUS } from './attachments';
import { vehicleFromParts } from '../flight/vehicle';
import { totalDeltaV } from '../physics/rocket';

let assembly: Assembly, root: THREE.Group, chrome: HTMLElement, canvas: HTMLElement, builder: RocketBuilder;
let camera: THREE.PerspectiveCamera, budget: number;
const part = (id: string) => MODULAR_PARTS.find(p => p.id === id)!;
const build = (...ids: string[]) => ids.forEach(id => builder.fit(part(id)));
function pointer(target: EventTarget, type: string, x: number, y: number, id = 1) {
  const e = new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true });
  Object.defineProperty(e, 'pointerId', { value: id }); target.dispatchEvent(e);
}
function node(port: string) {
  const b = chrome.querySelector<HTMLButtonElement>(`[data-port="${port}"]`)!;
  return { x: parseFloat(b.style.left), y: parseFloat(b.style.top), b };
}
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  budget = 480; root = new THREE.Group(); root.scale.setScalar(DISPLAY_SCALE);
  chrome = document.createElement('section'); canvas = document.createElement('canvas');
  document.body.replaceChildren(canvas, chrome); assembly = new Assembly(root, createMaterials());
  camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, .1, 400);
  builder = new RocketBuilder(assembly, root, camera, new OrbitCamera(camera), chrome, {
    charge: p => { budget -= p.cost; return true; }, refund: p => { budget += p.cost; },
    spent: () => 480 - budget, changed: () => {}, refuse: () => {}, launch: () => {}, available: () => budget, par: () => 240, starterGuide: () => true,
  }, canvas);
});
afterEach(() => { builder.dispose(); vi.restoreAllMocks(); });
describe('Workshop palette and transactions', () => {
  it('shows image-only category tiles and reveals price, mass and details on hover/focus', () => {
    chrome.querySelector<HTMLButtonElement>('[data-category="command"]')!.click();
    const tile = chrome.querySelector<HTMLElement>('[data-part="command-pod"]')!;
    expect(tile.textContent).toBe(''); expect(tile.querySelector('svg, img')).not.toBeNull();
    tile.dispatchEvent(new Event('pointerenter'));
    const tooltip = chrome.querySelector<HTMLElement>('[role="tooltip"]')!;
    expect(tooltip.hidden).toBe(false); expect(tooltip.textContent).toContain('$8M'); expect(tooltip.textContent).toContain('1.6 t');
    tile.dispatchEvent(new Event('pointerleave')); expect(tooltip.hidden).toBe(true);
    tile.focus(); expect(tooltip.hidden).toBe(false);
    chrome.querySelector<HTMLButtonElement>('[data-category="propulsion"]')!.click();
    expect(tile.hidden).toBe(true); expect(chrome.querySelector<HTMLElement>('[data-part="core-tank"]')!.hidden).toBe(false);
    expect(chrome.querySelectorAll('[data-kind="tank"]')).toHaveLength(5);
    expect(chrome.querySelectorAll('[data-kind="engine"]')).toHaveLength(5);
  });
  it('picks on keyboard activation without buying, then commits at the chosen node', () => {
    chrome.querySelector<HTMLButtonElement>('[data-part="probe-core"]')!.click();
    expect(builder.isDragging).toBe(true); expect(assembly.parts).toHaveLength(0); expect(budget).toBe(480);
    node('root').b.click(); expect(assembly.parts[0]!.id).toBe('probe-core'); expect(budget).toBe(476);
  });
  it('charges once on pointer release onto a compatible world node', () => {
    const tile = chrome.querySelector<HTMLElement>('[data-part="probe-core"]')!;
    pointer(tile, 'pointerdown', 20, 20); const target = node('root');
    pointer(window, 'pointermove', target.x, target.y); expect(target.b.dataset.compatible).toBe('true');
    pointer(window, 'pointerup', target.x, target.y);
    expect(budget).toBe(476); expect(assembly.parts).toHaveLength(1); expect(builder.isDragging).toBe(false);
    pointer(window, 'pointerup', target.x, target.y); expect(budget).toBe(476);
  });
  it.each(['compact-tank', 'swift-engine', 'comms-probe', 'fairing', 'probe-core'])('seeds an empty bay with %s without hitting the origin sphere', id => {
    const target = node('root'); const x = target.x + 120, y = target.y + 80;
    pointer(chrome.querySelector(`[data-part="${id}"]`)!, 'pointerdown', 20, 20);
    pointer(window, 'pointermove', x, y); pointer(window, 'pointerup', x, y);
    expect(assembly.parts.map(p => p.id)).toEqual([id]);
    expect(budget).toBe(480 - part(id).cost);
    expect(assembly.meshObjects[0]!.position.y).toBe(BUILD_ANCHOR_Y);
  });
  it('still requires an attachment node after the first part', () => {
    build('swift-engine'); const target = node('upper');
    pointer(chrome.querySelector('[data-part="compact-tank"]')!, 'pointerdown', 20, 20);
    pointer(window, 'pointerup', target.x + 120, target.y + 80);
    expect(assembly.parts).toHaveLength(1); expect(budget).toBe(424);
  });
  it('keeps the starter guide collapsed and shows a derived, affordable recipe on demand', () => {
    const guide = chrome.querySelector<HTMLDetailsElement>('.workshop-build-guide')!;
    expect(guide.open).toBe(false);
    expect(guide.querySelector('summary')!.textContent).toBe('Build guide');
    const names = [...guide.querySelectorAll('li')].map(el => el.textContent);
    expect(names[0]).toBe('Swift booster engine');
    expect(names[1]).toBe('Compact fuel tank');
    expect(names.at(-1)).toBe('Payload Fairing');
    expect(guide.textContent).toContain('$240M');
  });
  it('marks incompatible nodes red and rejects release without spending', () => {
    build('probe-core');
    pointer(chrome.querySelector('[data-part="command-pod"]')!, 'pointerdown', 20, 20);
    const target = node('lower'); pointer(window, 'pointermove', target.x, target.y);
    expect(target.b.dataset.compatible).toBe('false');
    const sphere = root.getObjectByName('attachment-lower') as THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
    expect(sphere.material.color.getHex()).toBe(0xf26356);
    pointer(window, 'pointerup', target.x, target.y); expect(budget).toBe(476); expect(assembly.parts).toHaveLength(1);
  });
  it('does not snap to a node covered by UI even if it projects at the cursor', () => {
    const target = node('root');
    const panel = document.createElement('aside'); panel.className = 'workshop-specs';
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => panel });
    pointer(chrome.querySelector('[data-part="probe-core"]')!, 'pointerdown', 10, 10);
    pointer(window, 'pointerup', target.x, target.y);
    expect(assembly.parts).toHaveLength(0); expect(budget).toBe(480);
    delete (document as Partial<Document>).elementFromPoint;
  });
  it('cancels a return drag by restoring installed geometry and money', () => {
    build('probe-core'); const mesh = assembly.meshObjects[0]!;
    const world = root.localToWorld(mesh.position.clone().add(new THREE.Vector3(0, 1, 0))).project(camera);
    pointer(canvas, 'pointerdown', (world.x + 1) * innerWidth / 2, (1 - world.y) * innerHeight / 2);
    pointer(window, 'pointermove', (world.x + 1) * innerWidth / 2 + 10, (1 - world.y) * innerHeight / 2);
    expect(mesh.visible).toBe(false); window.dispatchEvent(new Event('pointercancel'));
    expect(mesh.visible).toBe(true); expect(assembly.parts).toHaveLength(1); expect(budget).toBe(476);
  });
  it('invalid drops, blur, cancellation and leaving never purchase a preview', () => {
    builder.pick(part('probe-core')); expect(builder.cancelDrag()).toBe(true); expect(builder.cancelDrag()).toBe(false);
    pointer(chrome.querySelector('[data-part="probe-core"]')!, 'pointerdown', 10, 10);
    pointer(window, 'pointerup', -100, -100); expect(assembly.parts).toHaveLength(0);
    builder.pick(part('probe-core')); window.dispatchEvent(new Event('blur')); expect(builder.isDragging).toBe(false);
    builder.pick(part('probe-core')); builder.dispose(); expect(root.getObjectByName('workshop-preview')).toBeUndefined(); expect(budget).toBe(480);
  });
  it('rejects unaffordable parts and the planned decoupler', () => {
    budget = 2; build('command-pod'); expect(assembly.parts).toHaveLength(0); expect(budget).toBe(2);
    expect(chrome.querySelector('.rocket-palette')!.classList.contains('shake')).toBe(true);
    builder.pick(part('stack-decoupler')); expect(builder.isDragging).toBe(false);
  });
  it('refunds a whole dependent subtree and leaves independent payloads in place', () => {
    build('probe-core', 'kerolox-tank', 'kerolox-engine', 'compact-tank', 'swift-engine', 'comms-probe', 'fairing');
    expect(budget).toBe(240);
    const upper = assembly.parts.find(p => p.id === 'kerolox-tank')!;
    builder.returnPart(upper.instanceId!);
    expect(budget).toBe(400); expect(assembly.parts.map(p => p.id)).toEqual(['fairing', 'comms-probe', 'probe-core']);
    builder.returnPart(assembly.parts.find(p => p.kind === 'command')!.instanceId!); expect(budget).toBe(480); expect(assembly.parts).toHaveLength(0);
  });
  it('returns a part by raycasting the installed mesh and dragging to the tray', () => {
    build('probe-core'); const mesh = assembly.meshObjects[0]!;
    const world = root.localToWorld(mesh.position.clone().add(new THREE.Vector3(0, 1, 0))).project(camera);
    const x = (world.x + 1) * innerWidth / 2, y = (1 - world.y) * innerHeight / 2;
    vi.spyOn(builder.palette.returnTray, 'getBoundingClientRect').mockReturnValue({ left: 10, right: 200, top: 600, bottom: 700, width: 190, height: 100 } as DOMRect);
    pointer(canvas, 'pointerdown', x, y); expect(builder.isDragging).toBe(true);
    pointer(window, 'pointermove', x + 10, y); expect(mesh.visible).toBe(false);
    pointer(window, 'pointermove', 100, 650); pointer(window, 'pointerup', 100, 650);
    expect(assembly.parts).toHaveLength(0); expect(budget).toBe(480);
  });
});
describe('modular craft', () => {
  it('supports repeat tanks with unique identities, all seated immediately without falling', () => {
    build('command-pod', 'kerolox-tank', 'kerolox-tank', 'kerolox-engine');
    const tanks = assembly.parts.filter(p => p.kind === 'tank'); expect(tanks).toHaveLength(2);
    expect(tanks[0]!.instanceId).not.toBe(tanks[1]!.instanceId);
    expect(assembly.meshFor(tanks[0]!.instanceId!)!.position.y).toBe(BUILD_ANCHOR_Y - 8);
    const before = assembly.meshObjects.map(m => m.position.y); builder.tick(); expect(assembly.meshObjects.map(m => m.position.y)).toEqual(before);
    expect(root.localToWorld(new THREE.Vector3(0, BUILD_ANCHOR_Y, 0)).y).toBeGreaterThan(15);
  });
  it('does not count unfed tanks as propulsion', () => {
    build('probe-core', 'compact-tank'); const analysis = assembly.analyze();
    expect(analysis.totalDeltaV).toBe(0); expect(analysis.liftoffTWR).toBe(0); expect(analysis.stageCount).toBe(0);
    expect(vehicleFromParts(assembly.parts)).toBeNull();
  });
  it('derives the readout and launched vehicle from the same tank and engine stages', () => {
    build('probe-core', 'kerolox-tank', 'kerolox-engine', 'compact-tank', 'swift-engine', 'comms-probe', 'fairing');
    const vehicle = vehicleFromParts(assembly.parts)!;
    expect(vehicle.stages).toHaveLength(2); expect(vehicle.stages[0]!.thrustSeaLevel).toBe(6800000);
    expect(vehicle.stages[0]!.propellantMass).toBe(240000);
    expect(assembly.analyze().totalDeltaV).toBeCloseTo(totalDeltaV(vehicle), 8);
    expect(chrome.querySelector<HTMLElement>('.mission-verdict')!.dataset.verdict).toBe('go');
    expect(chrome.querySelector('.mission-verdict')!.textContent).toContain('Par $240M');
    for (const mesh of assembly.meshObjects) {
      const box = new THREE.Box3().setFromObject(mesh);
      for (const v of [box.min, box.max]) expect(Math.abs(v.clone().project(camera).y)).toBeLessThan(1);
    }
    const paid = budget; builder.dispose(); expect(assembly.parts).toHaveLength(7); expect(budget).toBe(paid);
  });
  it('preserves paid parts across reopening and does not duplicate pointer handlers', () => {
    build('probe-core'); builder.dispose();
    builder = new RocketBuilder(assembly, root, camera, new OrbitCamera(camera), chrome, {
      charge: p => { budget -= p.cost; return true; }, refund: p => { budget += p.cost; }, spent: () => 480 - budget,
      changed: () => {}, refuse: () => {}, launch: () => {},
    }, canvas);
    const target = node('lower'); pointer(chrome.querySelector('[data-part="kerolox-tank"]')!, 'pointerdown', 20, 20);
    pointer(window, 'pointerup', target.x, target.y); expect(budget).toBe(436); expect(assembly.parts).toHaveLength(2);
  });
});


describe('flexible build and inspection', () => {
  it('builds the same flight vehicle from the engine up or the command down', () => {
    build('probe-core', 'kerolox-tank', 'kerolox-engine', 'compact-tank', 'swift-engine', 'comms-probe', 'fairing');
    const original = vehicleFromParts(assembly.parts)!;
    assembly.clear(); builder.refresh();
    for (const id of ['swift-engine', 'compact-tank', 'kerolox-engine', 'kerolox-tank', 'probe-core', 'comms-probe', 'fairing']) builder.fit(part(id), assembly.parts.length ? 'upper' : 'root');
    const reversed = vehicleFromParts(assembly.parts)!;
    expect(assembly.parts.map(p => p.id)).toEqual(['fairing', 'comms-probe', 'probe-core', 'kerolox-tank', 'kerolox-engine', 'compact-tank', 'swift-engine']);
    expect(reversed.stages.map(s => s.name)).toEqual(original.stages.map(s => s.name));
    expect(totalDeltaV(reversed)).toBeCloseTo(totalDeltaV(original), 8);
    const bounds = new THREE.Box3(); for (const mesh of assembly.meshObjects) bounds.expandByObject(mesh);
    expect(bounds.min.y).toBeGreaterThan(1); expect(bounds.max.y).toBeLessThan(30);
  });
  it('starts with payload or fairing and adds control later', () => {
    build('fairing', 'comms-probe', 'probe-core', 'kerolox-tank', 'kerolox-engine');
    expect(assembly.isComplete()).toBe(true); expect(assembly.parts.map(p => p.kind)).toEqual(['fairing', 'payload', 'command', 'tank', 'engine']);
  });
  it('does not treat an unfed engine or a craft without control as launchable', () => {
    build('swift-engine'); expect(assembly.analyze().stageCount).toBe(0); expect(assembly.isComplete()).toBe(false);
    expect(vehicleFromParts(assembly.parts)).toBeNull(); expect(chrome.querySelector('.mission-verdict')!.textContent).toContain('Control');
  });
  it('clicks a fitted part without lifting it, then sells only that object at its full price', () => {
    build('probe-core', 'compact-tank'); const control = assembly.parts.find(p => p.kind === 'command')!;
    const mesh = assembly.meshFor(control.instanceId!)!;
    const world = root.localToWorld(mesh.position.clone().add(new THREE.Vector3(0, 1, 0))).project(camera);
    const x = (world.x + 1) * innerWidth / 2, y = (1 - world.y) * innerHeight / 2;
    pointer(canvas, 'pointerdown', x, y); pointer(window, 'pointerup', x, y);
    expect(mesh.visible).toBe(true); expect(builder.isDragging).toBe(false);
    const info = chrome.querySelector<HTMLElement>('.installed-part-info')!;
    expect(info.hidden).toBe(false); expect(info.textContent).toContain('Unmanned control unit');
    expect(info.textContent).toContain('0.3 t'); expect(info.textContent).toContain('Sell · $4M');
    info.querySelector<HTMLButtonElement>('.sell-part')!.click();
    expect(budget).toBe(440); expect(assembly.parts.map(p => p.id)).toEqual(['compact-tank']);
    expect(assembly.meshObjects[0]!.visible).toBe(true); expect(info.hidden).toBe(true); expect(assembly.isComplete()).toBe(false);
  });
  it('sells the seed without orphaning the remaining parts or refunding them', () => {
    build('swift-engine'); builder.fit(part('compact-tank'), 'upper'); builder.fit(part('probe-core'), 'upper');
    const seed = assembly.parts.find(p => p.kind === 'engine')!; builder.sellPart(seed.instanceId!);
    expect(budget).toBe(436); expect(assembly.parts).toHaveLength(2);
    expect(assembly.parts.filter(p => !p.parentId)).toHaveLength(1);
    for (const p of assembly.parts) if (p.parentId) expect(assembly.parts.some(other => other.instanceId === p.parentId)).toBe(true);
  });
  it('replaces a sold middle tank through a selected engine interface, preserving the rest', () => {
    build('probe-core', 'kerolox-tank', 'kerolox-engine', 'compact-tank', 'swift-engine', 'comms-probe', 'fairing');
    const originalDeltaV = assembly.analyze().totalDeltaV;
    const tank = assembly.parts.find(p => p.id === 'kerolox-tank')!;
    builder.sellPart(tank.instanceId!);
    expect(budget).toBe(280); expect(assembly.parts).toHaveLength(6);
    expect(assembly.isComplete()).toBe(false);
    const engine = assembly.parts.find(p => p.id === 'kerolox-engine')!;
    const mesh = assembly.meshFor(engine.instanceId!)!;
    const world = root.localToWorld(mesh.position.clone().add(new THREE.Vector3(0, engine.height / 2, 0))).project(camera);
    const x = (world.x + 1) * innerWidth / 2, y = (1 - world.y) * innerHeight / 2;
    pointer(canvas, 'pointerdown', x, y); pointer(window, 'pointerup', x, y);
    const port = `above:${engine.instanceId}`;
    expect(node(port).b).not.toBeNull();
    builder.pick(part('kerolox-tank')); node(port).b.click();
    expect(budget).toBe(240); expect(assembly.parts).toHaveLength(7);
    expect(assembly.parts.map(p => p.id)).toEqual(['fairing', 'comms-probe', 'probe-core', 'kerolox-tank', 'kerolox-engine', 'compact-tank', 'swift-engine']);
    expect(assembly.isComplete()).toBe(true);
    expect(assembly.analyze().totalDeltaV).toBeCloseTo(originalDeltaV, 8);
    for (const p of assembly.parts) if (p.parentId) expect(assembly.parts.some(other => other.instanceId === p.parentId)).toBe(true);
  });
  it('collapses the right-edge monitor and keeps its analysis current while hidden', () => {
    const toggle = chrome.querySelector<HTMLButtonElement>('.specs-toggle')!;
    const screen = chrome.querySelector<HTMLElement>('.specs-screen')!;
    toggle.click(); expect(screen.hidden).toBe(true); expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-label')).toBe('Expand rocket specs');
    build('probe-core'); expect(screen.textContent).toContain('0.3 t');
    toggle.click(); expect(screen.hidden).toBe(false); expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });
  it('uses small markers while keeping the full snap target accessible', () => {
    const sphere = root.getObjectByName('attachment-root') as THREE.Mesh<THREE.SphereGeometry>;
    expect(sphere.geometry.parameters.radius).toBe(ATTACHMENT_RADIUS);
    expect(ATTACHMENT_RADIUS).toBeLessThan(.5);
    expect(node('root').b.getAttribute('aria-label')).toContain('Attach selected part');
  });
});
