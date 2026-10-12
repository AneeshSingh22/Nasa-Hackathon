import { describe, expect, it } from 'vitest';
import { CAMPAIGN } from '../game/campaign';
import { evaluate } from '../game/contract';
import { FlightPhase } from '../flight/FlightPhase';
import { MODULAR_PARTS } from './modularParts';
import { modularAnalysis, modularComplete, modularVehicle } from './modularVehicle';
import { STARTER_DESIGN, STARTER_ANALYSIS, STARTER_COST } from './starterDesign';
import { LEO_DELTA_V_REQUIRED } from '../game/launchRequirements';
const part = (id: string) => MODULAR_PARTS.find(p => p.id === id)!;

describe('starter mission balance', () => {
  it('gives the optional guide a generous real-flight margin within the starter budget', () => {
    expect(STARTER_COST).toBeLessThan(CAMPAIGN[0]!.par);
    expect(STARTER_ANALYSIS.totalDeltaV - LEO_DELTA_V_REQUIRED).toBeGreaterThan(1800);
    expect(STARTER_ANALYSIS.liftoffTWR).toBeGreaterThan(1.2);
    const flight = new FlightPhase(modularVehicle(STARTER_DESIGN)!);
    flight.operate('autopilot'); flight.update(3.01);
    for (let i = 0; i < 200000 && !flight.finished; i++) flight.update(.02);
    expect(flight.snapshot.outcome.kind).toBe('orbit');
  });
  it('uses the contract target for analysis, including complete single-stage designs below orbit delta-v', () => {
    const parts = ['fairing', 'comms-probe', 'probe-core', 'compact-tank', 'swift-engine'].map(part);
    const analysis = modularAnalysis(parts);
    expect(modularComplete(parts)).toBe(true);
    expect(analysis.totalDeltaV).toBeLessThan(LEO_DELTA_V_REQUIRED);
    expect(analysis.canReachOrbit).toBe(false);
    expect(evaluate(CAMPAIGN[0]!, { ...analysis, isComplete: true, hasPayload: true, scienceValue: 40 }).satisfied).toBe(false);
  });
  for (const control of ['probe-core', 'command-pod']) {
    it(`offers affordable orbital builds with ${control} across the mainstream stage choices`, () => {
      const relay = CAMPAIGN[0]!; let winners = 0; let underPar = 0;
      for (const [tank, engine] of [['compact-tank', 'swift-engine'], ['core-tank', 'core-engine'], ['extended-tank', 'extended-engine']]) {
        for (const [upperTank, upperEngine] of [['kerolox-tank', 'kerolox-engine'], ['hydrolox-tank', 'hydrolox-engine']]) {
          const parts = ['fairing', 'comms-probe', control, upperTank!, upperEngine!, tank!, engine!].map(part);
          const cost = parts.reduce((sum, p) => sum + p.cost, 0); expect(cost).toBeLessThanOrEqual(relay.budget);
          const analysis = modularAnalysis(parts);
          const meetsContract = evaluate(relay, { ...analysis, scienceValue: 40, hasPayload: true, isComplete: modularComplete(parts), payloadId: 'comms-probe' }).satisfied;
          const flight = new FlightPhase(modularVehicle(parts)!); flight.operate('autopilot'); flight.update(3.01);
          for (let i = 0; i < 200000 && !flight.finished; i++) flight.update(.02);
          if (meetsContract && flight.snapshot.outcome.kind === 'orbit') { winners++; if (cost <= relay.par) underPar++; }
        }
      }
      expect(winners).toBe(6);
      expect(underPar).toBeGreaterThanOrEqual(3); expect(underPar).toBeLessThan(winners);
    });
  }
});
