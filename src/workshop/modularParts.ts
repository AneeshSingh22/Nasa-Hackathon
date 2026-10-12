import { PART_LIBRARY, type PartDefinition } from '../vab/parts';

const part = (id: string, kind: PartDefinition['kind'], name: string, cost: number,
  dryMass: number, height: number, extra: Partial<PartDefinition> = {}): PartDefinition => ({
  id, kind, name, cost, dryMass, height, radius: 2.7, propellantMass: 0,
  thrust: 0, isp: 0, keyFact: '', briefing: '', ...extra,
});

/** Tank/engine mass sums match the calibrated legacy stage library.
 *  Live engine efficiencies are tuned for forgiving first-mission margins;
 *  the shared physics uses these same values in both analysis and flight.
 *  Compact/Swift is a fictional liquid equivalent of SB-5.
 *  Costs and command masses are game balance, not manufacturer quotations.
 *  Mesh dimensions are mockup dimensions; SI masses/thrust drive simulation. */
export const MODULAR_PARTS: readonly PartDefinition[] = [
  part('command-pod', 'command', 'Command capsule', 8, 1600, 4, {
    radius: 2.2, briefing: 'A pilot compartment with built-in reaction control. Heavier than the unmanned unit. Can be fitted before or after propulsion. Required for launch.',
    keyFact: 'Pilot aboard · basic pitch, yaw and roll control',
  }),
  part('probe-core', 'command', 'Unmanned control unit', 4, 300, 2, {
    radius: 1.6, briefing: 'A compact computer with built-in reaction control. No crew; its lower mass preserves fuel and budget. Required for launch.',
    keyFact: 'Unmanned · basic pitch, yaw and roll control',
  }),
  part('compact-tank', 'tank', 'Compact fuel tank', 40, 5000, 14, {
    propellantMass: 240000, briefing: 'An economical first-stage tank. Pair it with a Swift engine for an inexpensive liftoff stage. Tanks stack above their engine.',
  }),
  part('core-tank', 'tank', 'Core fuel tank', 80, 8000, 18, {
    propellantMass: 310000, briefing: 'More propellant and more dry mass. Pair with a strong liftoff engine and watch thrust-to-weight as you add fuel.',
  }),
  part('extended-tank', 'tank', 'Extended fuel tank', 116, 9500, 21, {
    propellantMass: 360000, radius: 2.8, briefing: 'The largest tank. Capacity buys delta-v, but the mass and cost can erase your liftoff and budget margins.',
  }),
  part('kerolox-tank', 'tank', 'Upper kerolox tank', 40, 3200, 8, {
    propellantMass: 78000, briefing: 'A light, affordable upper-stage tank. Combine it with a vacuum engine to burn after the booster stage separates.',
  }),
  part('hydrolox-tank', 'tank', 'Upper hydrolox tank', 64, 4300, 10, {
    propellantMass: 95000, briefing: 'The larger upper-stage tank. It carries more fuel but costs more and adds dry mass. Engine choice determines efficiency.',
  }),
  part('swift-engine', 'engine', 'Swift booster engine', 56, 6000, 3.5, {
    thrust: 6800000, isp: 300, briefing: 'Inexpensive liftoff thrust with lower efficiency. Supports throttle control. Watch both fuel capacity and thrust-to-weight as you build.',
  }),
  part('core-engine', 'engine', 'Core engine cluster', 68, 8000, 4, {
    thrust: 5900000, isp: 335, briefing: 'An efficient main engine cluster. Every engine needs a tank directly upstream. Extra fuel will not help if the vehicle cannot lift its weight.',
  }),
  part('extended-engine', 'engine', 'Extended engine cluster', 80, 9500, 4, {
    thrust: 6100000, isp: 345, briefing: 'Higher efficiency at a higher price and dry mass. Pair with the extended tank for a powerful but expensive booster stage.',
  }),
  part('kerolox-engine', 'engine', 'Vacuum kerolox engine', 24, 1000, 2.5, {
    thrust: 1000000, isp: 360, vacuumOptimized: true,
    briefing: 'An economical vacuum engine. Its quoted thrust is in vacuum; poor sea-level performance makes it an upper-stage choice.',
  }),
  part('hydrolox-engine', 'engine', 'Vacuum hydrolox engine', 32, 1200, 3, {
    thrust: 1150000, isp: 390, vacuumOptimized: true,
    briefing: 'The most efficient engine here. It is intended for upper-stage burns; it cannot lift a large vehicle from sea level.',
  }),
  ...PART_LIBRARY.filter(p => p.kind === 'payload' || p.kind === 'fairing'),
  part('stack-decoupler', 'decoupler', 'Stack decoupler', 0, 0, 1, {
    deferred: true, briefing: 'Planned: explicit stage separation hardware. Current flight stages are still inferred from tank/engine groups. This item cannot be placed or purchased yet.',
  }),
];

export const WORKSHOP_CATEGORIES = [
  { id: 'command', name: 'Command', kinds: ['command'], icon: 'capsule' },
  { id: 'propulsion', name: 'Propulsion & stages', kinds: ['tank', 'engine'], icon: 'engine' },
  { id: 'payloads', name: 'Payloads', kinds: ['payload'], icon: 'satellite' },
  { id: 'structure', name: 'Structure & aero', kinds: ['fairing', 'decoupler'], icon: 'fairing' },
] as const;
export type WorkshopCategory = typeof WORKSHOP_CATEGORIES[number]['id'];
