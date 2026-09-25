import * as THREE from 'three';

/**
 * First-person player controller: WASD movement with mouse-look, constrained to
 * walking on the VAB floor.
 *
 * Uses the Pointer Lock API, which is how every first-person game on the web
 * gets raw relative mouse movement. The browser requires a user gesture to
 * enter pointer lock, so the game opens on a click-to-start overlay.
 */

const WALK_SPEED = 4.2;
const RUN_SPEED = 8.0;
const ACCELERATION = 26;
const DAMPING = 11;
const EYE_HEIGHT = 1.72;
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
  private bounds: PlayerBounds;

  /** Head bob accumulator, so walking feels physical rather than gliding. */
  private bobPhase = 0;

  constructor(camera: THREE.PerspectiveCamera, bounds: PlayerBounds) {
    this.camera = camera;
    this.bounds = bounds;
    this.yawObject = new THREE.Object3D();
    this.yawObject.position.set(0, EYE_HEIGHT, 14);
    this.yaw = Math.PI; // start facing the rocket, which sits at -Z
  }

  get position(): THREE.Vector3 {
    return this.yawObject.position;
  }

  get isLocked(): boolean {
    return this.locked;
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
    const onBlur = () => this.keys.clear();

    const onMouseMove = (e: MouseEvent) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * LOOK_SENSITIVITY;
      this.pitch -= e.movementY * LOOK_SENSITIVITY;
      this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch));
    };

    const onLockChange = () => {
      this.locked = document.pointerLockElement === domElement;
      if (!this.locked) this.keys.clear();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onLockChange);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onLockChange);
    };
  }

  requestLock(domElement: HTMLElement): void {
    void domElement.requestPointerLock();
  }

  releaseLock(): void {
    if (this.locked) document.exitPointerLock();
  }

  /** True while the player is holding a movement key. */
  private get isMoving(): boolean {
    return (
      this.keys.has('KeyW') ||
      this.keys.has('KeyA') ||
      this.keys.has('KeyS') ||
      this.keys.has('KeyD')
    );
  }

  update(dt: number): void {
    // Build the desired direction in the player's own frame, then rotate it
    // into world space by yaw only — looking up must not make you fly.
    let forward = 0;
    let strafe = 0;
    if (this.keys.has('KeyW')) forward += 1;
    if (this.keys.has('KeyS')) forward -= 1;
    if (this.keys.has('KeyD')) strafe += 1;
    if (this.keys.has('KeyA')) strafe -= 1;

    const wish = new THREE.Vector3(strafe, 0, -forward);
    if (wish.lengthSq() > 0) {
      wish.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    }

    const speed = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')
      ? RUN_SPEED
      : WALK_SPEED;

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
