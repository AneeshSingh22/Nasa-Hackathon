import * as THREE from 'three';

/**
 * First-person player controller: WASD movement with mouse-look, constrained to
 * walking on the VAB floor.
 *
 * Uses the Pointer Lock API, which is how every first-person game on the web
 * gets raw relative mouse movement. The browser requires a user gesture to
 * enter pointer lock, so the game opens on a click-to-start overlay.
 */

// A real person walks about 1.4 m/s, but the assembly bay is 46 metres across
// and crossing it at walking pace is tedious. These are game speeds, not
// physical ones — the simulation is honest where it teaches something, and
// generous where realism would only cost the player time.
const WALK_SPEED = 7.4;
const RUN_SPEED = 13.5;
const ACCELERATION = 34;
const DAMPING = 14;
const EYE_HEIGHT = 1.72;
/** Climb rate on a ladder. Slower than walking, as climbing is. */
const CLIMB_SPEED = 4.6;
/** Gravity applied when the player walks off an edge. m/s^2 */
const FALL_GRAVITY = 22;
/** Terminal speed for the fall, so a long drop stays readable. m/s */
const MAX_FALL_SPEED = 32;
const LOOK_SENSITIVITY = 0.0022;
const MAX_PITCH = Math.PI / 2 - 0.02;

export interface PlayerBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export class PlayerController {
  readonly camera: THREE.PerspectiveCamera;
  readonly yawObject: THREE.Object3D;

  private pitch = 0;
  private yaw = 0;
  private velocity = new THREE.Vector3();
  private keys = new Set<string>();
  private locked = false;
  private dragging = false;
  private bounds: PlayerBounds;

  /**
   * Vertical state. The controller was floor-only; the payload has to be
   * fitted from a platform 56 metres up, so the player needs to climb.
   */
  private verticalSpeed = 0;
  /** The floor height the player is currently standing on. */
  private groundHeight = 0;
  /** Set by the scene each frame: can the player climb where they stand? */
  onLadder = false;
  /** X of the ladder the player is on, so climbing stays latched to it. */
  ladderX: number | null = null;
  /** Top of the ladder, so the player cannot climb into the roof. */
  ladderTop = Infinity;
  /**
   * True when the player is on a ladder but level with a platform they could
   * step onto. Forward input then walks instead of climbing, so arriving
   * somewhere is not a trap.
   */
  atLadderRest = false;
  /**
   * Solid obstacles the player cannot walk through, as vertical cylinders.
   *
   * The rocket was a pass-through hologram: the meshes existed but nothing
   * stopped the player, so you could stroll out through the middle of a
   * 300-tonne booster.
   */
  obstacles: Array<{ x: number; z: number; radius: number; top: number }> = [];
  /** Set by the scene each frame: the surface height under the player. */
  supportHeight = 0;
  /**
   * Multiplier on walking speed, for carrying heavy parts. 1 is unencumbered.
   */
  speedFactor = 1;
  /** True while falling, so the HUD and narrator can react. */
  private falling = false;

  /** Fired when the player lands after a fall of consequence. */
  onFall: ((distance: number) => void) | null = null;
  private fallStartY = 0;

  /** Head bob accumulator, so walking feels physical rather than gliding. */
  private bobPhase = 0;

  constructor(camera: THREE.PerspectiveCamera, bounds: PlayerBounds) {
    this.camera = camera;
    this.bounds = bounds;
    this.yawObject = new THREE.Object3D();
    this.yawObject.position.set(0, EYE_HEIGHT, 14);
    // Start looking at the rocket. The player stands at +Z and the stand is at
    // the origin, so the view direction must be -Z, which is yaw 0 — Three.js
    // cameras look down -Z by default. Setting yaw to PI faces the back wall.
    this.yaw = 0;
  }

  get position(): THREE.Vector3 {
    return this.yawObject.position;
  }

  get isLocked(): boolean {
    return this.locked;
  }

  get isFalling(): boolean {
    return this.falling;
  }

  /** Height of the player's feet above the bay floor. */
  get feetHeight(): number {
    return this.yawObject.position.y - EYE_HEIGHT;
  }

  attach(domElement: HTMLElement): () => void {
    const onKeyDown = (e: KeyboardEvent) => {
      this.keys.add(e.code);
      // Stop the page scrolling out from under the game.
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);

    // Only clear held keys when the window itself loses focus (alt-tab). Do
    // not clear on pointer-lock changes: acquiring lock moves focus off the
    // start button, and clearing there drops the keys the player is holding.
    const onBlur = () => this.keys.clear();

    const applyLook = (dx: number, dy: number) => {
      this.yaw -= dx * LOOK_SENSITIVITY;
      this.pitch -= dy * LOOK_SENSITIVITY;
      this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch));
    };

    const onMouseMove = (e: MouseEvent) => {
      if (this.locked) {
        applyLook(e.movementX, e.movementY);
        return;
      }
      // Fallback for when pointer lock is unavailable or was refused: look by
      // dragging with the mouse held down. Without this the game is unplayable
      // in any view that blocks the Pointer Lock API.
      if (this.dragging) {
        applyLook(e.movementX, e.movementY);
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (!this.locked && e.button === 0) this.dragging = true;
    };
    const onMouseUp = () => {
      this.dragging = false;
    };

    const onLockChange = () => {
      this.locked = document.pointerLockElement === domElement;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onLockChange);
    domElement.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onLockChange);
      domElement.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }

  requestLock(domElement: HTMLElement): void {
    void domElement.requestPointerLock();
  }

  releaseLock(): void {
    if (this.locked) document.exitPointerLock();
  }

  /**
   * Movement bindings. Arrow keys are the primary scheme; WASD is kept as an
   * alias because players who already know it reach for it without thinking.
   */
  private static readonly FORWARD = ['ArrowUp', 'KeyW'];
  private static readonly BACK = ['ArrowDown', 'KeyS'];
  private static readonly LEFT = ['ArrowLeft', 'KeyA'];
  private static readonly RIGHT = ['ArrowRight', 'KeyD'];

  private held(codes: readonly string[]): boolean {
    return codes.some((c) => this.keys.has(c));
  }

  /** True while the player is holding a movement key. */
  private get isMoving(): boolean {
    return (
      this.held(PlayerController.FORWARD) ||
      this.held(PlayerController.BACK) ||
      this.held(PlayerController.LEFT) ||
      this.held(PlayerController.RIGHT)
    );
  }

  update(dt: number): void {
    // Build the desired direction in the player's own frame, then rotate it
    // into world space by yaw only — looking up must not make you fly.
    let forward = 0;
    let strafe = 0;
    if (this.held(PlayerController.FORWARD)) forward += 1;
    if (this.held(PlayerController.BACK)) forward -= 1;
    if (this.held(PlayerController.RIGHT)) strafe += 1;
    if (this.held(PlayerController.LEFT)) strafe -= 1;

    // While climbing, the up and down keys drive the climb rather than
    // walking — otherwise holding up carries the player off the ladder's
    // detection radius within a fraction of a second, which reads as climbing
    // being broken immediately.
    //
    // But this must NOT apply merely because the player is standing near a
    // ladder: zeroing forward unconditionally trapped them at the top, unable
    // to step onto the platform they had just climbed to.
    const climbing = this.onLadder && !this.atLadderRest;
    if (climbing) {
      forward = 0;
    }

    const wish = new THREE.Vector3(strafe, 0, -forward);
    if (wish.lengthSq() > 0) {
      wish.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    }

    const base = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')
      ? RUN_SPEED
      : WALK_SPEED;
    const speed = base * this.speedFactor;

    // Accelerate toward the wish direction, damp toward rest otherwise.
    this.velocity.x += (wish.x * speed - this.velocity.x) * Math.min(1, ACCELERATION * dt);
    this.velocity.z += (wish.z * speed - this.velocity.z) * Math.min(1, ACCELERATION * dt);
    if (wish.lengthSq() === 0) {
      const damp = Math.max(0, 1 - DAMPING * dt);
      this.velocity.x *= damp;
      this.velocity.z *= damp;
    }

    const p = this.yawObject.position;
    p.x += this.velocity.x * dt;
    p.z += this.velocity.z * dt;

    // ---- vertical: climbing, standing, falling ----
    this.groundHeight = this.supportHeight;
    const feet = p.y - EYE_HEIGHT;

    // Treat the ladder as a ladder only when the player is actually using it
    // to change height. At a platform level with forward held they are walking
    // off, not climbing, and running the ladder branch then pinned them in
    // place at the top — the trap this flag exists to prevent.
    const wantsUp = this.held(PlayerController.FORWARD);
    const wantsDown = this.held(PlayerController.BACK);
    const usingLadder =
      this.onLadder && (this.atLadderRest ? wantsDown : wantsUp || wantsDown);

    if (usingLadder) {
      let climb = 0;
      if (wantsUp && !this.atLadderRest) climb += 1;
      if (wantsDown) climb -= 1;
      this.verticalSpeed = 0;
      this.falling = false;

      // Latch to the column only while actually moving up or down. Latching
      // whenever the player merely stands near a ladder pinned them to it and
      // fought every attempt to walk off onto the platform.
      if (this.ladderX !== null && climb !== 0) {
        p.x += (this.ladderX - p.x) * Math.min(1, 12 * dt);
        p.z += (0 - p.z) * Math.min(1, 12 * dt);
      }

      p.y += climb * CLIMB_SPEED * dt;

      // Never descend below the surface the ladder starts from.
      const floorHere = this.groundHeight;
      if (p.y - EYE_HEIGHT < floorHere) {
        p.y = floorHere + EYE_HEIGHT;
      }
      // Do not climb past the top of the ladder.
      if (p.y - EYE_HEIGHT > this.ladderTop) {
        p.y = this.ladderTop + EYE_HEIGHT;
      }
    } else if (feet > this.groundHeight + 0.05) {
      // Unsupported: fall.
      if (!this.falling) {
        this.falling = true;
        this.fallStartY = feet;
      }
      this.verticalSpeed = Math.max(
        -MAX_FALL_SPEED,
        this.verticalSpeed - FALL_GRAVITY * dt,
      );
      p.y += this.verticalSpeed * dt;
      if (p.y - EYE_HEIGHT <= this.groundHeight) {
        p.y = this.groundHeight + EYE_HEIGHT;
        const dropped = this.fallStartY - this.groundHeight;
        this.verticalSpeed = 0;
        this.falling = false;
        if (dropped > 3) this.onFall?.(dropped);
      }
    } else {
      // Standing on something.
      p.y = this.groundHeight + EYE_HEIGHT;
      this.verticalSpeed = 0;
      this.falling = false;
    }

    // Keep the player inside the building.
    p.x = Math.max(this.bounds.minX, Math.min(this.bounds.maxX, p.x));
    p.z = Math.max(this.bounds.minZ, Math.min(this.bounds.maxZ, p.z));

    // Head bob, scaled by actual speed so it stops when you stop.
    const groundSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.isMoving && groundSpeed > 0.4) {
      this.bobPhase += dt * groundSpeed * 2.1;
    } else {
      // Ease the bob back to neutral rather than snapping.
      this.bobPhase += dt * 4;
    }
    const bobAmount = this.isMoving ? Math.min(0.035, groundSpeed * 0.005) : 0;
    const bob = Math.sin(this.bobPhase * 2) * bobAmount;
    const sway = Math.cos(this.bobPhase) * bobAmount * 0.5;

    this.camera.position.set(p.x + sway, p.y + bob, p.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  /** Where the player is looking — used for raycasting against parts. */
  lookDirection(): THREE.Vector3 {
    return new THREE.Vector3(0, 0, -1).applyEuler(this.camera.rotation);
  }
}
