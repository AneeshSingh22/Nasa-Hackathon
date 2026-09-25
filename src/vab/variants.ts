import * as THREE from 'three';
import type { Materials, PartDefinition } from './parts';

/**
 * Geometry for the alternative parts.
 *
 * All three boosters used to share one builder and all four payloads another,
 * so the options were visually identical — which defeats the point of offering
 * a choice. Each variant now has a silhouette that matches what the placard
 * says about it: the solid motor looks like a solid motor, the crew capsule
 * looks crewed, the laboratory looks power-hungry.
 */

/**
 * SB-5 solid booster.
 *
 * A segmented casing with the joint bands a solid motor is cast in, and one
 * large nozzle instead of a cluster. Anyone who has seen a shuttle SRB
 * recognises the shape.
 */
export function buildSolidBooster(
  group: THREE.Group,
  part: PartDefinition,
  mats: Materials,
): void {
  const { height, radius } = part;

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 32, 1),
    mats.hull,
  );
  body.position.y = height / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Segment joints: a solid motor is cast in sections and bolted together, and
  // the raised bands are its most recognisable feature.
  const segments = 5;
  for (let i = 1; i < segments; i++) {
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 1.04, radius * 1.04, 0.7, 32),
      mats.hullDark,
    );
    band.position.y = (height / segments) * i;
    group.add(band);
  }

  // One large gimballed nozzle rather than a cluster.
  const nozzle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.75, 1.5, 3.4, 24, 1, true),
    mats.nozzle,
  );
  nozzle.position.y = -1.7;
  nozzle.castShadow = true;
  group.add(nozzle);

  const cap = new THREE.Mesh(new THREE.ConeGeometry(radius, 3.2, 32), mats.accent);
  cap.position.y = height + 1.6;
  group.add(cap);
}

/**
 * LR-95 extended core.
 *
 * Visibly stretched, with extra tank sections, a flared base and four large
 * engines instead of nine small ones, so it reads as the big expensive option.
 */
export function buildExtendedBooster(
  group: THREE.Group,
  part: PartDefinition,
  mats: Materials,
): void {
  const { height, radius } = part;

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 1.06, height, 32, 1),
    mats.hull,
  );
  body.position.y = height / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Insulation bands marking the stretched tank sections.
  for (const fraction of [0.34, 0.62]) {
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 1.02, radius * 1.02, 2.6, 32),
      mats.gold,
    );
    band.position.y = height * fraction;
    group.add(band);
  }

  const interstage = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 1.01, radius * 1.01, 2.2, 32),
    mats.hullDark,
  );
  interstage.position.y = height - 1.1;
  group.add(interstage);

  // Four large engines in a square.
  const bell = new THREE.CylinderGeometry(0.5, 0.92, 2.6, 18, 1, true);
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const nozzle = new THREE.Mesh(bell, mats.nozzle);
    nozzle.position.set(Math.cos(angle) * 1.5, -1.3, Math.sin(angle) * 1.5);
    nozzle.castShadow = true;
    group.add(nozzle);
  }
}

/**
 * RK-8 kerolox upper stage.
 *
 * Bare aluminium with exposed tank ribs rather than the hydrolox stage's gold
 * insulation blanket, and a shorter nozzle. Kerosene needs no cryogenic
 * blanket, which is exactly the trade the placard describes.
 */
export function buildKeroloxUpper(
  group: THREE.Group,
  part: PartDefinition,
  mats: Materials,
): void {
  const { height, radius } = part;

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 32, 1),
    mats.hull,
  );
  body.position.y = height / 2;
  body.castShadow = true;
  group.add(body);

  for (let i = 1; i < 4; i++) {
    const rib = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 1.02, radius * 1.02, 0.3, 32),
      mats.hullDark,
    );
    rib.position.y = (height / 4) * i;
    group.add(rib);
  }

  const nozzle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.36, 0.78, 1.9, 20, 1, true),
    mats.nozzle,
  );
  nozzle.position.y = -0.95;
  nozzle.castShadow = true;
  group.add(nozzle);
}

/** Comsat relay: a small box bus dominated by a communications dish. */
export function buildCommsProbe(
  group: THREE.Group,
  part: PartDefinition,
  mats: Materials,
): void {
  const { height, radius } = part;

  const bus = new THREE.Mesh(
    new THREE.BoxGeometry(radius * 1.4, height * 0.62, radius * 1.4),
    mats.hull,
  );
  bus.position.y = height * 0.31;
  bus.castShadow = true;
  group.add(bus);

  // The defining feature: a large dish on top.
  const dish = new THREE.Mesh(
    new THREE.SphereGeometry(
      radius * 1.05,
      24,
      12,
      0,
      Math.PI * 2,
      0,
      Math.PI / 2.6,
    ),
    mats.hull,
  );
  dish.position.y = height * 0.78;
  dish.rotation.x = Math.PI;
  dish.castShadow = true;
  group.add(dish);

  const feed = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 0.9, 8),
    mats.hullDark,
  );
  feed.position.y = height * 0.86;
  group.add(feed);

  // Small stowed arrays against the bus.
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, height * 0.44, radius * 1.1),
      mats.solar,
    );
    panel.position.set(side * (radius * 0.78), height * 0.33, 0);
    group.add(panel);
  }
}

/** Crew capsule: a blunt cone with a heat shield, windows and a docking ring. */
export function buildCrewCapsule(
  group: THREE.Group,
  part: PartDefinition,
  mats: Materials,
): void {
  const { height, radius } = part;

  // Truncated cone, the shape every crew capsule has ever had.
  const capsule = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.52, radius, height * 0.6, 28, 1),
    mats.hull,
  );
  capsule.position.y = height * 0.42;
  capsule.castShadow = true;
  group.add(capsule);

  // Ablative heat shield underneath.
  const shield = new THREE.Mesh(
    new THREE.SphereGeometry(
      radius * 1.02,
      28,
      10,
      0,
      Math.PI * 2,
      0,
      Math.PI / 3.4,
    ),
    mats.hullDark,
  );
  shield.position.y = height * 0.12;
  shield.rotation.x = Math.PI;
  group.add(shield);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.36, 0.1, 10, 24),
    mats.nozzle,
  );
  ring.position.y = height * 0.74;
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  // Windows, so it reads as crewed at a glance.
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2;
    const pane = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.12), mats.glass);
    pane.position.set(
      Math.cos(angle) * radius * 0.84,
      height * 0.52,
      Math.sin(angle) * radius * 0.84,
    );
    pane.rotation.y = -angle;
    group.add(pane);
  }

  const service = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.92, radius * 0.92, height * 0.2, 24),
    mats.hullDark,
  );
  service.position.y = height * 0.1;
  group.add(service);
}

/** Pressurised laboratory: a long habitable module with large arrays. */
export function buildScienceLab(
  group: THREE.Group,
  part: PartDefinition,
  mats: Materials,
): void {
  const { height, radius } = part;

  const module = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height * 0.68, 28, 1),
    mats.hull,
  );
  module.position.y = height * 0.44;
  module.castShadow = true;
  group.add(module);

  for (const [y, flip] of [
    [height * 0.1, Math.PI],
    [height * 0.78, 0],
  ] as Array<[number, number]>) {
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      mats.hull,
    );
    dome.position.y = y;
    dome.rotation.x = flip;
    group.add(dome);
  }

  // Big arrays: this is the power-hungry payload, and it should look it.
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(radius * 2.6, 0.1, height * 0.42),
      mats.solar,
    );
    panel.position.set(side * (radius + radius * 1.35), height * 0.46, 0);
    panel.castShadow = true;
    group.add(panel);

    const boom = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, radius * 1.1, 8),
      mats.hullDark,
    );
    boom.rotation.z = Math.PI / 2;
    boom.position.set(side * (radius + radius * 0.55), height * 0.46, 0);
    group.add(boom);
  }

  // Radiators, because a pressurised volume has to dump heat.
  for (const side of [-1, 1]) {
    const radiator = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, height * 0.3, radius * 1.2),
      mats.hullDark,
    );
    radiator.position.set(0, height * 0.44, side * (radius + 0.3));
    group.add(radiator);
  }
}
