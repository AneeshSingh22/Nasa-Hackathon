import { describe, it, expect } from 'vitest';
import {
  STATIONS,
  STATION_REACH,
  stationNear,
  stationForKind,
  stationForStep,
} from './stations';
import { PART_LIBRARY } from './parts';
import { ELEVATOR_X, ELEVATOR_Z, CAR_HALF } from './Elevator';
import { VAB_WIDTH, VAB_DEPTH } from './VABScene';

/**
 * The bay layout is content, and content bugs are invisible until someone walks
 * into them. Two benches once sat 5 m apart with 2.6 m collision radii, so they
 * intersected; an earlier version had ten benches that all looked the same.
 */

/** Bench collision radius, matching VABScene. */
const BENCH_RADIUS = 2.9;

describe('station layout', () => {
  it('has exactly one station per build step', () => {
    // One bench per part meant walking to a different bench duplicated what
    // the Tab panel already does.
    expect(STATIONS).toHaveLength(4);
    for (const step of [1, 2, 3, 4]) {
      expect(stationForStep(step), `step ${step}`).not.toBeNull();
    }
  });

  it('issues every kind of part the library contains', () => {
    const kinds = new Set(PART_LIBRARY.map((p) => p.kind));
    for (const kind of kinds) {
      expect(stationForKind(kind), `kind ${kind}`).not.toBeNull();
    }
  });

  it('gives every station at least one part to issue', () => {
    for (const station of STATIONS) {
      const options = PART_LIBRARY.filter((p) => p.kind === station.kind);
      expect(options.length, station.id).toBeGreaterThan(0);
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

  it('lays the steps out in order along one wall', () => {
    // The player should walk a straight line from step 1 to step 4 rather than
    // crossing the bay between sequential steps.
    const sorted = [...STATIONS].sort((a, b) => a.step - b.step);
    for (let i = 1; i < sorted.length; i++) {
      const previous = sorted[i - 1];
      const current = sorted[i];
      if (!previous || !current) continue;
      // Each step is further along +X than the last.
      expect(current.x, `step ${current.step} after ${previous.step}`)
        .toBeGreaterThan(previous.x);
      // And on the same wall run, so they are all visible together.
      expect(Math.abs(current.z - previous.z)).toBeLessThan(2);
    }
  });

  it('numbers the labels to match the step', () => {
    for (const station of STATIONS) {
      expect(station.label, station.id).toContain(`Step ${station.step}`);
    }
  });

  it('finds the nearest station within reach', () => {
    const first = STATIONS[0];
    expect(first).toBeDefined();
    if (!first) return;

    expect(stationNear(first.x, first.z)?.id).toBe(first.id);
    // The middle of the floor is not at any station.
    expect(stationNear(0, 5)).toBeNull();
  });

  it('does not let one position match two stations', () => {
    // Overlapping reach radii would make collection ambiguous.
    for (const station of STATIONS) {
      const matches = STATIONS.filter(
        (s) => Math.hypot(s.x - station.x, s.z - station.z) < STATION_REACH,
      );
      expect(matches.length, `at ${station.id}`).toBe(1);
    }
  });

  it('spaces the stations so all four are reachable in a short walk', () => {
    const xs = STATIONS.map((s) => s.x);
    const span = Math.max(...xs) - Math.min(...xs);
    // Wide enough not to overlap, tight enough to see the whole row.
    expect(span).toBeGreaterThan(20);
    expect(span).toBeLessThan(40);
  });
});
