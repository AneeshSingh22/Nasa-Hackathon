import type { PartDefinition } from '../vab/parts';
import type { Stage, Vehicle } from '../physics/rocket';
import { totalDeltaV } from '../physics/rocket';
import { G0 } from '../physics/constants';
import { LEO_DELTA_V_REQUIRED } from '../game/launchRequirements';

/** Physical top-to-bottom order is reversed for flight's bottom-first stages.
 *  Conversion uses the same atmospheric nozzle ratios as flight/vehicle.ts.
 *  Tanks do not generate thrust or delta-v without an attached engine. */
export function modularStages(parts: readonly PartDefinition[]): { stages: Stage[]; unfedMass: number } {
  let tanks: PartDefinition[] = [];
  const stages: Stage[] = [];
  let unfedMass = 0;
  for (const part of parts.filter(p => p.kind === 'tank' || p.kind === 'engine')) {
    if (part.kind === 'tank') tanks.push(part);
    if (part.kind === 'engine' && !tanks.length) unfedMass += part.dryMass;
    if (part.kind === 'engine' && tanks.length) {
      const radius = Math.max(part.radius, ...tanks.map(t => t.radius));
      stages.push({
        id: part.instanceId ?? part.id, name: part.name,
        dryMass: part.dryMass + tanks.reduce((s, t) => s + t.dryMass, 0),
        propellantMass: tanks.reduce((s, t) => s + t.propellantMass, 0),
        thrustSeaLevel: part.vacuumOptimized ? part.thrust * .71 : part.thrust,
        thrustVacuum: part.vacuumOptimized ? part.thrust : part.thrust * 1.08,
        ispVacuum: part.isp, ispSeaLevel: part.isp * (part.vacuumOptimized ? .86 : .91),
        dragArea: .45 * Math.PI * radius * radius, minThrottle: .4,
      });
      tanks = [];
    }
  }
  return { stages: stages.reverse(), unfedMass: unfedMass + tanks.reduce((s, t) => s + t.dryMass + t.propellantMass, 0) };
}

export function modularComplete(parts: readonly PartDefinition[]): boolean {
  const { stages, unfedMass } = modularStages(parts);
  return ['command', 'payload', 'fairing'].every(kind => parts.some(p => p.kind === kind))
    && stages.length > 0 && unfedMass === 0;
}
export function modularVehicle(parts: readonly PartDefinition[]): Vehicle | null {
  if (!modularComplete(parts)) return null;
  const { stages, unfedMass } = modularStages(parts);
  if (!stages.length || unfedMass) return null;
  return { stages, payloadMass: parts.filter(p => p.kind !== 'tank' && p.kind !== 'engine').reduce((s, p) => s + p.dryMass, 0),
    payloadName: parts.find(p => p.kind === 'payload')!.name };
}
export function modularAnalysis(parts: readonly PartDefinition[]) {
  const { stages, unfedMass } = modularStages(parts);
  const liftoffMass = parts.reduce((s, p) => s + p.dryMass + p.propellantMass, 0);
  const payloadMass = parts.filter(p => p.kind !== 'tank' && p.kind !== 'engine').reduce((s, p) => s + p.dryMass, 0) + unfedMass;
  // Tsiolkovsky and G0 are the shared physics functions/constants, not UI estimates.
  const dv = stages.length ? totalDeltaV({ stages, payloadMass, payloadName: '' }) : 0;
  const twr = liftoffMass ? (stages[0]?.thrustSeaLevel ?? 0) / (liftoffMass * G0) : 0;
  const complete = modularComplete(parts);
  const canReachOrbit = complete && dv >= LEO_DELTA_V_REQUIRED && twr >= 1;
  return { liftoffMass, totalDeltaV: dv, liftoffTWR: twr, stageCount: stages.length, canReachOrbit,
    verdict: !complete ? missingParts(parts) : canReachOrbit ? 'Flight ready.' : 'Check delta-v and thrust-to-weight.',
    verdictLevel: !complete ? 'warn' as const : canReachOrbit ? 'good' as const : 'bad' as const };
}

/** A concise, useful incomplete-state cue instead of a paragraph of generic advice. */
export function missingParts(parts: readonly PartDefinition[]): string {
  const missing = ['command', 'payload', 'fairing'].filter(k => !parts.some(p => p.kind === k)).map(k => k === 'command' ? 'Control' : k[0]!.toUpperCase() + k.slice(1));
  const { stages, unfedMass } = modularStages(parts);
  if (!stages.length) missing.push('Tank + engine');
  else if (unfedMass) missing.push('Tanks above engines');
  return missing.join(' · ');
}
