import { deltaV, thrustToWeight } from '../physics/rocket';
import { G0 } from '../physics/constants';
import { WORKSHOP_PARTS } from './parts';
import type { PlacedPart } from './attach';

/**
 * Rollup for the Workshop readout.
 *
 * Pure: it takes the placed graph and returns numbers, so the palette and the
 * tests read the same figures. SI throughout — kilograms, newtons, metres per
 * second — converted only when the palette writes text.
 *
 * The teaching point is that propellant is only worth carrying if something can
 * burn it. A stack of tanks with no engine has mass, cost and zero delta-v, and
 * the readout should say so rather than quietly crediting the propellant.
 */
export interface VesselAnalysis {
  /** US dollars. */
  readonly cost: number;
  /** Fuelled mass, kg. */
  readonly wetMass: number;
  /** Mass with usable propellant spent, kg. */
  readonly dryMass: number;
  /** Total propellant an engine could actually burn, kg. */
  readonly propellantMass: number;
  /** Sea-level thrust, N. */
  readonly thrust: number;
  /** Mass-weighted specific impulse of the fitted engines, s. */
  readonly isp: number;
  /** Tsiolkovsky delta-v, m/s. Zero without an engine. */
  readonly deltaV: number;
  /** Thrust-to-weight at sea level. Below 1 the vehicle cannot lift off. */
  readonly twr: number;
  readonly hasEngine: boolean;
}

export function analyzeWorkshopVessel(parts: readonly PlacedPart[]): VesselAnalysis {
  let cost = 0;
  let dryMass = 0;
  let propellantMass = 0;
  let thrust = 0;
  // Sum mass flow rather than averaging isp: two engines of different isp
  // burning together behave like their combined flow, not their mean.
  let massFlow = 0;

  for (const part of parts) {
    const definition = WORKSHOP_PARTS[part.kind];
    cost += definition.cost;
    dryMass += definition.dryMass;
    propellantMass += definition.propellantMass;
    if (definition.thrust > 0 && definition.isp > 0) {
      thrust += definition.thrust;
      massFlow += definition.thrust / (definition.isp * G0);
    }
  }

  const hasEngine = thrust > 0 && massFlow > 0;
  const isp = hasEngine ? thrust / (massFlow * G0) : 0;
  // Without an engine the propellant is dead weight, so it stays in the wet
  // mass but buys no delta-v.
  const wetMass = dryMass + propellantMass;
  const burnable = hasEngine ? propellantMass : 0;

  return {
    cost,
    wetMass,
    dryMass,
    propellantMass: burnable,
    thrust,
    isp,
    deltaV: hasEngine ? deltaV(wetMass, wetMass - burnable, isp) : 0,
    twr: hasEngine && wetMass > 0 ? thrustToWeight(thrust, wetMass, G0) : 0,
    hasEngine,
  };
}
