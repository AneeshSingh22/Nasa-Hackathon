import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { assessReadiness } from './readiness';
import { Assembly } from '../vab/Assembly';
import { PART_LIBRARY, createMaterials } from '../vab/parts';
import { FlightPhase } from '../flight/FlightPhase';
import { vehicleFromParts } from '../flight/vehicle';

/**
 * Mission Control's call has to be right. A GO on a vehicle that cannot reach
 * orbit is a lie the flight exposes in minutes, and a NO-GO on one that can
 * steers the player away from a valid design. So the verdict is checked
 * against every buildable vehicle actually flown.
 */

const part = (id: string) => PART_LIBRARY.find(p => p.id === id)!;

describe('Mission Control verdict', () => {
  it('says NO-GO for every vehicle that fails to reach orbit, and GO or MARGINAL for every one that does', () => {
    const wrong: string[] = [];
    for (const booster of ['core-booster', 'solid-booster', 'extended-booster']) {
      for (const upper of ['upper-stage', 'kerolox-upper']) {
        for (const payload of ['comms-probe', 'telescope', 'crew-capsule', 'science-lab']) {
          const ids = [booster, upper, payload, 'fairing'];
          const assembly = new Assembly(new THREE.Group(), createMaterials());
          for (const id of ids) assembly.attachNextSpecific(id);
          const analysis = assembly.analyze();
          const call = assessReadiness({
            complete: true,
            totalDeltaV: analysis.totalDeltaV,
            liftoffTWR: analysis.liftoffTWR,
          });

          const flight = new FlightPhase(vehicleFromParts(ids.map(part))!);
          flight.operate('autopilot');
          flight.update(3.01);
          for (let i = 0; i < 200_000 && !flight.finished; i++) flight.update(0.02);
          const orbit = flight.snapshot.outcome.kind === 'orbit';

          if (orbit === (call.verdict === 'nogo')) {
            wrong.push(`${ids.slice(0, 3).join('+')}: ${call.verdict}, flew to ${orbit ? 'orbit' : 'failure'}`);
          }
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it('waits for a complete stack before calling it', () => {
    const call = assessReadiness({ complete: false, totalDeltaV: 12_000, liftoffTWR: 1.5 });
    expect(call.verdict).toBe('incomplete');
  });

  it('calls NO-GO on a vehicle that cannot lift its own weight, however much delta-v', () => {
    const call = assessReadiness({ complete: true, totalDeltaV: 12_000, liftoffTWR: 0.9 });
    expect(call.verdict).toBe('nogo');
    expect(call.detail).toMatch(/leave the pad/);
  });

  it('moves the gauge with delta-v', () => {
    const low = assessReadiness({ complete: true, totalDeltaV: 8_500, liftoffTWR: 1.4 });
    const high = assessReadiness({ complete: true, totalDeltaV: 10_800, liftoffTWR: 1.4 });
    expect(high.gauge).toBeGreaterThan(low.gauge);
  });
});
