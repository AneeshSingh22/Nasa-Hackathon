import { describe, expect, it } from 'vitest';
import { canAttach, findSnap, nodeTargets } from './attach';
import { WorkshopVessel } from './vessel';

describe('axial attachment rules', () => {
  it('accepts a tank below the pod but rejects engines, a missing top, and another root', () => {
    const vessel = new WorkshopVessel();
    expect(canAttach(vessel.parts, 'pod', 'bottom', 'fuel-tank').allowed).toBe(true);
    expect(vessel.attach('liquid-engine', 'pod', 'bottom')).toBeNull();
    expect(vessel.attach('liquid-engine', 'pod', 'top')).toBeNull();
    expect(vessel.attach('command-pod', 'pod', 'bottom')).toBeNull();
    expect(vessel.attach('fuel-tank', 'missing', 'bottom')).toBeNull();
  });
  it('hangs an engine under a tank and prevents occupied or reversed connections', () => {
    const vessel = new WorkshopVessel();
    const tank = vessel.attach('fuel-tank', 'pod', 'bottom')!;
    expect(tank.position.y).toBeCloseTo(-2.4);
    expect(canAttach(vessel.parts, tank.id, 'bottom', 'liquid-engine').allowed).toBe(true);
    const engine = vessel.attach('liquid-engine', tank.id, 'bottom')!;
    expect(engine.position.y).toBeCloseTo(-4.2);
    expect(vessel.attach('liquid-engine', tank.id, 'bottom')).toBeNull();
    expect(vessel.attach('fuel-tank', tank.id, 'top')).toBeNull();
    expect(vessel.attach('fuel-tank', engine.id, 'top')).toBeNull();
    expect(vessel.attach('fuel-tank', engine.id, 'bottom')).toBeNull();
  });
  it('selects the nearest valid node in radius, preferring it to a closer invalid node', () => {
    const vessel = new WorkshopVessel();
    const tank = vessel.attach('fuel-tank', 'pod', 'bottom')!;
    expect(findSnap(vessel.parts, 'fuel-tank', { x: 0, y: -2.4, z: 0 }, 1.1)?.partId).toBe(tank.id);
    expect(findSnap(vessel.parts, 'fuel-tank', { x: 0, y: -1.4, z: 0 }, 2.1)?.partId).toBe(tank.id);
    expect(findSnap(vessel.parts, 'fuel-tank', { x: 4, y: -3.4, z: 0 })).toBeNull();
    expect(findSnap(vessel.parts, 'fuel-tank', { x: 0, y: -1.4, z: 0 })?.result.allowed).toBe(false);
    const target = nodeTargets(vessel.parts).find(node => node.partId === tank.id && node.nodeId === 'bottom')!;
    expect(findSnap(vessel.parts, 'liquid-engine', target.position)?.result.allowed).toBe(true);
  });
  it('keeps the growing stack above the stand using the same red/attach rule', () => {
    const vessel = new WorkshopVessel();
    let parent = 'pod';
    for (let i = 0; i < 3; i++) parent = vessel.attach('fuel-tank', parent, 'bottom')!.id;
    expect(canAttach(vessel.parts, parent, 'bottom', 'fuel-tank').allowed).toBe(false);
    expect(vessel.attach('fuel-tank', parent, 'bottom')).toBeNull();
    expect(vessel.attach('liquid-engine', parent, 'bottom')).not.toBeNull();
  });
});

describe('vessel state and totals', () => {
  it('detaches only the last part, frees its connection, and preserves the root', () => {
    const vessel = new WorkshopVessel();
    const tank = vessel.attach('fuel-tank', 'pod', 'bottom')!;
    const engine = vessel.attach('liquid-engine', tank.id, 'bottom')!;
    expect(vessel.childrenOf(tank.id)).toEqual([engine]);
    expect(vessel.detachLast()).toEqual(engine);
    expect(vessel.childrenOf(tank.id)).toEqual([]);
    expect(canAttach(vessel.parts, tank.id, 'bottom', 'liquid-engine').allowed).toBe(true);
    vessel.detachLast();
    expect(vessel.detachLast()).toBeNull();
    expect(vessel.parts.map(part => part.kind)).toEqual(['command-pod']);
  });
  it('rolls up actual SI mass and dollar costs including the pod, and reverses on detach', () => {
    const vessel = new WorkshopVessel();
    expect(vessel.analyze()).toEqual({ cost: 600000, wetMass: 1200 });
    const tank = vessel.attach('fuel-tank', 'pod', 'bottom')!;
    vessel.attach('liquid-engine', tank.id, 'bottom');
    expect(vessel.analyze()).toEqual({ cost: 830000, wetMass: 3400 });
    vessel.detachLast();
    expect(vessel.analyze()).toEqual({ cost: 680000, wetMass: 3000 });
    vessel.reset();
    expect(vessel.parts).toHaveLength(1);
    expect(vessel.analyze()).toEqual({ cost: 600000, wetMass: 1200 });
  });
});
