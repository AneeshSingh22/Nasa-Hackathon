import * as THREE from 'three';
import { createMaterials, type Materials } from './parts';
import { STATIONS } from './stations';

/**
 * The Vehicle Assembly Building.
 *
 * A large industrial interior: concrete floor, steel truss roof, work lights,
 * service gantry. The scale is the point — the player should walk in and feel
 * how big a launch vehicle actually is, which is something a 2D game cannot do.
 */

export const VAB_WIDTH = 60;
export const VAB_DEPTH = 46;
export const VAB_HEIGHT = 58;

export interface VABEnvironment {
  scene: THREE.Scene;
  materials: Materials;
  /** The group the assembled rocket is parented to. */
  assemblyRoot: THREE.Object3D;
  /** Updated each frame for the flickering work lights. */
  update: (elapsed: number) => void;
  /**
   * Height of whatever surface is under a given floor position.
   *
   * The controller needs this to stand on gantry platforms rather than
   * floating, and to fall when the player walks off one.
   */
  supportHeightAt: (x: number, z: number, feetY: number) => number;
  /**
   * The ladder at this position, or null.
   *
   * Returns the column's x and top so the controller can latch the player to
   * it while climbing rather than letting them drift off.
   */
  ladderAt: (x: number, z: number) => { x: number; top: number } | null;
  /** True when this height is level with a platform the player can step onto. */
  isAtPlatformLevel: (feetY: number) => boolean;
  /**
   * Everything solid in the room, as vertical cylinders.
   *
   * The benches, the gantry legs and the structural columns. The vehicle
   * itself is added by the caller, since it grows as it is built.
   */
  staticObstacles: Array<{ x: number; z: number; radius: number; top: number }>;
}

export function createVABScene(): VABEnvironment {
  const scene = new THREE.Scene();
  // A real high bay is painted white and lit hard. The first version was a
  // dark warehouse, which looked atmospheric and read as unfinished.
  scene.background = new THREE.Color(0x1b2434);
  scene.fog = new THREE.Fog(0x1b2434, 80, 210);

  const mats = createMaterials();

  const concrete = new THREE.MeshStandardMaterial({
    color: 0x8d949f,
    roughness: 0.86,
    metalness: 0.02,
  });
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xd6dae0,
    roughness: 0.76,
    metalness: 0.04,
  });
  /** Painted floor, for the bay markings. */
  const floorPaint = new THREE.MeshStandardMaterial({
    color: 0x3f6fa8,
    roughness: 0.7,
    metalness: 0.05,
  });
  /** Station bench tops. */
  const benchMat = new THREE.MeshStandardMaterial({
    color: 0x4a5462,
    roughness: 0.55,
    metalness: 0.45,
  });
  /** Placard faces, which read as printed signage. */
  const placardMat = new THREE.MeshStandardMaterial({
    color: 0xf2f4f7,
    roughness: 0.9,
    metalness: 0.0,
  });
  const steel = new THREE.MeshStandardMaterial({
    color: 0x4b5260,
    roughness: 0.55,
    metalness: 0.7,
  });
  const paint = new THREE.MeshStandardMaterial({
    color: 0xffb400,
    roughness: 0.7,
    metalness: 0.1,
  });

  // ---- floor ----
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(VAB_WIDTH, VAB_DEPTH),
    concrete,
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Painted safety markings around the assembly stand, which also gives the
  // player a sense of where they are relative to the rocket.
  const ringGeo = new THREE.RingGeometry(7.4, 8.0, 48);
  const ring = new THREE.Mesh(ringGeo, paint);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.01;
  scene.add(ring);

  // Floor grid lines, cheap and they sell the industrial scale.
  const grid = new THREE.GridHelper(VAB_WIDTH, 23, 0x2c313c, 0x23272f);
  grid.position.y = 0.005;
  scene.add(grid);

  // ---- walls ----
  const halfW = VAB_WIDTH / 2;
  const halfD = VAB_DEPTH / 2;

  const wallSpecs: Array<{ w: number; h: number; pos: [number, number, number]; rotY: number }> = [
    { w: VAB_WIDTH, h: VAB_HEIGHT, pos: [0, VAB_HEIGHT / 2, -halfD], rotY: 0 },
    { w: VAB_WIDTH, h: VAB_HEIGHT, pos: [0, VAB_HEIGHT / 2, halfD], rotY: Math.PI },
    { w: VAB_DEPTH, h: VAB_HEIGHT, pos: [-halfW, VAB_HEIGHT / 2, 0], rotY: Math.PI / 2 },
    { w: VAB_DEPTH, h: VAB_HEIGHT, pos: [halfW, VAB_HEIGHT / 2, 0], rotY: -Math.PI / 2 },
  ];
  for (const spec of wallSpecs) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(spec.w, spec.h), wallMat);
    wall.position.set(...spec.pos);
    wall.rotation.y = spec.rotY;
    scene.add(wall);
  }

  // Ceiling.
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(VAB_WIDTH, VAB_DEPTH),
    wallMat,
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = VAB_HEIGHT;
  scene.add(ceiling);

  // ---- roof trusses ----
  const trussGroup = new THREE.Group();
  for (let i = -3; i <= 3; i++) {
    const z = i * 6;
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(VAB_WIDTH, 0.5, 0.5),
      steel,
    );
    beam.position.set(0, VAB_HEIGHT - 1.5, z);
    trussGroup.add(beam);

    // Diagonal bracing, which is what makes a truss read as a truss.
    for (let j = -3; j <= 3; j++) {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 5.6), steel);
      brace.position.set(j * 6.5, VAB_HEIGHT - 2.6, z);
      brace.rotation.x = j % 2 === 0 ? 0.38 : -0.38;
      trussGroup.add(brace);
    }
  }
  scene.add(trussGroup);

  // ---- vertical structural columns ----
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const column = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, VAB_HEIGHT, 1.2),
        steel,
      );
      column.position.set(sx * (halfW - 1.4), VAB_HEIGHT / 2, sz * (halfD - 1.4));
      column.castShadow = true;
      scene.add(column);
    }
  }

  // ---- service gantry: the tower beside the rocket ----
  const gantry = new THREE.Group();
  const levels = 9;
  for (let i = 0; i < levels; i++) {
    const y = 4 + i * 5.2;

    const platform = new THREE.Mesh(new THREE.BoxGeometry(7, 0.22, 4.4), steel);
    platform.position.set(7.2, y, 0);
    platform.castShadow = true;
    gantry.add(platform);

    // Yellow handrail along the outer edge.
    const rail = new THREE.Mesh(new THREE.BoxGeometry(7, 0.1, 0.1), paint);
    rail.position.set(7.2, y + 1.05, 2.2);
    gantry.add(rail);
    const rail2 = new THREE.Mesh(new THREE.BoxGeometry(7, 0.1, 0.1), paint);
    rail2.position.set(7.2, y + 1.05, -2.2);
    gantry.add(rail2);

    // Stanchions.
    for (const z of [-2.2, 2.2]) {
      for (const dx of [-3, 0, 3]) {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.05, 1.05, 6),
          paint,
        );
        post.position.set(7.2 + dx, y + 0.52, z);
        gantry.add(post);
      }
    }
  }
  // Ladder up the outboard side of the gantry. The payload is fitted from the
  // top platform, so this is the route the player has to take.
  // Inside the platform footprint (7.2 +/- 3.5) so a climber lands on one.
  const ladderX = 10.4;
  const ladderTop = 47.5;
  for (const side of [-0.42, 0.42]) {
    const rail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, ladderTop, 8),
      paint,
    );
    rail.position.set(ladderX, ladderTop / 2, side);
    gantry.add(rail);
  }
  for (let y = 0.4; y < ladderTop; y += 0.42) {
    const rung = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.9, 6),
      paint,
    );
    rung.rotation.x = Math.PI / 2;
    rung.position.set(ladderX, y, 0);
    gantry.add(rung);
  }

  // Gantry legs.
  for (const dz of [-2, 2]) {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, VAB_HEIGHT * 0.85, 0.4),
      steel,
    );
    leg.position.set(10.4, (VAB_HEIGHT * 0.85) / 2, dz);
    leg.castShadow = true;
    gantry.add(leg);
  }
  scene.add(gantry);

  // ---- assembly stand ----
  const stand = new THREE.Mesh(
    new THREE.CylinderGeometry(4.2, 4.8, 1.6, 24),
    steel,
  );
  stand.position.y = 0.8;
  stand.castShadow = true;
  stand.receiveShadow = true;
  scene.add(stand);

  // Hold-down clamps around the stand.
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.4, 0.7), paint);
    clamp.position.set(Math.cos(angle) * 3.4, 1.9, Math.sin(angle) * 3.4);
    clamp.castShadow = true;
    scene.add(clamp);
  }

  // Where the rocket gets parented. Sits on top of the stand.
  const assemblyRoot = new THREE.Object3D();
  assemblyRoot.position.set(0, 1.6, 0);
  scene.add(assemblyRoot);

  // ---- part stations ----
  // Each component sits on its own bench with a placard, so choosing a payload
  // means walking to a different station rather than cycling a menu.
  const stationObstacles: Array<{ x: number; z: number; radius: number; top: number }> = [];

  for (const station of STATIONS) {
    const bench = new THREE.Group();
    bench.position.set(station.x, 0, station.z);
    bench.rotation.y = station.rotation;

    // Bench top and legs.
    const top = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.18, 2.6), benchMat);
    top.position.y = 0.95;
    top.castShadow = true;
    top.receiveShadow = true;
    bench.add(top);

    for (const lx of [-2.0, 2.0]) {
      for (const lz of [-1.0, 1.0]) {
        const leg = new THREE.Mesh(
          new THREE.BoxGeometry(0.16, 0.95, 0.16),
          benchMat,
        );
        leg.position.set(lx, 0.475, lz);
        bench.add(leg);
      }
    }

    // Angled placard at the back of the bench, facing the room.
    const placard = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.5, 0.08), placardMat);
    placard.position.set(0, 1.85, -1.1);
    placard.rotation.x = -0.22;
    placard.castShadow = true;
    bench.add(placard);

    // Coloured stripe along the front edge, keyed to the bay, so the three
    // groups of stations read as groups from across the room.
    const stripeColour =
      station.bay === 'stages' ? 0xff6b3d : station.bay === 'payloads' ? 0x52d9ec : 0xffbc4d;
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(4.6, 0.1, 0.12),
      new THREE.MeshStandardMaterial({
        color: stripeColour,
        emissive: stripeColour,
        emissiveIntensity: 0.35,
        roughness: 0.6,
      }),
    );
    stripe.position.set(0, 1.05, 1.32);
    bench.add(stripe);

    scene.add(bench);

    // Benches are solid, so the player walks round them.
    stationObstacles.push({ x: station.x, z: station.z, radius: 2.6, top: 1.1 });
  }

  // ---- floor markings ----
  // Painted walkways between the bays, which is how a real high bay routes
  // people around the hardware.
  for (const z of [-11, 11]) {
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(VAB_WIDTH - 6, 0.22), floorPaint);
    lane.rotation.x = -Math.PI / 2;
    lane.position.set(0, 0.012, z);
    scene.add(lane);
  }
  for (const x of [-13.5, 13.5]) {
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(0.22, VAB_DEPTH - 6), floorPaint);
    lane.rotation.x = -Math.PI / 2;
    lane.position.set(x, 0.012, 0);
    scene.add(lane);
  }

  // ---- lighting ----
  // A working high bay is bright and evenly lit. The original scene used a
  // dim ambient and five point lights, which left most of the room in shadow
  // and made a finished build look like a prototype.
  scene.add(new THREE.AmbientLight(0xdfe7f2, 2.4));

  const hemi = new THREE.HemisphereLight(0xeaf2ff, 0x6b7280, 1.9);
  scene.add(hemi);

  // Key light, casting the shadow that gives the vehicle its sense of mass.
  const key = new THREE.DirectionalLight(0xfff6e8, 2.6);
  key.position.set(22, 52, 18);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 160;
  const shadowSpan = 46;
  key.shadow.camera.left = -shadowSpan;
  key.shadow.camera.right = shadowSpan;
  key.shadow.camera.top = shadowSpan;
  key.shadow.camera.bottom = -shadowSpan;
  key.shadow.bias = -0.0004;
  scene.add(key);

  // Fill from the opposite side so nothing reads as a silhouette.
  const fill = new THREE.DirectionalLight(0xcfe0ff, 1.25);
  fill.position.set(-26, 34, -20);
  scene.add(fill);

  // Overhead high-bay fixtures: a grid of them, as the real building has.
  const fixtureMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xfff8ec,
    emissiveIntensity: 2.8,
  });
  const flickerLights: THREE.PointLight[] = [];
  for (let gx = -2; gx <= 2; gx++) {
    for (let gz = -1; gz <= 1; gz++) {
      const x = gx * 13;
      const z = gz * 15;

      const housing = new THREE.Mesh(
        new THREE.BoxGeometry(3.4, 0.3, 1.2),
        fixtureMat,
      );
      housing.position.set(x, VAB_HEIGHT - 3.0, z);
      scene.add(housing);

      const lamp = new THREE.PointLight(0xfff4e2, 42, 62, 2);
      lamp.position.set(x, VAB_HEIGHT - 4.2, z);
      scene.add(lamp);
      flickerLights.push(lamp);
    }
  }

  // Work lights low down around the stand, so the base of the vehicle and the
  // player's own hands are lit.
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const work = new THREE.PointLight(0xffffff, 26, 30, 2);
    work.position.set(Math.cos(angle) * 11, 6.5, Math.sin(angle) * 11);
    scene.add(work);
  }

  const baseIntensities = flickerLights.map((l) => l.intensity);

  /** Y of each gantry platform, matching the loop that built them. */
  const platformHeights: number[] = [];
  for (let i = 0; i < levels; i++) platformHeights.push(4 + i * 5.2);

  const LADDER_X = 10.4;
  const LADDER_TOP = 45.6;

  // Structural columns and gantry legs are solid too — walking through a
  // support column reads as badly as walking through the rocket.
  const structureObstacles = [
    ...stationObstacles,
    { x: 10.4, z: 2.0, radius: 0.7, top: VAB_HEIGHT * 0.85 },
    { x: 10.4, z: -2.0, radius: 0.7, top: VAB_HEIGHT * 0.85 },
  ];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      structureObstacles.push({
        x: sx * (halfW - 1.4),
        z: sz * (halfD - 1.4),
        radius: 1.1,
        top: VAB_HEIGHT,
      });
    }
  }

  return {
    scene,
    materials: mats,
    assemblyRoot,
    staticObstacles: structureObstacles,

    isAtPlatformLevel(feetY: number) {
      return platformHeights.some((h) => Math.abs(h - feetY) < 0.6);
    },

    ladderAt(x: number, z: number) {
      // Generous radius: a climber fumbling for the ladder should find it.
      const near = Math.abs(x - LADDER_X) < 1.5 && Math.abs(z) < 1.5;
      return near ? { x: LADDER_X, top: LADDER_TOP } : null;
    },

    supportHeightAt(x: number, z: number, feetY: number) {
      // Off the gantry footprint there is only the bay floor.
      const onPlatformX = Math.abs(x - 7.2) <= 3.5;
      const onPlatformZ = Math.abs(z) <= 2.2;
      const onLadderColumn = Math.abs(x - LADDER_X) < 1.1 && Math.abs(z) < 1.1;
      if (!((onPlatformX && onPlatformZ) || onLadderColumn)) return 0;

      // Standing on the highest platform at or just below the feet, so
      // climbing past one lands the player on it rather than on the floor.
      let best = 0;
      for (const h of platformHeights) {
        if (h <= feetY + 0.35 && h > best) best = h;
      }
      return best;
    },

    update(elapsed: number) {
      // Very subtle variation in the work lights. Industrial rooms are never
      // perfectly still, and a tiny flicker reads as life rather than as a bug.
      for (let i = 0; i < flickerLights.length; i++) {
        const lamp = flickerLights[i];
        const base = baseIntensities[i];
        if (!lamp || base === undefined) continue;
        const n =
          Math.sin(elapsed * 2.3 + i * 1.7) * 0.5 +
          Math.sin(elapsed * 7.1 + i * 3.1) * 0.5;
        lamp.intensity = base * (1 + n * 0.018);
      }
    },
  };
}
