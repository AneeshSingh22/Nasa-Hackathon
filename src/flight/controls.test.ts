// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  CONTROLS, buildControls, setControlLit, setControlHovered,
  type ControlAction,
} from './controls';
import { CockpitLook, YAW_LIMIT, PITCH_DOWN_LIMIT } from './CockpitLook';

/**
 * The physical cockpit.
 *
 * A control the player cannot look at is as useless as one that does nothing,
 * and neither failure is visible to a type checker. These assert that every
 * control can be reached by a seated pilot, that pointing at one names it, and
 * that clicking it fires exactly the action it is labelled with.
 */

function rig() {
  const camera = new THREE.PerspectiveCamera(72, 1.9, 0.05, 4e7);
  camera.position.set(0, 0, 0);
  camera.updateMatrixWorld(true);

  const parent = new THREE.Group();
  const controls = buildControls(parent);
  parent.updateMatrixWorld(true);

  const canvas = document.createElement('canvas');
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, right: 1200, bottom: 800, width: 1200, height: 800,
    x: 0, y: 0, toJSON() {},
  });
  document.body.append(canvas);
  return { camera, parent, controls, canvas };
}

/** Screen position of a control, for aiming the pointer at it. */
function screenOf(mesh: THREE.Object3D, camera: THREE.PerspectiveCamera) {
  const projected = mesh.getWorldPosition(new THREE.Vector3()).project(camera);
  return { x: (projected.x + 1) * 600, y: (1 - projected.y) * 400 };
}

function pointer(target: EventTarget, type: string, x: number, y: number, button = 0) {
  const event = new MouseEvent(type, {
    clientX: x, clientY: y, button, cancelable: true, bubbles: true,
  });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  target.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('the control panel', () => {
  it('offers a control for every action the flight needs', () => {
    const actions = new Set(CONTROLS.map(control => control.action));
    for (const action of [
      'throttle-up', 'throttle-down', 'stage', 'jettison', 'autopilot', 'time-warp',
    ] as ControlAction[]) {
      expect(actions.has(action), action).toBe(true);
    }
  });

  it('labels every control and says what it does', () => {
    // The panel teaching itself is the whole reason to prefer switches over a
    // keyboard legend along the bottom of the screen.
    for (const control of CONTROLS) {
      expect(control.label.length).toBeGreaterThan(0);
      expect(control.description.length).toBeGreaterThan(20);
    }
  });

  it('puts every control where a seated pilot can look at it', () => {
    // A control outside the head's travel cannot be clicked at all, and
    // nothing else in the suite would report that.
    for (const control of CONTROLS) {
      const { x, y, z } = control.position;
      const pitchDown = Math.atan2(-y, -z);
      const yaw = Math.atan2(-x, -z);
      expect(pitchDown, `${control.label} pitch`).toBeLessThanOrEqual(PITCH_DOWN_LIMIT);
      expect(Math.abs(yaw), `${control.label} yaw`).toBeLessThanOrEqual(YAW_LIMIT);
    }
  });

  it('keeps the controls below the window band', () => {
    // CockpitScene.test.ts protects the band the player flies by. A switch
    // floating in it would be in the way of the horizon.
    for (const control of CONTROLS) {
      const elevation = Math.atan2(control.position.y, -control.position.z);
      expect(elevation, control.label).toBeLessThan(-0.3);
    }
  });

  it('lights and dims a control lamp', () => {
    const { controls } = rig();
    const autopilot = controls.find(c => c.definition.action === 'autopilot')!;
    expect(autopilot.lamp).not.toBeNull();

    setControlLit(autopilot, true);
    const lit = (autopilot.lamp!.material as THREE.MeshBasicMaterial).color.getHex();
    setControlLit(autopilot, false);
    const dim = (autopilot.lamp!.material as THREE.MeshBasicMaterial).color.getHex();

    expect(lit).not.toBe(dim);
  });

  it('highlights a control when it is pointed at', () => {
    const { controls } = rig();
    const stage = controls.find(c => c.definition.action === 'stage')!;
    const material = stage.mesh.material as THREE.MeshStandardMaterial;

    setControlHovered(stage, true);
    expect(material.emissiveIntensity).toBeGreaterThan(0);
    setControlHovered(stage, false);
    expect(material.emissiveIntensity).toBe(0);
  });
});

describe('looking around the cockpit', () => {
  it('fires the action of the control that was clicked', () => {
    const { camera, controls, canvas } = rig();
    const fired: ControlAction[] = [];
    const look = new CockpitLook(camera, canvas, controls, {
      operate: action => fired.push(action),
      hover: () => {},
    });

    const stage = controls.find(c => c.definition.action === 'stage')!;
    const at = screenOf(stage.mesh, camera);
    pointer(canvas, 'pointermove', at.x, at.y);
    pointer(canvas, 'pointerdown', at.x, at.y);

    expect(fired).toEqual(['stage']);
    look.dispose();
  });

  it('names the control under the cursor and clears it on the way out', () => {
    const { camera, controls, canvas } = rig();
    const seen: Array<string | null> = [];
    const look = new CockpitLook(camera, canvas, controls, {
      operate: () => {},
      hover: control => seen.push(control?.definition.label ?? null),
    });

    const autopilot = controls.find(c => c.definition.action === 'autopilot')!;
    const at = screenOf(autopilot.mesh, camera);
    pointer(canvas, 'pointermove', at.x, at.y);
    expect(seen).toContain('AUTO');

    // Point at empty sky.
    pointer(canvas, 'pointermove', 600, 60);
    expect(seen.at(-1)).toBeNull();
    look.dispose();
  });

  it('repeats a held throttle but not a one-shot switch', () => {
    const { camera, controls, canvas } = rig();
    const fired: ControlAction[] = [];
    const look = new CockpitLook(camera, canvas, controls, {
      operate: action => fired.push(action),
      hover: () => {},
    });

    const throttle = controls.find(c => c.definition.action === 'throttle-up')!;
    const at = screenOf(throttle.mesh, camera);
    pointer(canvas, 'pointermove', at.x, at.y);
    pointer(canvas, 'pointerdown', at.x, at.y);
    look.update(0.1);
    look.update(0.1);
    // A lever is held, so it should have fired more than the initial press.
    expect(fired.filter(action => action === 'throttle-up').length).toBeGreaterThan(2);

    pointer(window, 'pointerup', at.x, at.y);
    const afterRelease = fired.length;
    look.update(0.1);
    expect(fired.length).toBe(afterRelease);
    look.dispose();
  });

  it('turns the head on a drag and clamps how far it goes', () => {
    const { camera, controls, canvas } = rig();
    const look = new CockpitLook(camera, canvas, controls, {
      operate: () => {}, hover: () => {},
    });

    // Drag far past the limit, starting from empty sky rather than a control.
    pointer(canvas, 'pointermove', 600, 60);
    pointer(canvas, 'pointerdown', 600, 60);
    pointer(canvas, 'pointermove', -4000, 60);
    look.update(0.016);

    const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    expect(Math.abs(euler.y)).toBeLessThanOrEqual(YAW_LIMIT + 1e-6);
    // And it actually moved, rather than being clamped to nothing.
    expect(Math.abs(euler.y)).toBeGreaterThan(0.5);
    look.dispose();
  });

  it('drifts back to the window when asked', () => {
    const { camera, controls, canvas } = rig();
    const look = new CockpitLook(camera, canvas, controls, {
      operate: () => {}, hover: () => {},
    });

    pointer(canvas, 'pointermove', 600, 60);
    pointer(canvas, 'pointerdown', 600, 60);
    pointer(canvas, 'pointermove', 200, 60);
    pointer(window, 'pointerup', 200, 60);
    look.update(0.016);
    expect(look.isLookingAround).toBe(true);

    look.recentre();
    for (let i = 0; i < 200; i++) look.update(0.016);
    expect(look.isLookingAround).toBe(false);
    look.dispose();
  });

  it('stops listening once disposed', () => {
    // A listener left on the canvas would keep firing flight actions after the
    // flight has ended, which this project has already paid for once with
    // orbit-camera listeners stealing mouse input.
    const { camera, controls, canvas } = rig();
    const fired: ControlAction[] = [];
    const look = new CockpitLook(camera, canvas, controls, {
      operate: action => fired.push(action),
      hover: () => {},
    });
    look.dispose();

    const stage = controls.find(c => c.definition.action === 'stage')!;
    const at = screenOf(stage.mesh, camera);
    pointer(canvas, 'pointermove', at.x, at.y);
    pointer(canvas, 'pointerdown', at.x, at.y);
    expect(fired).toHaveLength(0);
  });
});
