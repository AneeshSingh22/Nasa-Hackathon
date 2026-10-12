import { describe, expect, it } from 'vitest';
import { attachmentAllowed, insertionIndex, MAX_STACK_HEIGHT, type Port } from './attachments';
import { MODULAR_PARTS } from './modularParts';
const part = (id: string) => MODULAR_PARTS.find(p => p.id === id)!;
const command = part('probe-core');

describe('Workshop attachment rules', () => {
  it('accepts every available part as the seed, including engines, tanks, payloads and fairings', () => {
    for (const p of MODULAR_PARTS.filter(p => !p.deferred)) expect(attachmentAllowed([], p, 'root'), p.id).toBe(true);
    expect(attachmentAllowed([command], part('compact-tank'), 'root')).toBe(false);
  });
  it('accepts additions above and below without requiring command or fuel to be purchased first', () => {
    expect(attachmentAllowed([part('swift-engine')], part('compact-tank'), 'upper')).toBe(true);
    expect(attachmentAllowed([part('compact-tank')], part('swift-engine'), 'lower')).toBe(true);
    expect(attachmentAllowed([part('comms-probe')], command, 'lower')).toBe(true);
    expect(attachmentAllowed([part('fairing')], part('comms-probe'), 'lower')).toBe(true);
    // A physically attached engine may be unfed; launch readiness explains that separately.
    expect(attachmentAllowed([command], part('swift-engine'), 'lower')).toBe(true);
  });
  it('rejects duplicate control/payload/fairing units and wrong reserved-node kinds', () => {
    expect(attachmentAllowed([command], part('command-pod'), 'upper')).toBe(false);
    expect(attachmentAllowed([part('comms-probe')], part('telescope'), 'lower')).toBe(false);
    expect(attachmentAllowed([part('fairing')], part('fairing'), 'upper')).toBe(false);
    expect(attachmentAllowed([command], part('compact-tank'), 'payload')).toBe(false);
    expect(attachmentAllowed([command, part('comms-probe')], part('swift-engine'), 'fairing')).toBe(false);
  });
  it('inserts at either selected interface and rejects missing part identities', () => {
    const tank = { ...part('compact-tank'), instanceId: 'tank:1' };
    const engine = { ...part('swift-engine'), instanceId: 'engine:2' };
    expect(insertionIndex([command, tank, engine], 'above:tank:1')).toBe(1);
    expect(insertionIndex([command, tank, engine], 'below:tank:1')).toBe(2);
    expect(attachmentAllowed([command, tank, engine], part('kerolox-tank'), 'above:engine:2')).toBe(true);
    expect(attachmentAllowed([command, tank, engine], part('kerolox-tank'), 'below:missing')).toBe(false);
  });
  it('keeps the two-engine and bay-height limits', () => {
    const stack = [command, part('kerolox-tank'), part('kerolox-engine'), part('compact-tank'), part('swift-engine')];
    expect(attachmentAllowed(stack, part('core-engine'), 'upper')).toBe(false);
    expect(attachmentAllowed([command], { ...part('compact-tank'), height: MAX_STACK_HEIGHT }, 'lower')).toBe(false);
  });
  it('keeps deferred decouplers unavailable at every connection', () => {
    for (const port of ['root', 'upper', 'lower', 'payload', 'fairing'] as Port[]) expect(attachmentAllowed([command], part('stack-decoupler'), port)).toBe(false);
  });
});
