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
/**
 * Height of the car floor when parked at the bottom.
 *
 * Deliberately above the bay floor. At 0.0 the deck's top face and the floor
 * plane were both at y = 0.00 exactly, and the two coplanar surfaces z-fought —
 * the floor appeared to lag and shimmer around the car. A small sill is also
 * what a real lift looks like.
 */
export const BOTTOM = 0.08;
/**
 * Highest the car can travel, which is the shaft limit rather than the working
 * stop.
 *
 * The actual stop is set per trip by `setWorkingHeight`, because booster
 * heights vary from 38 to 47 m: a fixed stop cannot put the attach point in
 * view for all three. An earlier fixed 45.6 m stop left the payload 38 degrees
 * overhead, outside the field of view, so the placement preview was invisible.
 */
export const SHAFT_TOP = 82;
/** Default working stop, used before any stack exists. */
export const TOP = 52;
/** Travel speed. Slow enough to feel like machinery, quick enough not to bore. */
export const SPEED = 5.4;
/** How far the work deck reaches from the car toward the stack. Metres. */
export const DECK_REACH = 7.0;

export type ElevatorState =
  | 'atBottom'
  | 'rising'
  | 'atTop'
  | 'descending'
  | 'calledDown'
  | 'calledUp';

export interface ElevatorRig {
  group: THREE.Group;
  /**
   * Set where the car should stop at the top.
   *
   * Called with the current stack top so the player arrives level with the
   * work, whichever booster they chose.
   */
  setWorkingHeight: (attachY: number) => void;
  /** The stop the car is currently using. */
  workingHeight: number;
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
  /** True when the given floor position is on the car or its work deck. */
  contains: (x: number, z: number) => boolean;
  /** True when the player is at the control panel, inside the car itself. */
  atControls: (x: number, z: number) => boolean;
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
        new THREE.BoxGeometry(0.2, SHAFT_TOP + 6, 0.2),
        frameMat,
      );
      rail.position.set(ELEVATOR_X + side, (SHAFT_TOP + 6) / 2 + 0.1, ELEVATOR_Z + z);
      rail.castShadow = true;
      group.add(rail);
    }
  }
  // Cross bracing every few metres.
  for (let y = 3; y < SHAFT_TOP + 4; y += 4.5) {
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

  // Cantilevered work deck reaching toward the stack.
  //
  // Without this the car stopped level with the work and there was nothing
  // between it and the rocket, so the player fell through the gap. The deck
  // bridges that, and it is what a real service platform looks like.
  const REACH = DECK_REACH;
  const bridge = new THREE.Mesh(
    new THREE.BoxGeometry(REACH, 0.16, CAR_HALF * 2),
    deckMat,
  );
  bridge.position.set(-CAR_HALF - REACH / 2, -0.08, 0);
  bridge.receiveShadow = true;
  bridge.castShadow = true;
  car.add(bridge);

  // Handrails along both sides of the bridge, open at the far end where the
  // work happens.
  for (const rz of [-CAR_HALF, CAR_HALF]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(REACH, 0.08, 0.08),
      cageMat,
    );
    rail.position.set(-CAR_HALF - REACH / 2, 1.05, rz);
    car.add(rail);

    for (let i = 0; i <= 3; i++) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 1.05, 8),
        cageMat,
      );
      post.position.set(-CAR_HALF - (REACH / 3) * i, 0.52, rz);
      car.add(post);
    }
  }

  // Toe board along the deck edges, which is what stops tools going over.
  for (const rz of [-CAR_HALF, CAR_HALF]) {
    const toe = new THREE.Mesh(
      new THREE.BoxGeometry(REACH, 0.16, 0.05),
      cageMat,
    );
    toe.position.set(-CAR_HALF - REACH / 2, 0.08, rz);
    car.add(toe);
  }

  // Tread strips on the deck.
  //
  // These sat with their underside at y = -0.01 against a deck whose top
  // surface is at y = 0.00, so the two coplanar faces z-fought and the floor
  // flickered grey and white as the camera moved. They now sit clear of it.
  for (let i = -1; i <= 1; i++) {
    const tread = new THREE.Mesh(
      new THREE.BoxGeometry(CAR_HALF * 1.9, 0.03, 0.12),
      frameMat,
    );
    tread.position.set(0, 0.025, i * 0.9);
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
    workingHeight: TOP,

    setWorkingHeight(attachY: number) {
      // Stand on a deck a little below the attach point, so the work is at
      // chest height and stays inside the field of view.
      const stop = attachY - 1.3;
      rig.workingHeight = Math.max(6, Math.min(SHAFT_TOP, stop));
    },

    contains(x: number, z: number) {
      // Includes the cantilevered work deck, so standing on the bridge is
      // still supported by the car and rides with it.
      const withinZ = Math.abs(z - ELEVATOR_Z) <= CAR_HALF - 0.2;
      const withinX =
        x <= ELEVATOR_X + CAR_HALF - 0.2 &&
        x >= ELEVATOR_X - CAR_HALF - DECK_REACH + 0.2;
      return withinZ && withinX;
    },

    atControls(x: number, z: number) {
      // Only the car itself, not the work deck.
      //
      // `contains` covers the whole platform because the player must ride with
      // it, but the button used to be offered anywhere on that platform — so
      // walking out to the work end still showed "ride back down" and there
      // was no way to place the part. The controls are in the car.
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
      const playerAtTop = playerFeetY > (rig.workingHeight + BOTTOM) / 2;
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
        const target = rig.workingHeight;
        rig.height = Math.min(target, rig.height + SPEED * dt);
        if (rig.height >= target - 1e-6) {
          rig.height = target;
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
