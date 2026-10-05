import type { PartDefinition } from '../vab/parts';
import type { Stage, Vehicle } from '../physics/rocket';

/**
 * Turning the built stack into a flyable vehicle.
 *
 * The build phase stores parts as a list of `PartDefinition`; the flight model
 * wants stages with separate sea-level and vacuum figures. This is the only
 * place that conversion happens, so the rocket the player flies is provably
 * the rocket they built — the HUD in the VAB and the HUD in flight derive from
 * the same numbers.
 *
 * The library documents what its two figures mean, and the conversion has to
 * respect that or the vehicle that flies is not the vehicle that was costed:
 *
 * - `isp` is **vacuum** specific impulse. `parts.ts` says so on the field, and
 *   the sea-level value is derived by applying a penalty.
 * - `thrust` is **sea-level** thrust. The briefings quote lift-off
 *   thrust-to-weight from it, so it must be what the engine makes on the pad.
 *
 * Getting this backwards is not a small error. Treating a vacuum isp of 318 s
 * as a sea-level figure inflates it to 350 s in vacuum, and an ascent that
 * reached orbit on the correct numbers strands itself at 4 900 km apoapsis
 * with an empty tank on the wrong ones.
 */

/**
 * Vacuum gain on thrust, applied to the library's sea-level figure.
 *
 * A nozzle gains when ambient pressure falls: the Merlin 1D goes from 845 kN
 * at sea level to 914 kN in vacuum, about 8%.
 */
const VACUUM_THRUST_GAIN = 1.08;

/**
 * Sea-level penalty on specific impulse, applied to the library's vacuum
 * figure. Merlin 1D runs 282 s at sea level against 311 s in vacuum, so the
 * sea-level value is about 91% of vacuum.
 */
const SEA_LEVEL_ISP_RATIO = 0.91;

/**
 * An upper-stage nozzle is worse in air than a first-stage one, because its
 * large expansion ratio is badly over-expanded at sea level. It is never meant
 * to fire there, and this is why.
 */
const UPPER_STAGE_SEA_LEVEL_ISP_RATIO = 0.86;
const UPPER_STAGE_SEA_LEVEL_THRUST_RATIO = 0.71;

/** Minimum throttle a large liquid engine can hold without instability. */
const MIN_THROTTLE = 0.4;

/**
 * Drag coefficient for a launch vehicle, times the frontal area.
 *
 * A rocket is a slender body, but it is not a dart: a launch vehicle's drag
 * coefficient runs around 0.45 through the transonic region where most drag
 * loss happens, rising from roughly 0.3 subsonic as shock waves form. 0.45 is
 * the figure the verified ascent in `physics/ascent.test.ts` was flown with.
 * Frontal area comes from the widest part, which is what the airflow sees.
 */
const DRAG_COEFFICIENT = 0.45;

function dragArea(radius: number): number {
  return DRAG_COEFFICIENT * Math.PI * radius * radius;
}

/**
 * Build a flyable vehicle from the fitted parts.
 *
 * Returns null if the stack cannot fly — no engine, or no payload — rather
 * than producing a vehicle that would behave strangely in the simulation.
 */
export function vehicleFromParts(parts: readonly PartDefinition[]): Vehicle | null {
  const booster = parts.find(part => part.kind === 'booster');
  const upper = parts.find(part => part.kind === 'upper');
  const payload = parts.find(part => part.kind === 'payload');
  const fairing = parts.find(part => part.kind === 'fairing');

  if (!booster || !upper || !payload) return null;

  const stages: Stage[] = [
    {
      id: booster.id,
      name: booster.name,
      dryMass: booster.dryMass,
      propellantMass: booster.propellantMass,
      // thrust is the pad figure the briefings quote TWR from; isp is vacuum.
      thrustSeaLevel: booster.thrust,
      thrustVacuum: booster.thrust * VACUUM_THRUST_GAIN,
      ispVacuum: booster.isp,
      ispSeaLevel: booster.isp * SEA_LEVEL_ISP_RATIO,
      dragArea: dragArea(booster.radius),
      minThrottle: MIN_THROTTLE,
    },
    {
      id: upper.id,
      name: upper.name,
      dryMass: upper.dryMass,
      propellantMass: upper.propellantMass,
      // An upper stage is quoted where it runs, so its thrust figure is vacuum.
      thrustVacuum: upper.thrust,
      thrustSeaLevel: upper.thrust * UPPER_STAGE_SEA_LEVEL_THRUST_RATIO,
      ispVacuum: upper.isp,
      ispSeaLevel: upper.isp * UPPER_STAGE_SEA_LEVEL_ISP_RATIO,
      dragArea: dragArea(upper.radius),
      minThrottle: MIN_THROTTLE,
    },
  ];

  return {
    stages,
    // The fairing is carried to altitude and thrown away, so it is payload
    // mass until it is jettisoned.
    payloadMass: payload.dryMass + (fairing?.dryMass ?? 0),
    payloadName: payload.name,
  };
}

/** Mass the fairing takes with it when it goes. kg */
export function fairingMass(parts: readonly PartDefinition[]): number {
  return parts.find(part => part.kind === 'fairing')?.dryMass ?? 0;
}

/** Science the payload returns once it is in orbit. */
export function payloadScience(parts: readonly PartDefinition[]): number {
  return parts.find(part => part.kind === 'payload')?.science ?? 0;
}
