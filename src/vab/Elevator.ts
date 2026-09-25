import * as THREE from 'three';

/**
 * The service elevator.
 *
 * Replaces the gantry ladder, which could not be made to work: climbing fought
 * the walk input, the latch fought stepping off, and arriving at a platform
 * with a part in hand was a dead end.
 *
 * The car has a proper enclosure, a call button at the bottom and a floor
 * indicator, because an open platform that teleported the player around read as
 * unfinished. It also has to be *called* down before you can board it, which is
 * how a real lift behaves and removes the bug where stepping off at the top
 * left the car stranded up there.
 */

export const ELEVATOR_X = 12.5;
export const ELEVATOR_Z = 0;
/** Floor half-extent of the car. Metres. */
export const CAR_HALF = 2.1;
/** Height of the car floor when parked at the bottom. */
export const BOTTOM = 0.0;
/**
 * Height of the car floor at the top working level.
 *
 * Chosen so that both high slots sit within the player's field of view. The
 * payload attaches at 57.1 m and the fairing at 61.3 m; stopping at 57.5 puts
 * them 28 degrees below and above the camera, inside the 36-degree half-FOV.
 * An earlier stop at 45.6 m put the payload 38 degrees overhead, so the
 * placement preview was off-screen unless the player happened to look up.
 */
export const TOP = 57.5;
/** Travel speed. Slow enough to feel like machinery, quick enough not to bore. */
export const SPEED = 5.4;

export type ElevatorState =
  | 'atBottom'
  | 'rising'
  | 'atTop'
  | 'descending'
  | 'calledDown'
  | 'calledUp';

export interface ElevatorRig {
  group: THREE.Group;
  /** Current height of the car floor. */
  height: number;
  state: ElevatorState;
  /** Advance the car. Returns true while it is moving. */
  update: (dt: number) => boolean;
  /**
   * Press the button.
   *
   * From inside the car this sends it to the other end. From outside it calls
   * the car to the player's level first, which is why stepping off at the top
   * no longer strands it.
   */
  press: (playerFeetY: number, aboard: boolean) => 'travelling' | 'calling' | 'busy';
  /** True when the given floor position is inside the car. */
  contains: (x: number, z: number) => boolean;
  /** True when the car is level with this height and safe to board. */
  isLevelWith: (feetY: number) => boolean;
  /** Human-readable state for the HUD. */
  describe: () => string;
}

export function createElevator(): ElevatorRig {
  const group = new THREE.Group();

  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x8d96a4,
    metalness: 0.72,
    roughness: 0.34,
  });
  const cageMat = new THREE.MeshStandardMaterial({
    color: 0xffc23d,
    metalness: 0.4,
    roughness: 0.5,
  });
  const deckMat = new THREE.MeshStandardMaterial({
    color: 0x4e5763,
    metalness: 0.5,
    roughness: 0.62,
  });
  const meshMat = new THREE.MeshStandardMaterial({
    color: 0x6d7683,
    metalness: 0.6,
    roughness: 0.45,
    transparent: true,
    opacity: 0.35,
  });
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0x232b38,
    metalness: 0.5,
    roughness: 0.48,
  });

  // ---- shaft structure ----
  // Guide rails and lattice bracing running the full height, so the shaft
  // reads as a structure rather than the car floating on nothing.
  for (const side of [-CAR_HALF - 0.35, CAR_HALF + 0.35]) {
    for (const z of [-CAR_HALF, CAR_HALF]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, TOP + 6, 0.2),
        frameMat,
      );
      rail.position.set(ELEVATOR_X + side, (TOP + 6) / 2, ELEVATOR_Z + z);
      rail.castShadow = true;
      group.add(rail);
    }
  }
  // Cross bracing every few metres.
  for (let y = 3; y < TOP + 4; y += 4.5) {
    for (const side of [-CAR_HALF - 0.35, CAR_HALF + 0.35]) {
      const brace = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.12, CAR_HALF * 2),
        frameMat,
      );
      brace.position.set(ELEVATOR_X + side, y, ELEVATOR_Z);
      group.add(brace);
    }
  }

  // ---- the car ----
  const car = new THREE.Group();

  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(CAR_HALF * 2, 0.18, CAR_HALF * 2),
    deckMat,
  );
  deck.position.y = -0.09;
  deck.receiveShadow = true;
  deck.castShadow = true;
  car.add(deck);

  // Tread plate pattern on the deck, so the floor is not a blank square.
  for (let i = -1; i <= 1; i++) {
    const tread = new THREE.Mesh(
      new THREE.BoxGeometry(CAR_HALF * 1.9, 0.02, 0.1),
      frameMat,
    );
    tread.position.set(0, 0.02, i * 0.9);
    car.add(tread);
  }

  // Ceiling with a light, which is what makes it read as a car rather than a
  // platform.
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(CAR_HALF * 2, 0.12, CAR_HALF * 2),
    deckMat,
  );
  roof.position.y = 2.45;
  car.add(roof);

  const dome = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.08, 0.9),
    new THREE.MeshStandardMaterial({
      color: 0xfff6e4,
      emissive: 0xfff2d8,
      emissiveIntensity: 2.2,
    }),
  );
  dome.position.y = 2.36;
  car.add(dome);

  const carLight = new THREE.PointLight(0xfff4e2, 9, 9, 2);
  carLight.position.y = 2.1;
  car.add(carLight);

  // Three walls of mesh panel; the side facing the rocket stays open so the
  // player can see and reach the stack.
  const wallSpecs: Array<[number, number, number]> = [
    [CAR_HALF, 0, 0], // back, away from the rocket
    [0, 0, CAR_HALF],
    [0, 0, -CAR_HALF],
  ];
  for (const [wx, , wz] of wallSpecs) {
    const isBack = wx !== 0;
    const wall = new THREE.Mesh(
      isBack
        ? new THREE.BoxGeometry(0.06, 2.4, CAR_HALF * 2)
        : new THREE.BoxGeometry(CAR_HALF * 2, 2.4, 0.06),
      meshMat,
    );
    wall.position.set(wx, 1.2, wz);
    car.add(wall);

    // Frame around each panel.
    const frameTop = new THREE.Mesh(
      isBack
        ? new THREE.BoxGeometry(0.1, 0.1, CAR_HALF * 2)
        : new THREE.BoxGeometry(CAR_HALF * 2, 0.1, 0.1),
      cageMat,
    );
    frameTop.position.set(wx, 2.4, wz);
    car.add(frameTop);
  }

  // Corner posts.
  for (const cx of [-CAR_HALF, CAR_HALF]) {
    for (const cz of [-CAR_HALF, CAR_HALF]) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.11, 2.5, 0.11),
        cageMat,
      );
      post.position.set(cx, 1.25, cz);
      car.add(post);
    }
  }

  // Waist-height safety bar across the open side, so the opening reads as a
  // doorway rather than a missing wall.
  const bar = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.09, CAR_HALF * 2),
    cageMat,
  );
  bar.position.set(-CAR_HALF, 1.05, 0);
  car.add(bar);

  // ---- control panel inside the car ----
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 0.5), panelMat);
  panel.position.set(CAR_HALF - 0.08, 1.35, CAR_HALF - 0.7);
  car.add(panel);

  const button = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.075, 0.06, 14),
    new THREE.MeshStandardMaterial({
      color: 0x5fd99a,
      emissive: 0x5fd99a,
      emissiveIntensity: 1.6,
    }),
  );
  button.rotation.z = Math.PI / 2;
  button.position.set(CAR_HALF - 0.15, 1.45, CAR_HALF - 0.7);
  car.add(button);

  // Floor indicator: two lamps showing which end the car is heading for.
  const lamps: THREE.Mesh[] = [];
  for (let i = 0; i < 2; i++) {
    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.12, 0.12),
      new THREE.MeshStandardMaterial({
        color: 0x2b3340,
        emissive: 0x000000,
        emissiveIntensity: 0,
      }),
    );
    lamp.position.set(CAR_HALF - 0.14, 1.66 - i * 0.18, CAR_HALF - 0.7);
    car.add(lamp);
    lamps.push(lamp);
  }

  car.position.set(ELEVATOR_X, BOTTOM, ELEVATOR_Z);
  group.add(car);

  // ---- landing call station at the bottom ----
  const callPost = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 1.35, 0.26),
    panelMat,
  );
  callPost.position.set(ELEVATOR_X - CAR_HALF - 1.0, 0.68, ELEVATOR_Z);
  group.add(callPost);

  const callButton = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 0.07, 14),
    new THREE.MeshStandardMaterial({
      color: 0xffbc4d,
      emissive: 0xffbc4d,
      emissiveIntensity: 1.5,
    }),
  );
  callButton.rotation.x = Math.PI / 2;
  callButton.position.set(ELEVATOR_X - CAR_HALF - 1.0, 1.15, ELEVATOR_Z - 0.16);
  group.add(callButton);

  const rig: ElevatorRig = {
    group,
    height: BOTTOM,
    state: 'atBottom',

    contains(x: number, z: number) {
      return (
        Math.abs(x - ELEVATOR_X) <= CAR_HALF - 0.2 &&
        Math.abs(z - ELEVATOR_Z) <= CAR_HALF - 0.2
      );
    },

    isLevelWith(feetY: number) {
      return Math.abs(rig.height - feetY) < 1.2;
    },

    describe() {
      switch (rig.state) {
        case 'atBottom':
          return 'Car at ground level';
        case 'atTop':
          return 'Car at work platform';
        case 'rising':
        case 'calledUp':
          return `Ascending — ${rig.height.toFixed(0)} m`;
        case 'descending':
        case 'calledDown':
          return `Descending — ${rig.height.toFixed(0)} m`;
      }
    },

    press(playerFeetY: number, aboard: boolean) {
      const moving =
        rig.state === 'rising' ||
        rig.state === 'descending' ||
        rig.state === 'calledDown' ||
        rig.state === 'calledUp';
      if (moving) return 'busy';

      if (aboard) {
        // Inside: go to the other end.
        rig.state = rig.state === 'atBottom' ? 'rising' : 'descending';
        return 'travelling';
      }

      // Outside: bring the car to the player rather than teleporting them.
      // This is the fix for stepping off at the top and stranding it there.
      const playerAtTop = playerFeetY > (TOP + BOTTOM) / 2;
      if (playerAtTop && rig.state === 'atBottom') {
        rig.state = 'calledUp';
        return 'calling';
      }
      if (!playerAtTop && rig.state === 'atTop') {
        rig.state = 'calledDown';
        return 'calling';
      }
      // Already here.
      return 'travelling';
    },

    update(dt: number) {
      const goingUp = rig.state === 'rising' || rig.state === 'calledUp';
      const goingDown = rig.state === 'descending' || rig.state === 'calledDown';

      if (goingUp) {
        rig.height = Math.min(TOP, rig.height + SPEED * dt);
        if (rig.height >= TOP - 1e-6) {
          rig.height = TOP;
          rig.state = 'atTop';
        }
      } else if (goingDown) {
        rig.height = Math.max(BOTTOM, rig.height - SPEED * dt);
        if (rig.height <= BOTTOM + 1e-6) {
          rig.height = BOTTOM;
          rig.state = 'atBottom';
        }
      }

      car.position.y = rig.height;

      const moving = goingUp || goingDown;

      const buttonMat = button.material as THREE.MeshStandardMaterial;
      buttonMat.color.set(moving ? 0xffbc4d : 0x5fd99a);
      buttonMat.emissive.set(moving ? 0xffbc4d : 0x5fd99a);

      // Indicator lamps: top lamp lit going up, bottom lamp going down.
      lamps.forEach((lamp, i) => {
        const mat = lamp.material as THREE.MeshStandardMaterial;
        const lit = (i === 0 && goingUp) || (i === 1 && goingDown);
        mat.emissive.set(lit ? 0x5fd99a : 0x000000);
        mat.emissiveIntensity = lit ? 1.8 : 0;
      });

      return moving;
    },
  };

  return rig;
}
