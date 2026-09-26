import * as THREE from 'three';

// Tuned for a small capsule on the existing stand, in metres/radians.
export const ORBIT_LIMITS = {
  minDistance: 6, maxDistance: 18,
  minElevation: 0.12, maxElevation: Math.PI / 2 - 0.12,
  panHorizontal: 2, panVertical: 1,
} as const;

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
    this.elevation = 0.35;
    this.radius = 10;
    this.update();
  }

  /** Reframe after assembly changes, preserving the viewing angle. */
  frame(target: THREE.Vector3, boundingRadius: number): void {
    this.anchor.copy(target);
    this.target.copy(target);
    const vertical = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const halfAngle = Math.min(vertical, Math.atan(Math.tan(vertical) * this.camera.aspect));
    this.radius = THREE.MathUtils.clamp(Math.max(10, boundingRadius / Math.sin(halfAngle) * 1.1),
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
