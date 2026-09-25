import { G0 } from './constants';

/** One stage of a launch vehicle. All masses kg, thrust N, isp seconds. */
export interface Stage {
  id: string;
  name: string;
  /** Structural mass with empty tanks. kg */
  dryMass: number;
  /** Usable propellant mass. kg */
  propellantMass: number;
  /** Vacuum thrust at full throttle. N */
  thrustVacuum: number;
  /** Sea-level thrust at full throttle. N — lower, because ambient pressure
   *  works against the nozzle. */
  thrustSeaLevel: number;
  /** Vacuum specific impulse. s */
  ispVacuum: number;
  /** Sea-level specific impulse. s */
  ispSeaLevel: number;
  /** Drag coefficient times cross-sectional area. m^2 */
  dragArea: number;
  /** Lowest throttle the engine can hold. Most large engines cannot go below
   *  about 40% without combustion instability. */
  minThrottle: number;
}

/** An assembled vehicle: stages bottom-first, plus a payload on top. */
export interface Vehicle {
  stages: Stage[];
  payloadMass: number;
  payloadName: string;
}

/** Live flight state of a vehicle. */
export interface VehicleState {
  /** Index into stages[]; counts up as stages are jettisoned. */
  currentStage: number;
  /** Remaining propellant fraction per stage, 0..1, indexed as stages[]. */
  propellantFraction: number[];
  throttle: number;
}

/**
 * Tsiolkovsky's rocket equation.
 *
 * The single most important relationship in spaceflight: adding payload mass
 * reduces the delta-v available for every subsequent manoeuvre, which is what
 * makes the build phase a real engineering trade rather than a shopping trip.
 */
export function deltaV(wetMass: number, dryMass: number, isp: number): number {
  if (dryMass <= 0 || wetMass < dryMass) return 0;
  return isp * G0 * Math.log(wetMass / dryMass);
}

/** Propellant mass flow rate at a given thrust and isp. kg/s */
export function massFlowRate(thrust: number, isp: number): number {
  return thrust / (isp * G0);
}

/**
 * Total mass of the vehicle from a given stage upward — that is, everything
 * the currently-burning engine actually has to push.
 */
export function stackMass(
  vehicle: Vehicle,
  state: Pick<VehicleState, 'currentStage' | 'propellantFraction'>,
): number {
  let mass = vehicle.payloadMass;
  for (let i = vehicle.stages.length - 1; i >= state.currentStage; i--) {
    const stage = vehicle.stages[i];
    if (!stage) continue;
    const fraction = state.propellantFraction[i] ?? 0;
    mass += stage.dryMass + stage.propellantMass * fraction;
  }
  return mass;
}

/**
 * Interpolate thrust and isp between sea-level and vacuum values.
 *
 * Real engines gain roughly 10-15% thrust on the way up as ambient pressure
 * drops. The transition is essentially complete by about 30 km.
 */
export function enginePerformance(
  stage: Stage,
  altitude: number,
): { thrust: number; isp: number } {
  const t = Math.min(1, Math.max(0, altitude / 30000));
  return {
    thrust: stage.thrustSeaLevel + (stage.thrustVacuum - stage.thrustSeaLevel) * t,
    isp: stage.ispSeaLevel + (stage.ispVacuum - stage.ispSeaLevel) * t,
  };
}

/** Thrust-to-weight ratio against local gravity. Below 1.0 it will not lift. */
export function thrustToWeight(
  thrust: number,
  mass: number,
  localGravity: number,
): number {
  return thrust / (mass * localGravity);
}

/**
 * Total delta-v budget of a vehicle, summed stage by stage with vacuum isp.
 *
 * This is the headline number in the VAB. A launch to low Earth orbit needs
 * roughly 9,400 m/s once gravity and drag losses are included, against the
 * 7,673 m/s of pure orbital velocity at 400 km.
 */
export function totalDeltaV(vehicle: Vehicle): number {
  let total = 0;
  for (let i = 0; i < vehicle.stages.length; i++) {
    const stage = vehicle.stages[i];
    if (!stage) continue;

    // Everything this stage must accelerate: itself, plus all upper stages
    // and the payload.
    let above = vehicle.payloadMass;
    for (let j = i + 1; j < vehicle.stages.length; j++) {
      const upper = vehicle.stages[j];
      if (upper) above += upper.dryMass + upper.propellantMass;
    }

    const wet = above + stage.dryMass + stage.propellantMass;
    const dry = above + stage.dryMass;
    total += deltaV(wet, dry, stage.ispVacuum);
  }
  return total;
}

/** Burn duration of a stage at full throttle. s */
export function burnTime(stage: Stage): number {
  return stage.propellantMass / massFlowRate(stage.thrustVacuum, stage.ispVacuum);
}

/** Mass on the pad, fully fuelled. kg */
export function liftoffMass(vehicle: Vehicle): number {
  return stackMass(vehicle, {
    currentStage: 0,
    propellantFraction: vehicle.stages.map(() => 1),
  });
}

/** Fresh flight state for a fully-fuelled vehicle. */
export function initialVehicleState(vehicle: Vehicle): VehicleState {
  return {
    currentStage: 0,
    propellantFraction: vehicle.stages.map(() => 1),
    throttle: 1,
  };
}
