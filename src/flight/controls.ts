/**
 * The flight deck's controls, as data.
 *
 * Earlier versions built each control as a 3D mesh on a modelled console and
 * raycast against it. Three rounds of that failed in the same way: the camera
 * ended up inside or behind geometry, the controls were dark boxes the player
 * could not find, and nothing in the test suite could see the problem. The
 * cockpit is now a DOM layer over the 3D window view, which is what the
 * reference art actually is, and the controls are buttons — crisp at any
 * resolution, lit by CSS, and testable in jsdom.
 *
 * This file stays the single list of what the pilot can do. The panel renders
 * it, the keyboard maps onto it, and `FlightPhase.operate` / `hold` execute
 * it, so a switch and its shortcut cannot drift apart.
 */

export type ControlAction =
  | 'launch'
  | 'throttle-up'
  | 'throttle-down'
  | 'pitch-up'
  | 'pitch-down'
  | 'stage'
  | 'jettison'
  | 'autopilot'
  | 'time-warp';

/** Lamp colour family, matching how real panels colour-code by consequence. */
export type ControlTone = 'go' | 'caution' | 'warning' | 'info';

export interface ControlDefinition {
  readonly action: ControlAction;
  /** Engraved on the switch. Short, capitals, as a real panel is. */
  readonly label: string;
  /** The keyboard shortcut, shown on the switch so the panel teaches it. */
  readonly key: string;
  /** One line on what it does and why it matters, shown on hover. */
  readonly description: string;
  /** Held controls act continuously while pressed; others fire once. */
  readonly continuous: boolean;
  readonly tone: ControlTone;
}

export const CONTROLS: readonly ControlDefinition[] = [
  {
    action: 'launch',
    label: 'IGNITION',
    key: 'Space',
    description: 'Start the countdown. Engines light at T-0 and the clamps release.',
    continuous: false,
    tone: 'go',
  },
  {
    action: 'throttle-up',
    label: 'THR +',
    key: 'Shift',
    description: 'Open the throttle. More thrust, faster climb, faster burn.',
    continuous: true,
    tone: 'go',
  },
  {
    action: 'throttle-down',
    label: 'THR −',
    key: 'Ctrl',
    description: 'Close the throttle. Ease off through maximum dynamic pressure.',
    continuous: true,
    tone: 'caution',
  },
  {
    action: 'pitch-up',
    label: 'PITCH ▲',
    key: 'W',
    description: 'Raise the nose. Climbs, but orbit is sideways speed, not height.',
    continuous: true,
    tone: 'info',
  },
  {
    action: 'pitch-down',
    label: 'PITCH ▼',
    key: 'S',
    description: 'Lower the nose toward the horizon to build orbital speed.',
    continuous: true,
    tone: 'info',
  },
  {
    action: 'stage',
    label: 'STAGE',
    key: 'Space',
    description: 'Drop the spent stage and light the next. Cannot be undone.',
    continuous: false,
    tone: 'warning',
  },
  {
    action: 'jettison',
    label: 'FAIRING',
    key: 'J',
    description: 'Jettison the fairing once the air is thin enough not to need it.',
    continuous: false,
    tone: 'caution',
  },
  {
    action: 'autopilot',
    label: 'AUTO',
    key: 'G',
    description: 'Hand the ascent to the flight computer. Any manual input takes it back.',
    continuous: false,
    tone: 'go',
  },
  {
    action: 'time-warp',
    label: 'WARP',
    key: '.',
    description: 'Run the clock faster through the long coast to apoapsis.',
    continuous: false,
    tone: 'info',
  },
];

export function controlFor(action: ControlAction): ControlDefinition {
  const control = CONTROLS.find(entry => entry.action === action);
  if (!control) throw new Error(`No control for ${action}`);
  return control;
}
