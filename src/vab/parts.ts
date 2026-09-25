import * as THREE from 'three';

/**
 * Procedural geometry for the rocket parts.
 *
 * Built from primitives rather than loaded models: it keeps the whole game in
 * one downloadable bundle with no asset pipeline, and a hackathon cannot afford
 * to spend its last week fighting glTF imports.
 */

export type PartKind = 'booster' | 'upper' | 'payload' | 'fairing';

export interface PartDefinition {
  id: string;
  kind: PartKind;
  name: string;
  /** Height of the part in metres, used for stacking. */
  height: number;
  /** Outer radius in metres. */
  radius: number;
  /** Dry mass, kg — shown on the inspection panel. */
  dryMass: number;
  /** Propellant mass, kg. Zero for payloads. */
  propellantMass: number;
  /** Sea-level thrust, N. Zero for payloads. */
  thrust: number;
  /** Vacuum specific impulse, s. */
  isp: number;
  /** The engineering explanation shown when the player looks at the part. */
  briefing: string;
  /** The single number that makes this part interesting. */
  keyFact: string;
  /** Cost to fit, in millions of dollars. Drives the mission budget. */
  cost: number;
}

export const PART_LIBRARY: PartDefinition[] = [
  {
    id: 'core-booster',
    kind: 'booster',
    name: 'LR-90 Core Booster',
    height: 42,
    radius: 2.7,
    dryMass: 16_000,
    propellantMass: 310_000,
    thrust: 5_900_000,
    isp: 311,
    briefing:
      'Kerosene and liquid oxygen, nine engines, 145 seconds of burn. It carries 310 tonnes of propellant and weighs only 16 tonnes empty — 95% of this stage is fuel, which is what the rocket equation forces on every launch vehicle ever built.',
    keyFact: '5.9 MN thrust · 95% propellant by mass',
    // Costs are in millions of dollars, scaled from real per-unit launch
    // hardware pricing: the first stage dominates, as it does in reality.
    cost: 148,
  },
  {
    id: 'upper-stage',
    kind: 'upper',
    name: 'RL-20 Upper Stage',
    height: 13.5,
    radius: 2.7,
    dryMass: 5_500,
    propellantMass: 95_000,
    thrust: 1_150_000,
    isp: 348,
    briefing:
      'Liquid hydrogen and oxygen. Less thrust than the booster but a far higher specific impulse of 348 seconds, because hydrogen exhaust leaves the nozzle much faster. That efficiency is why almost every orbital rocket switches propellant for the upper stage.',
    keyFact: 'Isp 348 s · 37 s better than the booster',
    cost: 96,
  },
  {
    id: 'telescope',
    kind: 'payload',
    name: 'Orbital Telescope',
    height: 4.2,
    radius: 1.8,
    dryMass: 8_000,
    propellantMass: 0,
    thrust: 0,
    isp: 0,
    briefing:
      'A one-metre survey telescope, eight tonnes. Every kilogram here costs delta-v for the whole rest of the flight: swapping this for the 14-tonne laboratory would take roughly 600 m/s out of your budget.',
    keyFact: '8 t · 100 science · 900 W peak',
    cost: 112,
  },
  {
    id: 'fairing',
    kind: 'fairing',
    name: 'Payload Fairing',
    height: 7.0,
    radius: 2.7,
    dryMass: 1_900,
    propellantMass: 0,
    thrust: 0,
    isp: 0,
    briefing:
      'An aerodynamic shell protecting the payload through the lower atmosphere. It is dead mass you carry to roughly 110 km and then throw away — and without it, dynamic pressure at max-Q would tear the payload apart.',
    keyFact: '1.9 t of mass you deliberately waste',
    cost: 24,
  },
];

/** Materials, created once and shared. */
export function createMaterials() {
  return {
    hull: new THREE.MeshStandardMaterial({
      color: 0xd8dde6,
      metalness: 0.35,
      roughness: 0.42,
    }),
    hullDark: new THREE.MeshStandardMaterial({
      color: 0x2a3446,
      metalness: 0.5,
      roughness: 0.55,
    }),
    accent: new THREE.MeshStandardMaterial({
      color: 0xff6b3d,
      metalness: 0.2,
      roughness: 0.5,
    }),
    nozzle: new THREE.MeshStandardMaterial({
      color: 0x4a4f5c,
      metalness: 0.85,
      roughness: 0.3,
    }),
    gold: new THREE.MeshStandardMaterial({
      color: 0xc9a227,
      metalness: 0.9,
      roughness: 0.25,
    }),
    solar: new THREE.MeshStandardMaterial({
      color: 0x1b2a58,
      metalness: 0.6,
      roughness: 0.28,
    }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x8fd4e8,
      metalness: 0.1,
      roughness: 0.08,
      transparent: true,
      opacity: 0.55,
    }),
  };
}

export type Materials = ReturnType<typeof createMaterials>;

/**
 * Build the mesh for a part. Returns a Group whose origin is at the part's
 * base, so stacking is a matter of summing heights.
 */
export function buildPartMesh(part: PartDefinition, mats: Materials): THREE.Group {
  const group = new THREE.Group();
  group.name = part.id;

  switch (part.kind) {
    case 'booster':
      buildBooster(group, part, mats);
      break;
    case 'upper':
      buildUpperStage(group, part, mats);
      break;
    case 'payload':
      buildTelescope(group, part, mats);
      break;
    case 'fairing':
      buildFairing(group, part, mats);
      break;
  }

  return group;
}

function buildBooster(group: THREE.Group, part: PartDefinition, mats: Materials) {
  const { height, radius } = part;

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 32, 1),
    mats.hull,
  );
  body.position.y = height / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Interstage band at the top, so the stage separation reads visually.
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 1.01, radius * 1.01, 1.6, 32),
    mats.hullDark,
  );
  band.position.y = height - 0.8;
  group.add(band);

  // Orange stripe near the base — a visual cue for scale, and it matches the
  // accent colour the HUD uses for thrust.
  const stripe = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 1.005, radius * 1.005, 2.4, 32),
    mats.accent,
  );
  stripe.position.y = 5;
  group.add(stripe);

  // Nine engine bells in the octaweb arrangement: eight in a ring, one centre.
  const bell = new THREE.CylinderGeometry(0.34, 0.62, 1.9, 16, 1, true);
  for (let i = 0; i < 9; i++) {
    const nozzle = new THREE.Mesh(bell, mats.nozzle);
    if (i === 8) {
      nozzle.position.set(0, -0.95, 0);
    } else {
      const angle = (i / 8) * Math.PI * 2;
      nozzle.position.set(Math.cos(angle) * 1.6, -0.95, Math.sin(angle) * 1.6);
    }
    nozzle.castShadow = true;
    group.add(nozzle);
  }

  // Four grid fins near the top.
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.5, 1.1), mats.hullDark);
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    fin.position.set(Math.cos(angle) * (radius + 0.5), height - 5, Math.sin(angle) * (radius + 0.5));
    fin.rotation.y = -angle;
    group.add(fin);
  }
}

function buildUpperStage(group: THREE.Group, part: PartDefinition, mats: Materials) {
  const { height, radius } = part;

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 32, 1),
    mats.hull,
  );
  body.position.y = height / 2;
  body.castShadow = true;
  group.add(body);

  // Insulation blanket band — hydrolox stages need it, and it gives the stage
  // a distinct silhouette from the booster.
  const blanket = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 1.02, radius * 1.02, height * 0.5, 32),
    mats.gold,
  );
  blanket.position.y = height * 0.42;
  group.add(blanket);

  const nozzle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 1.05, 2.6, 20, 1, true),
    mats.nozzle,
  );
  nozzle.position.y = -1.3;
  nozzle.castShadow = true;
  group.add(nozzle);
}

function buildTelescope(group: THREE.Group, part: PartDefinition, mats: Materials) {
  const { height, radius } = part;

  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 24, 1),
    mats.hullDark,
  );
  barrel.position.y = height / 2;
  barrel.castShadow = true;
  group.add(barrel);

  // Primary mirror, visible down the open end of the barrel.
  const mirror = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.92, 32),
    mats.glass,
  );
  mirror.rotation.x = -Math.PI / 2;
  mirror.position.y = height - 0.05;
  group.add(mirror);

  // Two solar arrays.
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 1.5), mats.solar);
    panel.position.set(side * (radius + 1.8), height * 0.55, 0);
    panel.castShadow = true;
    group.add(panel);

    const boom = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 1.8, 8),
      mats.hullDark,
    );
    boom.rotation.z = Math.PI / 2;
    boom.position.set(side * (radius + 0.9), height * 0.55, 0);
    group.add(boom);
  }

  // High-gain dish.
  const dish = new THREE.Mesh(
    new THREE.SphereGeometry(0.8, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2.4),
    mats.hull,
  );
  dish.position.set(0, height * 0.3, radius + 0.4);
  dish.rotation.x = Math.PI / 2.2;
  group.add(dish);
}

function buildFairing(group: THREE.Group, part: PartDefinition, mats: Materials) {
  const { height, radius } = part;

  // Cylindrical lower section.
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height * 0.45, 32, 1),
    mats.hull,
  );
  barrel.position.y = height * 0.225;
  barrel.castShadow = true;
  group.add(barrel);

  // Ogive nose. A cone reads as a toy; the curved profile is what a real
  // fairing looks like, and it costs nothing extra to generate.
  const profile: THREE.Vector2[] = [];
  const noseHeight = height * 0.55;
  const segments = 16;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    // Ogive: radius falls off as a quarter-sine, giving the classic shape.
    const r = radius * Math.cos((t * Math.PI) / 2) ** 0.72;
    profile.push(new THREE.Vector2(Math.max(0.02, r), t * noseHeight));
  }
  const nose = new THREE.Mesh(new THREE.LatheGeometry(profile, 32), mats.hull);
  nose.position.y = height * 0.45;
  nose.castShadow = true;
  group.add(nose);
}
