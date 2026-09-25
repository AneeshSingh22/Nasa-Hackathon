import * as THREE from 'three';

/**
 * The service elevator.
 *
 * Replaces the gantry ladder, which was unfixable in practice: climbing fought
 * the walk input, the latch fought stepping off, and arriving at a platform
 * with a part in hand was a trap. An elevator has none of those failure modes —
 * the player boards, presses a button, and is carried to the top with the ride
 * visible the whole way.
 *
 * It is also what a real vertical assembly building actually has.
 */

export const ELEVATOR_X = 12.5;
export const ELEVATOR_Z = 0;
/** Floor half-extent of the car. Metres. */
export const CAR_HALF = 2.0;
/** Height of the car floor when parked at the bottom. */
export const BOTTOM = 0.0;
/** Height of the car floor at the top working level. */
export const TOP = 45.6;
/** Travel speed. Slow enough to feel like machinery, quick enough not to bore. */
export const SPEED = 4.8;

export type ElevatorState = 'atBottom' | 'rising' | 'atTop' | 'descending';

export interface ElevatorRig {
  group: THREE.Group;
  /** Current height of the car floor. */
  height: number;
  state: ElevatorState;
  /** Advance the car. Returns true while it is moving. */
  update: (dt: number) => boolean;
  /** Ask the car to go to the other end. */
  call: () => void;
  /** True when the given floor position is inside the car. */
  contains: (x: number, z: number) => boolean;
}

export function createElevator(): ElevatorRig {
  const group = new THREE.Group();

  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x9aa3b0,
    metalness: 0.7,
    roughness: 0.35,
  });
  const cageMat = new THREE.MeshStandardMaterial({
    color: 0xffc23d,
    metalness: 0.4,
    roughness: 0.5,
  });
  const deckMat = new THREE.MeshStandardMaterial({
    color: 0x5b646f,
    metalness: 0.5,
    roughness: 0.6,
  });

  // Guide rails running the full height, so the shaft reads as a structure.
  for (const side of [-CAR_HALF - 0.3, CAR_HALF + 0.3]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, TOP + 4, 0.22),
      frameMat,
    );
    rail.position.set(ELEVATOR_X + side, (TOP + 4) / 2, ELEVATOR_Z);
    rail.castShadow = true;
    group.add(rail);
  }

  const car = new THREE.Group();

  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(CAR_HALF * 2, 0.16, CAR_HALF * 2),
    deckMat,
  );
  deck.position.y = -0.08;
  deck.receiveShadow = true;
  deck.castShadow = true;
  car.add(deck);

  // Cage: corner posts and handrails, open on the side facing the rocket so
  // the player can see and reach the stack.
  for (const cx of [-CAR_HALF, CAR_HALF]) {
    for (const cz of [-CAR_HALF, CAR_HALF]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 2.2, 8),
        cageMat,
      );
      post.position.set(cx, 1.1, cz);
      car.add(post);
    }
  }
  for (const cz of [-CAR_HALF, CAR_HALF]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(CAR_HALF * 2, 0.08, 0.08),
      cageMat,
    );
    rail.position.set(0, 1.08, cz);
    car.add(rail);
  }
  const backRail = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.08, CAR_HALF * 2),
    cageMat,
  );
  backRail.position.set(CAR_HALF, 1.08, 0);
  car.add(backRail);

  // Call panel, so the control has a physical presence in the car.
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.5, 0.36),
    new THREE.MeshStandardMaterial({
      color: 0x2b3340,
      metalness: 0.5,
      roughness: 0.5,
    }),
  );
  panel.position.set(CAR_HALF - 0.06, 1.25, CAR_HALF - 0.5);
  car.add(panel);

  const button = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.07, 0.05, 12),
    new THREE.MeshStandardMaterial({
      color: 0x5fd99a,
      emissive: 0x5fd99a,
      emissiveIntensity: 1.4,
    }),
  );
  button.rotation.z = Math.PI / 2;
  button.position.set(CAR_HALF - 0.12, 1.3, CAR_HALF - 0.5);
  car.add(button);

  car.position.set(ELEVATOR_X, BOTTOM, ELEVATOR_Z);
  group.add(car);

  const rig: ElevatorRig = {
    group,
    height: BOTTOM,
    state: 'atBottom',

    contains(x: number, z: number) {
      return (
        Math.abs(x - ELEVATOR_X) <= CAR_HALF - 0.15 &&
        Math.abs(z - ELEVATOR_Z) <= CAR_HALF - 0.15
      );
    },

    call() {
      if (rig.state === 'atBottom') rig.state = 'rising';
      else if (rig.state === 'atTop') rig.state = 'descending';
      // Mid-travel calls are ignored; the car finishes its run.
    },

    update(dt: number) {
      if (rig.state === 'rising') {
        rig.height = Math.min(TOP, rig.height + SPEED * dt);
        if (rig.height >= TOP - 1e-6) {
          rig.height = TOP;
          rig.state = 'atTop';
        }
      } else if (rig.state === 'descending') {
        rig.height = Math.max(BOTTOM, rig.height - SPEED * dt);
        if (rig.height <= BOTTOM + 1e-6) {
          rig.height = BOTTOM;
          rig.state = 'atBottom';
        }
      }

      car.position.y = rig.height;

      // The button reads green when the car will move, amber while moving.
      const moving = rig.state === 'rising' || rig.state === 'descending';
      const mat = button.material as THREE.MeshStandardMaterial;
      mat.color.set(moving ? 0xffbc4d : 0x5fd99a);
      mat.emissive.set(moving ? 0xffbc4d : 0x5fd99a);
      return moving;
    },
  };

  return rig;
}
