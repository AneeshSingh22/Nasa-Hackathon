import { MODULAR_PARTS } from './modularParts';
import { modularAnalysis } from './modularVehicle';

/** Optional Relay recipe; values stay derived from the actual purchasable parts. */
export const STARTER_DESIGN = ['fairing', 'comms-probe', 'probe-core', 'kerolox-tank',
  'kerolox-engine', 'compact-tank', 'swift-engine'].map(id => {
    const part = MODULAR_PARTS.find(p => p.id === id);
    if (!part) throw new Error(`Starter part missing: ${id}`);
    return part;
  });
export const STARTER_ANALYSIS = modularAnalysis(STARTER_DESIGN);
export const STARTER_COST = STARTER_DESIGN.reduce((sum, p) => sum + p.cost, 0);
