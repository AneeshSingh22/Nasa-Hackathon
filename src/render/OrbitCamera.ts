import * as THREE from 'three';

/**
 * Limits in metres/radians, sized for a launch vehicle.
 *
 * Sized against the vehicle at `DISPLAY_SCALE`. The tallest stack is 23.6 m
 * and needs roughly 19 m of standoff to frame, so 34 m leaves room to pull
 * back and still stay inside a 46 m-deep bay. Framing the parts at full size
 * needed 72 m, which put the camera outside the building looking in through
 * the wall — the bay then read as a doll's house. Any change to part heights
 * or to DISPLAY_SCALE needs re-checking here.
 *
 * Vertical pan covers the height of the vehicle so the player can inspect the
 * payload on top and the engines underneath. Horizontal pan is tighter:
 * sliding sideways as well as orbiting mostly just loses the vehicle.
 */
export const ORBIT_LIMITS = {
  minDistance: 3, maxDistance: 34,
  minElevation: 0.06, maxElevation: Math.PI / 2 - 0.06,
  panHorizontal: 9, panVertical: 16,
} as const;

/** Lowest the eye may sit, metres above the bay floor. */
export const FLOOR_CLEARANCE = 1.2;

/** Standoff on entering the Workshop: enough to see a whole launch vehicle. */
export const RESET_RADIUS = 21;

/** Owns the shared camera only during Workshop. No simulation state lives here. */
export class OrbitCamera {
  readonly target = new THREE.Vector3();
  private readonly anchor = new THREE.Vector3();
  private azimuth = 0;
  private elevation = 0.35;
  private radius = 10;
  private detachInput: (() => void) | null = null;

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  reset(target: THREE.Vector3): void {
    this.anchor.copy(target);
    this.target.copy(target);
    this.azimuth = 0;
    this.elevation = 0.28;
    this.radius = RESET_RADIUS;
    this.update();
  }

  /**
   * Reframe after assembly changes, preserving the viewing angle.
   *
   * Takes the box half-extents rather than a bounding sphere. A launch vehicle
   * is tall and thin, and its bounding sphere has the radius of the *diagonal*
   * — roughly half again its half-height — so framing the sphere pushed the
   * camera far enough back to leave the building.
   */
  frame(target: THREE.Vector3, halfHeight: number, halfWidth = halfHeight): void {
    this.anchor.copy(target);
    this.target.copy(target);
    const vertical = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const horizontal = Math.atan(Math.tan(vertical) * this.camera.aspect);
    // Whichever axis binds first decides the distance.
    const needed = Math.max(
      halfHeight / Math.tan(vertical),
      halfWidth / Math.tan(horizontal),
    );
    // The camera looks down from an elevation rather than square on, so the
    // top of a tall stack subtends a wider angle than its true half-height
    // implies. Derived rather than guessed: at the default elevation the
    // 23.6 m stack needs about 20 m before its top falls inside the 36-degree
    // vertical half-angle, against 16.3 m looking square on.
    this.radius = THREE.MathUtils.clamp(Math.max(9, needed * 1.29),
      ORBIT_LIMITS.minDistance, ORBIT_LIMITS.maxDistance);
    this.update();
  }

  orbit(azimuthDelta: number, elevationDelta: number): void {
    this.azimuth += azimuthDelta;
    this.elevation = THREE.MathUtils.clamp(
      this.elevation + elevationDelta, ORBIT_LIMITS.minElevation, ORBIT_LIMITS.maxElevation,
    );
    this.update();
  }

  zoom(delta: number): void {
    this.radius = THREE.MathUtils.clamp(
      this.radius * Math.exp(THREE.MathUtils.clamp(delta, -20, 20)),
      ORBIT_LIMITS.minDistance, ORBIT_LIMITS.maxDistance,
    );
    this.update();
  }

  pan(right: number, up: number): void {
    const offset = new THREE.Vector3(right, up, 0).applyQuaternion(this.camera.quaternion);
    this.target.add(offset);
    // Bound panning as well as zoom: otherwise a small radius can still take
    // the camera through the hangar wall or below the floor.
    this.target.x = THREE.MathUtils.clamp(this.target.x,
      this.anchor.x - ORBIT_LIMITS.panHorizontal, this.anchor.x + ORBIT_LIMITS.panHorizontal);
    this.target.z = THREE.MathUtils.clamp(this.target.z,
      this.anchor.z - ORBIT_LIMITS.panHorizontal, this.anchor.z + ORBIT_LIMITS.panHorizontal);
    this.target.y = THREE.MathUtils.clamp(this.target.y,
      this.anchor.y - ORBIT_LIMITS.panVertical, this.anchor.y + ORBIT_LIMITS.panVertical);
    this.update();
  }

  update(): void {
    const horizontal = this.radius * Math.cos(this.elevation);
    this.camera.position.set(
      this.target.x + horizontal * Math.sin(this.azimuth),
      this.target.y + this.radius * Math.sin(this.elevation),
      this.target.z + horizontal * Math.cos(this.azimuth),
    );
    // Never let the eye drop through the floor. Vertical pan is wide enough to
    // reach a payload 60 m up, which means it can also drag the camera
    // underground at low elevation, and a view from beneath the bay is just
    // disorienting.
    if (this.camera.position.y < FLOOR_CLEARANCE) {
      this.camera.position.y = FLOOR_CLEARANCE;
    }
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }

  attach(canvas: HTMLElement, canOrbit: () => boolean = () => true): void {
    this.detach();
    let drag: { id: number; x: number; y: number; pan: boolean } | null = null;
    const previousTouchAction = canvas.style.touchAction;
    canvas.style.touchAction = 'none';
    const stopDrag = () => {
      const id = drag?.id;
      drag = null;
      if (id !== undefined && canvas.hasPointerCapture?.(id)) canvas.releasePointerCapture(id);
    };
    const down = (event: PointerEvent) => {
      if (event.button > 2 || drag) return;
      if (event.button === 0 && !event.shiftKey && !canOrbit()) return;
      event.preventDefault();
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY,
        pan: event.button !== 0 || event.shiftKey };
      canvas.setPointerCapture?.(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      drag.x = event.clientX;
      drag.y = event.clientY;
      if (drag.pan) {
        const scale = 2 * this.radius * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))
          / Math.max(1, canvas.clientHeight);
        this.pan(-dx * scale, dy * scale);
      } else {
        this.orbit(-dx * 0.005, dy * 0.005);
      }
    };
    const up = (event: PointerEvent) => {
      if (event.pointerId === drag?.id) stopDrag();
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
      this.zoom(event.deltaY * unit * 0.001);
    };
    const contextMenu = (event: Event) => event.preventDefault();
    canvas.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    canvas.addEventListener('lostpointercapture', stopDrag);
    canvas.addEventListener('wheel', wheel, { passive: false });
    canvas.addEventListener('contextmenu', contextMenu);
    window.addEventListener('blur', stopDrag);
    this.detachInput = () => {
      stopDrag();
      canvas.style.touchAction = previousTouchAction;
      canvas.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      canvas.removeEventListener('lostpointercapture', stopDrag);
      canvas.removeEventListener('wheel', wheel);
      canvas.removeEventListener('contextmenu', contextMenu);
      window.removeEventListener('blur', stopDrag);
    };
  }

  detach(): void {
    this.detachInput?.();
    this.detachInput = null;
  }
}
