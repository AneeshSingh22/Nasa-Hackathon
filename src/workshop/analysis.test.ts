import { describe, expect, it } from 'vitest';
import { analyzeWorkshopVessel } from './analysis';
import { WORKSHOP_PARTS } from './parts';
import { WorkshopVessel } from './vessel';

/**
 * These assert arithmetic against the part definitions, so a changed stub number
 * or a broken rollup fails here rather than showing a wrong figure in the HUD.
 */

const POD = WORKSHOP_PARTS['command-pod'];
const TANK = WORKSHOP_PARTS['fuel-tank'];
const ENGINE = WORKSHOP_PARTS['liquid-engine'];

describe('workshop vessel analysis', () => {
  it('sums cost and mass from the part definitions', () => {
    const vessel = new WorkshopVessel();
    const tank = vessel.attach('fuel-tank', 'pod', 'bottom');
    expect(tank).not.toBeNull();
    vessel.attach('liquid-engine', tank!.id, 'bottom');

    const analysis = analyzeWorkshopVessel(vessel.parts);
    expect(analysis.cost).toBe(POD.cost + TANK.cost + ENGINE.cost);
    expect(analysis.dryMass).toBe(POD.dryMass + TANK.dryMass + ENGINE.dryMass);
    expect(analysis.wetMass).toBe(
      POD.dryMass + TANK.dryMass + ENGINE.dryMass + TANK.propellantMass,
    );
  });

  it('gives the pod alone no delta-v and no thrust', () => {
    const analysis = analyzeWorkshopVessel(new WorkshopVessel().parts);
    expect(analysis.hasEngine).toBe(false);
    expect(analysis.deltaV).toBe(0);
    expect(analysis.thrust).toBe(0);
    expect(analysis.twr).toBe(0);
    expect(analysis.wetMass).toBe(POD.dryMass);
  });

  it('refuses to credit propellant with no engine to burn it', () => {
    // A tank without an engine is dead weight. This is the trade the readout
    // has to teach, and it once would have reported delta-v from isp 0.
    const vessel = new WorkshopVessel();
    vessel.attach('fuel-tank', 'pod', 'bottom');

    const analysis = analyzeWorkshopVessel(vessel.parts);
    expect(analysis.wetMass).toBe(POD.dryMass + TANK.dryMass + TANK.propellantMass);
    expect(analysis.propellantMass).toBe(0);
    expect(analysis.deltaV).toBe(0);
    expect(Number.isFinite(analysis.deltaV)).toBe(true);
  });

  it('matches the rocket equation once an engine is fitted', () => {
    const vessel = new WorkshopVessel();
    const tank = vessel.attach('fuel-tank', 'pod', 'bottom');
    vessel.attach('liquid-engine', tank!.id, 'bottom');

    const analysis = analyzeWorkshopVessel(vessel.parts);
    const wet = POD.dryMass + TANK.dryMass + ENGINE.dryMass + TANK.propellantMass;
    const dry = wet - TANK.propellantMass;
    const expected = ENGINE.isp * 9.80665 * Math.log(wet / dry);

    expect(analysis.isp).toBeCloseTo(ENGINE.isp, 6);
    expect(analysis.deltaV).toBeCloseTo(expected, 3);
    // Sanity: one small tank gives about 1 933 m/s, nowhere near the
    // ~9 400 m/s a launch to orbit needs.
    expect(analysis.deltaV).toBeGreaterThan(1900);
    expect(analysis.deltaV).toBeLessThan(1970);
    // And it can actually lift off, unlike a three-tank stack on one engine.
    expect(analysis.twr).toBeGreaterThan(1);
  });

  it('raises delta-v when a second tank is stacked on the same engine', () => {
    const one = new WorkshopVessel();
    const firstTank = one.attach('fuel-tank', 'pod', 'bottom');
    one.attach('liquid-engine', firstTank!.id, 'bottom');

    const two = new WorkshopVessel();
    const upper = two.attach('fuel-tank', 'pod', 'bottom');
    const lower = two.attach('fuel-tank', upper!.id, 'bottom');
    two.attach('liquid-engine', lower!.id, 'bottom');

    const single = analyzeWorkshopVessel(one.parts);
    const double = analyzeWorkshopVessel(two.parts);

    expect(double.deltaV).toBeGreaterThan(single.deltaV);
    // More propellant on the same engine also means a worse launch TWR.
    expect(double.twr).toBeLessThan(single.twr);
    expect(double.cost).toBeGreaterThan(single.cost);
  });

  it('drives a three-tank stack on one engine below liftoff thrust-to-weight', () => {
    // This is the trade the spike exists to teach: stacking tanks buys delta-v
    // with diminishing returns, and past three tanks one engine cannot lift the
    // vehicle at all. If a retune makes more tanks strictly better, fix the
    // numbers rather than this test.
    const vessel = new WorkshopVessel();
    let parent = 'pod';
    for (let i = 0; i < 3; i++) {
      const tank = vessel.attach('fuel-tank', parent, 'bottom');
      expect(tank).not.toBeNull();
      parent = tank!.id;
    }
    vessel.attach('liquid-engine', parent, 'bottom');

    const analysis = analyzeWorkshopVessel(vessel.parts);
    expect(analysis.deltaV).toBeGreaterThan(3400);
    expect(analysis.twr).toBeLessThan(1);
  });

  it('computes thrust-to-weight at sea level', () => {
    const vessel = new WorkshopVessel();
    const tank = vessel.attach('fuel-tank', 'pod', 'bottom');
    vessel.attach('liquid-engine', tank!.id, 'bottom');

    const analysis = analyzeWorkshopVessel(vessel.parts);
    expect(analysis.twr).toBeCloseTo(ENGINE.thrust / (analysis.wetMass * 9.80665), 6);
  });
});
