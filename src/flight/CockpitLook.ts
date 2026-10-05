import * as THREE from 'three';
import {
  setControlHovered, setControlLit,
  type BuiltControl, type ControlAction,
} from './controls';

/**
 * Looking around the cockpit, and reaching for things.
 *
 * The pilot is strapped into a seat during a launch, so this is head movement
 * rather than walking: drag to look, and the view returns to the window when
 * released. That is both more realistic than walking around a vehicle under
 * three g and easier to fly with, because the instruments the player needs are
 * never more than a glance away.
 *
 * Hovering a control names it and says what it does. That is the point of
 * physical controls over a keyboard legend: the panel teaches itself, and a
 * player who has never seen the game can find out what STAGE does without
 * pressing it to see.
 */

/** How far the head can turn from straight ahead. radians */
export const YAW_LIMIT = 1.25;
export const PITCH_UP_LIMIT = 0.85;
export const PITCH_DOWN_LIMIT = 1.0;

/** Mouse sensitivity, radians per pixel. */
const LOOK_SPEED = 0.0028;

/** How fast the view drifts back to centre when the player lets go. rad/s */
const RECENTRE_RATE = 1.6;

export interface CockpitLookOptions {
  /** Fire a control's action. */
  readonly operate: (action: ControlAction) => void;
  /** Report what is under the cursor, or null. */
  readonly hover: (control: BuiltControl | null) => void;
}

export class CockpitLook {
  private yaw = 0;
  private pitch = 0;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  /** Set while the pointer is held on a continuous control. */
  private holding: BuiltControl | null = null;
  private hovered: BuiltControl | null = null;
  private recentring = false;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly detach: () => void;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly canvas: HTMLElement,
    private readonly controls: readonly BuiltControl[],
    private readonly options: CockpitLookOptions,
  ) {
    const move = (event: PointerEvent) => {
      this.updatePointer(event);
      if (this.dragging) {
        // Drag to look. Deliberately not pointer lock: the player needs a
        // visible cursor to aim at a switch, and a launch is not a shooter.
        this.yaw = clamp(this.yaw - (event.clientX - this.lastX) * LOOK_SPEED,
          -YAW_LIMIT, YAW_LIMIT);
        this.pitch = clamp(this.pitch - (event.clientY - this.lastY) * LOOK_SPEED,
          -PITCH_DOWN_LIMIT, PITCH_UP_LIMIT);
        this.lastX = event.clientX;
        this.lastY = event.clientY;
        this.recentring = false;
      }
      this.updateHover();
    };

    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      this.updatePointer(event);
      const target = this.pick();

      if (target) {
        // Pressing a control is not looking around.
        event.preventDefault();
        this.options.operate(target.definition.action);
        if (target.definition.continuous) this.holding = target;
        return;
      }

      this.dragging = true;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
    };

    const up = () => {
      this.dragging = false;
      this.holding = null;
    };

    const leave = () => {
      this.dragging = false;
      this.holding = null;
      this.setHovered(null);
    };

    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    canvas.addEventListener('pointerleave', leave);
    window.addEventListener('blur', leave);

    this.detach = () => {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointerleave', leave);
      window.removeEventListener('blur', leave);
    };
  }

  /** Snap the view back to the window. */
  recentre(): void {
    this.recentring = true;
  }

  get isLookingAround(): boolean {
    return Math.abs(this.yaw) > 0.02 || Math.abs(this.pitch) > 0.02;
  }

  /**
   * Advance the head and fire any held control.
   *
   * `dt` in seconds. A continuous control repeats while held, which is what
   * makes a throttle lever feel like a lever rather than a button.
   */
  update(dt: number): void {
    if (this.holding) this.options.operate(this.holding.definition.action);

    if (this.recentring && !this.dragging) {
      const step = RECENTRE_RATE * dt;
      this.yaw = approach(this.yaw, 0, step);
      this.pitch = approach(this.pitch, 0, step);
      if (this.yaw === 0 && this.pitch === 0) this.recentring = false;
    }

    // Head rotation only. The camera's position never changes, because the
    // cockpit and the world are both built around the origin.
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    this.camera.updateMatrixWorld();
  }

  /** Light the lamp on a control that is currently engaged. */
  setLit(action: ControlAction, lit: boolean): void {
    for (const control of this.controls) {
      if (control.definition.action === action) setControlLit(control, lit);
    }
  }

  dispose(): void {
    this.detach();
    this.setHovered(null);
  }

  private updatePointer(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  private pick(): BuiltControl | null {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const meshes = this.controls.map(control => control.mesh);
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    if (!hit) return null;
    return this.controls.find(control => control.mesh === hit.object) ?? null;
  }

  private updateHover(): void {
    this.setHovered(this.dragging ? null : this.pick());
  }

  private setHovered(control: BuiltControl | null): void {
    if (control === this.hovered) return;
    if (this.hovered) setControlHovered(this.hovered, false);
    this.hovered = control;
    if (control) setControlHovered(control, true);
    this.options.hover(control);
  }
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

/** Move toward a target by at most `step`, landing exactly on it. */
function approach(value: number, target: number, step: number): number {
  if (Math.abs(value - target) <= step) return target;
  return value + Math.sign(target - value) * step;
}
