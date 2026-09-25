import { describe, it, expect } from 'vitest';
import { STATIONS, STATION_REACH, stationNear, stationFor } from './stations';
import { PART_LIBRARY } from './parts';
import { ELEVATOR_X, ELEVATOR_Z, CAR_HALF } from './Elevator';
import { VAB_WIDTH, VAB_DEPTH } from './VABScene';

/**
 * The bay layout is content, and content bugs are invisible until someone
 * walks into them. Two stations once sat 5 m apart with 2.6 m benches, so they
 * intersected; another version put a station where the elevator stands.
 */

/** Bench collision radius, matching VABScene. */
const BENCH_RADIUS = 2.6;

describe('station layout', () => {
  it('holds a real part at every station', () => {
    for (const station of STATIONS) {
      const part = PART_LIBRARY.find((p) => p.id === station.partId);
      expect(part, `station ${station.id}`).toBeDefined();
    }
  });

  it('offers every part in the library from some station', () => {
    // A part with no station can never be collected.
    for (const part of PART_LIBRARY) {
      expect(stationFor(part.id), `part ${part.id}`).not.toBeNull();
    }
  });

  it('keeps every bench inside the building', () => {
    const halfW = VAB_WIDTH / 2;
    const halfD = VAB_DEPTH / 2;
    for (const station of STATIONS) {
      expect(Math.abs(station.x), station.id).toBeLessThan(halfW - BENCH_RADIUS);
      expect(Math.abs(station.z), station.id).toBeLessThan(halfD - BENCH_RADIUS);
    }
  });

  it('never lets two benches intersect', () => {
    for (let i = 0; i < STATIONS.length; i++) {
      for (let j = i + 1; j < STATIONS.length; j++) {
        const a = STATIONS[i];
        const b = STATIONS[j];
        if (!a || !b) continue;
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        expect(d, `${a.id} and ${b.id}`).toBeGreaterThan(BENCH_RADIUS * 2);
      }
    }
  });

  it('keeps benches clear of the assembly stand', () => {
    // The stand is at the origin with a painted circle of radius 8.
    for (const station of STATIONS) {
      expect(Math.hypot(station.x, station.z), station.id).toBeGreaterThan(9);
    }
  });

  it('keeps benches clear of the elevator', () => {
    for (const station of STATIONS) {
      const d = Math.hypot(station.x - ELEVATOR_X, station.z - ELEVATOR_Z);
      expect(d, station.id).toBeGreaterThan(CAR_HALF + BENCH_RADIUS + 1);
    }
  });

  it('numbers the labels in build order', () => {
    // The player should be able to read the build sequence off the signs.
    const order = ['booster', 'upper', 'payload', 'fairing'];
    for (const station of STATIONS) {
      const part = PART_LIBRARY.find((p) => p.id === station.partId);
      if (!part) continue;
      const step = order.indexOf(part.kind) + 1;
      expect(station.label, station.id).toContain(`Step ${step}`);
    }
  });

  it('groups each slot\u2019s options together', () => {
    // Options for one slot should be near each other, so they read as a set.
    for (const kind of ['booster', 'upper', 'payload']) {
      const group = STATIONS.filter((s) => {
        const part = PART_LIBRARY.find((p) => p.id === s.partId);
        return part?.kind === kind;
      });
      if (group.length < 2) continue;

      // Every option within 26 m of every other in its group.
      for (const a of group) {
        for (const b of group) {
          const d = Math.hypot(a.x - b.x, a.z - b.z);
          expect(d, `${kind}: ${a.id} to ${b.id}`).toBeLessThan(26);
        }
      }
    }
  });

  it('finds the nearest station within reach', () => {
    const first = STATIONS[0];
    expect(first).toBeDefined();
    if (!first) return;

    expect(stationNear(first.x, first.z)?.id).toBe(first.id);
    // Well away from everything finds nothing.
    expect(stationNear(0, 0)).toBeNull();
  });

  it('does not let one position match two stations', () => {
    // Overlapping reach radii would make pickup ambiguous.
    for (const station of STATIONS) {
      const matches = STATIONS.filter(
        (s) => Math.hypot(s.x - station.x, s.z - station.z) < STATION_REACH,
      );
      expect(matches.length, `at ${station.id}`).toBe(1);
    }
  });
});
