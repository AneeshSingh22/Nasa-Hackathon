import * as THREE from 'three';
import { createMaterials, type Materials } from './parts';
import { STATIONS } from './stations';
import { placardFor } from './placards';
import { createElevator, type ElevatorRig } from './Elevator';
import { createBlueprintBoard, type BlueprintState } from './blueprint';

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
  /** True when this height is level with a platform the player can step onto. */
  isAtPlatformLevel: (feetY: number) => boolean;
  /**
   * Everything solid in the room, as vertical cylinders.
   *
   * The benches, the gantry legs and the structural columns. The vehicle
   * itself is added by the caller, since it grows as it is built.
   */
  staticObstacles: Array<{ x: number; z: number; radius: number; top: number }>;
  /** The service elevator, which the caller drives and rides. */
  elevator: ElevatorRig;
  /** Redraw the blueprint board after a part is fitted. */
  refreshBlueprint: (state: BlueprintState) => void;
}

export function createVABScene(): VABEnvironment {
  const scene = new THREE.Scene();
  // A real high bay is painted white and lit hard. The first version was a
  // dark warehouse, which looked atmospheric and read as unfinished.
  scene.background = new THREE.Color(0x141c29);
  scene.fog = new THREE.Fog(0x18212f, 70, 190);

  const mats = createMaterials();

  const concrete = new THREE.MeshStandardMaterial({
    color: 0x6f7885,
    roughness: 0.88,
    metalness: 0.02,
  });
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xa8b0bd,
    roughness: 0.8,
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

    // Angled placard carrying the part's name, a schematic and its numbers.
    // Blank white boards left the bay unreadable: identical grey benches with
    // no way to tell which held what without walking up to every one.
    const texture = placardFor(station.partId, station.label, station.bay);
    const faceMat = texture
      ? new THREE.MeshStandardMaterial({ map: texture, roughness: 0.82, metalness: 0.0 })
      : placardMat;

    const placard = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.1, 0.08), [
      placardMat, placardMat, placardMat, placardMat, faceMat, placardMat,
    ]);
    placard.position.set(0, 2.05, -0.95);
    placard.rotation.x = -0.26;
    placard.castShadow = true;
    bench.add(placard);

    // A small stand light over the sign, so it is legible from a distance.
    const signLight = new THREE.PointLight(0xfff6e6, 3.4, 9, 2);
    signLight.position.set(0, 3.3, 0.6);
    bench.add(signLight);

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

  // ---- service elevator ----
  // Replaces the gantry ladder, which could not be made to work: climbing
  // fought walking, the latch fought stepping off, and arriving at the top
  // holding a part was a dead end.
  const elevator = createElevator();
  scene.add(elevator.group);

  // ---- blueprint board ----
  // A wall-sized exploded diagram showing every slot and which are done.
  // Reading ten near-identical placards to work out what was missing was the
  // most confusing thing in the bay; a diagram answers it at a glance.
  const blueprint = createBlueprintBoard({ fitted: new Map(), nextKind: 'booster' });
  blueprint.group.position.set(-4, 0, 21.4);
  scene.add(blueprint.group);

  // ---- laboratory fittings ----
  // None of this is interactive. It exists because an assembly building with
  // nothing but benches in it reads as an empty grey box, and a real facility
  // is full of equipment, signage and clutter.
  const decorMat = new THREE.MeshStandardMaterial({
    color: 0x7f8794,
    metalness: 0.45,
    roughness: 0.55,
  });
  const screenMat = new THREE.MeshStandardMaterial({
    color: 0x0e2233,
    emissive: 0x1d5f86,
    emissiveIntensity: 0.9,
    roughness: 0.3,
  });
  const crateMat = new THREE.MeshStandardMaterial({
    color: 0x3f4a58,
    metalness: 0.2,
    roughness: 0.82,
  });
  const cabinetMat = new THREE.MeshStandardMaterial({
    color: 0xb9c0cb,
    metalness: 0.3,
    roughness: 0.62,
  });

  // A bank of mission-control consoles along the front wall, facing the
  // vehicle, each with a lit screen.
  for (let i = 0; i < 6; i++) {
    const consoleGroup = new THREE.Group();
    const x = -13 + i * 5.2;

    const desk = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.12, 1.8), decorMat);
    desk.position.y = 0.85;
    desk.castShadow = true;
    consoleGroup.add(desk);

    for (const lx of [-1.8, 1.8]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.85, 1.6), decorMat);
      leg.position.set(lx, 0.425, 0);
      consoleGroup.add(leg);
    }

    // Two monitors per station, angled toward the operator.
    for (const mx of [-1.0, 1.0]) {
      const monitor = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.0, 0.07), screenMat);
      monitor.position.set(mx, 1.52, -0.45);
      monitor.rotation.x = 0.16;
      consoleGroup.add(monitor);

      const stalk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 0.35, 8),
        decorMat,
      );
      stalk.position.set(mx, 1.08, -0.45);
      consoleGroup.add(stalk);
    }

    // Operator chair, so the consoles read as staffed.
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.34, 0.12, 14), crateMat);
    seat.position.set(0, 0.52, 1.5);
    consoleGroup.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.62, 0.1), crateMat);
    back.position.set(0, 0.86, 1.82);
    consoleGroup.add(back);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8), decorMat);
    stem.position.set(0, 0.27, 1.5);
    consoleGroup.add(stem);

    consoleGroup.position.set(x, 0, 19.5);
    consoleGroup.rotation.y = Math.PI;
    scene.add(consoleGroup);
  }

  // Tall equipment cabinets and instrument racks against the walls.
  const rackPositions: Array<[number, number, number]> = [
    [-28, 17, Math.PI / 2],
    [-28, -17, Math.PI / 2],
    [28, 14, -Math.PI / 2],
    [28, -1, -Math.PI / 2],
    [28, 8, -Math.PI / 2],
  ];
  for (const [x, z, ry] of rackPositions) {
    const rack = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.4, 0.9), cabinetMat);
    body.position.y = 1.2;
    body.castShadow = true;
    rack.add(body);

    // Rack units, as horizontal bands.
    for (let u = 0; u < 5; u++) {
      const unit = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.28, 0.06), screenMat);
      unit.position.set(0, 0.5 + u * 0.42, 0.48);
      rack.add(unit);
    }

    rack.position.set(x, 0, z);
    rack.rotation.y = ry;
    scene.add(rack);
  }

  // Shipping crates and tool chests scattered where they would actually be:
  // near the benches and out of the crane's path.
  const cratePositions: Array<[number, number, number, number]> = [
    [-17, 15, 2.2, 1.6],
    [-9, 15, 1.6, 1.2],
    [19, 4, 2.6, 1.8],
    [21, -17, 1.8, 1.4],
    [-19, -19, 2.0, 1.5],
    [11, 15, 1.4, 1.1],
  ];
  for (const [x, z, w, h] of cratePositions) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.8), crateMat);
    crate.position.set(x, h / 2, z);
    crate.rotation.y = (x * 0.7 + z) % 1.2;
    crate.castShadow = true;
    crate.receiveShadow = true;
    scene.add(crate);

    // Hazard stripe on the lid, which is what makes a box read as equipment.
    const lid = new THREE.Mesh(
      new THREE.BoxGeometry(w * 1.01, 0.06, w * 0.81),
      paint,
    );
    lid.position.set(x, h + 0.03, z);
    lid.rotation.y = crate.rotation.y;
    scene.add(lid);
  }

  // Gas cylinder banks, strapped together as they always are.
  for (const [bx, bz] of [[-27, 6], [27, -12]] as Array<[number, number]>) {
    for (let i = 0; i < 4; i++) {
      const cyl = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.28, 1.9, 14),
        i % 2 === 0
          ? new THREE.MeshStandardMaterial({ color: 0x2f7f52, metalness: 0.6, roughness: 0.4 })
          : new THREE.MeshStandardMaterial({ color: 0x8a5a2b, metalness: 0.6, roughness: 0.4 }),
      );
      cyl.position.set(bx + (i % 2) * 0.62, 0.95, bz + Math.floor(i / 2) * 0.62);
      cyl.castShadow = true;
      scene.add(cyl);
    }
  }

  // Overhead crane bridge, spanning the bay. The single most recognisable
  // thing in a vehicle assembly building.
  const craneBridge = new THREE.Group();
  const girder = new THREE.Mesh(
    new THREE.BoxGeometry(VAB_WIDTH - 4, 1.3, 1.6),
    decorMat,
  );
  girder.position.y = VAB_HEIGHT - 8;
  craneBridge.add(girder);
  const hoist = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 2.4), paint);
  hoist.position.set(-2, VAB_HEIGHT - 9.4, 0);
  craneBridge.add(hoist);
  // Hook block on a cable.
  const cable = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 14, 6),
    decorMat,
  );
  cable.position.set(-2, VAB_HEIGHT - 17.2, 0);
  craneBridge.add(cable);
  const hook = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 1.1), decorMat);
  hook.position.set(-2, VAB_HEIGHT - 24.5, 0);
  craneBridge.add(hook);
  craneBridge.position.z = 6;
  scene.add(craneBridge);

  // Wall signage: large bay letters, which is how these buildings are actually
  // marked up.
  const signMat = new THREE.MeshStandardMaterial({
    color: 0xf2f5f9,
    emissive: 0x9fb4cc,
    emissiveIntensity: 0.25,
    roughness: 0.85,
  });
  for (const [sx, sz, sry] of [
    [-29.4, 0, Math.PI / 2],
    [29.4, 0, -Math.PI / 2],
  ] as Array<[number, number, number]>) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(14, 2.6, 0.1), signMat);
    board.position.set(sx, 9, sz);
    board.rotation.y = sry;
    scene.add(board);
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
  // Calibrated between the two previous extremes: the first pass was a dark
  // warehouse, the second was flat white glare with no shadow contrast. A real
  // high bay is bright but still has direction and shading.
  scene.add(new THREE.AmbientLight(0xc2ccdb, 0.85));

  const hemi = new THREE.HemisphereLight(0xd4e2f5, 0x4a5364, 0.75);
  scene.add(hemi);

  // Key light, casting the shadow that gives the vehicle its sense of mass.
  const key = new THREE.DirectionalLight(0xfff4e4, 1.55);
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
  const fill = new THREE.DirectionalLight(0xbfd4f0, 0.55);
  fill.position.set(-26, 34, -20);
  scene.add(fill);

  // Overhead high-bay fixtures: a grid of them, as the real building has.
  const fixtureMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xfff8ec,
    emissiveIntensity: 1.6,
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

      const lamp = new THREE.PointLight(0xfff4e2, 16, 46, 2);
      lamp.position.set(x, VAB_HEIGHT - 4.2, z);
      scene.add(lamp);
      flickerLights.push(lamp);
    }
  }

  // Work lights low down around the stand, so the base of the vehicle and the
  // player's own hands are lit.
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const work = new THREE.PointLight(0xfff2dd, 10, 26, 2);
    work.position.set(Math.cos(angle) * 11, 6.5, Math.sin(angle) * 11);
    scene.add(work);
  }

  const baseIntensities = flickerLights.map((l) => l.intensity);

  /** Y of each gantry platform, matching the loop that built them. */
  const platformHeights: number[] = [];
  for (let i = 0; i < levels; i++) platformHeights.push(4 + i * 5.2);


  // Everything with a physical presence is solid. Walking through a console
  // or a gas cylinder reads as badly as walking through the rocket.
  const decorObstacles: Array<{ x: number; z: number; radius: number; top: number }> = [];
  for (let i = 0; i < 6; i++) {
    decorObstacles.push({ x: -13 + i * 5.2, z: 19.5, radius: 2.3, top: 1.7 });
  }
  for (const [x, z] of [
    [-28, 17], [-28, -17], [28, 14], [28, -1], [28, 8],
  ] as Array<[number, number]>) {
    decorObstacles.push({ x, z, radius: 1.2, top: 2.4 });
  }
  for (const [x, z, w, h] of [
    [-17, 15, 2.2, 1.6], [-9, 15, 1.6, 1.2], [19, 4, 2.6, 1.8],
    [21, -17, 1.8, 1.4], [-19, -19, 2.0, 1.5], [11, 15, 1.4, 1.1],
  ] as Array<[number, number, number, number]>) {
    decorObstacles.push({ x, z, radius: w * 0.72, top: h });
  }
  for (const [bx, bz] of [[-27, 6], [27, -12]] as Array<[number, number]>) {
    decorObstacles.push({ x: bx + 0.3, z: bz + 0.3, radius: 1.0, top: 1.9 });
  }

  // Structural columns and gantry legs are solid too.
  const structureObstacles = [
    ...stationObstacles,
    ...decorObstacles,
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
    elevator,
    refreshBlueprint: blueprint.refresh,

    isAtPlatformLevel(feetY: number) {
      return platformHeights.some((h) => Math.abs(h - feetY) < 0.6);
    },

    supportHeightAt(x: number, z: number, feetY: number) {
      // Off the gantry footprint there is only the bay floor. The elevator
      // provides its own support while the player is aboard, handled by the
      // caller.
      const onPlatformX = Math.abs(x - 7.2) <= 3.5;
      const onPlatformZ = Math.abs(z) <= 2.2;
      if (!(onPlatformX && onPlatformZ)) return 0;

      // Standing on the highest platform at or just below the feet.
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
