import * as THREE from 'three';

/**
 * Physical cockpit controls.
 *
 * The flight was driven entirely by keyboard shortcuts listed along the bottom
 * of the screen, which is not a cockpit — it is a keyboard with a picture
 * behind it. A real flight deck is operated by reaching for a specific control
 * that does one thing and is labelled with what it does, and that is also how
 * a player learns what the systems are: the throttle lever teaches that thrust
 * is continuous, a separate STAGE guard teaches that staging is irreversible.
 *
 * Each control is a mesh with a hit target, a label, and an action. The keys
 * still work — a pilot should not have to hunt for a switch during max-Q — but
 * they are no longer the only way in.
 *
 * Every control is defined here rather than in the scene builder so the list
 * is one thing that can be read, tested and extended, instead of geometry
 * scattered through a 600-line mesh function.
 */

/** What a control does when it is operated. */
export type ControlAction =
  | 'throttle-up'
  | 'throttle-down'
  | 'stage'
  | 'jettison'
  | 'autopilot'
  | 'time-warp';

export interface ControlDefinition {
  readonly id: string;
  readonly action: ControlAction;
  /** Short name engraved on the panel. */
  readonly label: string;
  /** One line explaining what it does, shown on hover. */
  readonly description: string;
  /** Centre position in cockpit space. m */
  readonly position: THREE.Vector3;
  /** Half-extents of the clickable box. m */
  readonly size: THREE.Vector3;
  /** Panel tilt the control sits on. radians */
  readonly tilt: number;
  /** Lamp colour when active, or null for an unlit control. */
  readonly litColour: number | null;
  /** Whether holding it repeats, as a throttle lever does. */
  readonly continuous: boolean;
}

/**
 * The console layout.
 *
 * Positions are in the cockpit's own frame: the camera sits at the origin
 * looking down -Z, +Y is up. Everything is on the main console below the
 * window, within reach and out of the view the player flies by — the window
 * band from -21 to +36 degrees is protected by `CockpitScene.test.ts`.
 */
export const CONTROLS: readonly ControlDefinition[] = [
  {
    id: 'throttle-up',
    action: 'throttle-up',
    label: 'THR +',
    description: 'Open the throttle. More thrust, faster burn.',
    position: new THREE.Vector3(-1.32, -1.1, -1.2),
    size: new THREE.Vector3(0.1, 0.07, 0.05),
    tilt: -0.38,
    litColour: 0x5fd99a,
    continuous: true,
  },
  {
    id: 'throttle-down',
    action: 'throttle-down',
    label: 'THR −',
    description: 'Close the throttle. Needed through maximum dynamic pressure.',
    position: new THREE.Vector3(-1.1, -1.1, -1.2),
    size: new THREE.Vector3(0.1, 0.07, 0.05),
    tilt: -0.38,
    litColour: 0xffb400,
    continuous: true,
  },
  {
    id: 'stage',
    action: 'stage',
    label: 'STAGE',
    description: 'Drop the spent stage. Cannot be undone.',
    position: new THREE.Vector3(0, -1.12, -1.18),
    size: new THREE.Vector3(0.16, 0.09, 0.06),
    tilt: -0.38,
    litColour: 0xff6b3d,
    continuous: false,
  },
  {
    id: 'jettison',
    action: 'jettison',
    label: 'FAIRING',
    description: 'Jettison the fairing. Only once the air is thin enough.',
    position: new THREE.Vector3(0.42, -1.12, -1.18),
    size: new THREE.Vector3(0.16, 0.08, 0.05),
    tilt: -0.38,
    litColour: 0x52d9ec,
    continuous: false,
  },
  {
    id: 'autopilot',
    action: 'autopilot',
    label: 'AUTO',
    description: 'Hand the ascent to the flight computer, or take it back.',
    position: new THREE.Vector3(1.1, -1.1, -1.2),
    size: new THREE.Vector3(0.14, 0.08, 0.05),
    tilt: -0.38,
    litColour: 0x5fd99a,
    continuous: false,
  },
  {
    id: 'time-warp',
    action: 'time-warp',
    label: 'WARP',
    description: 'Run the clock faster through the long coast.',
    position: new THREE.Vector3(1.4, -1.1, -1.2),
    size: new THREE.Vector3(0.12, 0.08, 0.05),
    tilt: -0.38,
    litColour: 0xb07cff,
    continuous: false,
  },
];

export interface BuiltControl {
  readonly definition: ControlDefinition;
  readonly mesh: THREE.Mesh;
  /** The lamp that lights when the control is engaged. */
  readonly lamp: THREE.Mesh | null;
}

/**
 * Build the console controls into a group.
 *
 * Returns the built controls so the caller can raycast against them without
 * searching the scene graph by name, which is fragile.
 */
export function buildControls(parent: THREE.Object3D): BuiltControl[] {
  const built: BuiltControl[] = [];

  const body = new THREE.MeshStandardMaterial({
    color: 0x39404c,
    metalness: 0.55,
    roughness: 0.42,
  });

  for (const definition of CONTROLS) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(definition.size.x * 2, definition.size.y * 2, definition.size.z * 2),
      body.clone(),
    );
    mesh.position.copy(definition.position);
    mesh.rotation.x = definition.tilt;
    mesh.name = `control:${definition.id}`;
    // Raycasting finds this by object, not by name, but the name makes the
    // scene graph readable in a debugger.
    mesh.userData.controlId = definition.id;
    parent.add(mesh);

    let lamp: THREE.Mesh | null = null;
    if (definition.litColour !== null) {
      // The lamp sits just proud of the control's face, so a lit control reads
      // as lit rather than as a slightly different shade of grey.
      lamp = new THREE.Mesh(
        new THREE.BoxGeometry(definition.size.x * 1.5, definition.size.y * 0.35, 0.012),
        new THREE.MeshBasicMaterial({ color: definition.litColour }),
      );
      lamp.position.copy(definition.position);
      lamp.position.y += definition.size.y * 0.55;
      lamp.position.z += definition.size.z + 0.01;
      lamp.rotation.x = definition.tilt;
      // Dim until engaged.
      (lamp.material as THREE.MeshBasicMaterial).color
        .setHex(definition.litColour).multiplyScalar(0.22);
      parent.add(lamp);
    }

    built.push({ definition, mesh, lamp });
  }

  return built;
}

/** Light or dim a control's lamp. */
export function setControlLit(control: BuiltControl, lit: boolean): void {
  if (!control.lamp || control.definition.litColour === null) return;
  const material = control.lamp.material as THREE.MeshBasicMaterial;
  material.color.setHex(control.definition.litColour);
  if (!lit) material.color.multiplyScalar(0.22);
}

/** Highlight a control the player is looking at. */
export function setControlHovered(control: BuiltControl, hovered: boolean): void {
  const material = control.mesh.material as THREE.MeshStandardMaterial;
  material.emissive.setHex(hovered ? 0x3a4a5a : 0x000000);
  material.emissiveIntensity = hovered ? 1 : 0;
}
