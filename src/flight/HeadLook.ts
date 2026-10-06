/**
 * Turning your head in the seat.
 *
 * The pilot is strapped in under acceleration, so looking around is a head
 * turn, not a walk: drag across the windshield to look, and the view drifts
 * back to straight ahead when you let go. All the controls are on the
 * dashboard in front of you, so looking around is for the view — watching
 * the pad fall away to the side, or the coast slide past — not for finding
 * switches.
 *
 * Drag rather than pointer lock, because the cursor is needed to press
 * buttons, and a locked pointer cannot reach the dashboard.
 */

export const LOOK_YAW_LIMIT = 0.75;
export const LOOK_PITCH_UP = 0.35;
export const LOOK_PITCH_DOWN = 0.3;

/** Radians per pixel dragged. */
const SENSITIVITY = 0.0032;
/** Seconds after release before the head starts drifting back. */
const SETTLE_DELAY = 1.2;
/** Drift rate back to centre. rad/s */
const RECENTRE_RATE = 0.9;

export class HeadLook {
  yaw = 0;
  pitch = 0;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private idle = 0;
  private recentring = false;
  private readonly detach: () => void;

  constructor(target: HTMLElement) {
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      this.dragging = true;
      this.recentring = false;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
    };
    const move = (event: PointerEvent) => {
      if (!this.dragging) return;
      this.yaw = clamp(this.yaw - (event.clientX - this.lastX) * SENSITIVITY,
        -LOOK_YAW_LIMIT, LOOK_YAW_LIMIT);
      this.pitch = clamp(this.pitch - (event.clientY - this.lastY) * SENSITIVITY,
        -LOOK_PITCH_DOWN, LOOK_PITCH_UP);
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      this.idle = 0;
    };
    const up = () => {
      this.dragging = false;
      this.idle = 0;
    };

    target.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('blur', up);
    this.detach = () => {
      target.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('blur', up);
    };
  }

  /** Snap back to straight ahead, briskly. */
  recentre(): void {
    this.recentring = true;
  }

  update(dt: number): void {
    if (this.dragging) return;
    this.idle += dt;
    if (!this.recentring && this.idle < SETTLE_DELAY) return;
    const step = RECENTRE_RATE * dt * (this.recentring ? 3 : 1);
    this.yaw = approach(this.yaw, 0, step);
    this.pitch = approach(this.pitch, 0, step);
    if (this.yaw === 0 && this.pitch === 0) this.recentring = false;
  }

  dispose(): void {
    this.detach();
  }
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function approach(value: number, target: number, step: number): number {
  if (Math.abs(value - target) <= step) return target;
  return value + Math.sign(target - value) * step;
}
