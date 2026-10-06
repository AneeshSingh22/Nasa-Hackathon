import { CONTROLS, type ControlAction, type ControlDefinition } from '../flight/controls';
import { MAX_DYNAMIC_PRESSURE, MIN_ORBIT_ALTITUDE } from '../physics/ascent';
import type { FlightSnapshot } from '../flight/FlightPhase';

/**
 * The flight deck: a cockpit frame, glass instruments and real switches,
 * drawn as DOM over the 3D window view.
 *
 * ## Why DOM and not a modelled interior
 *
 * Three modelled cockpits in a row failed the player in the same way: dark
 * boxes filling the screen, controls nobody could find, and a camera that
 * kept ending up inside or behind the geometry. The reference art the player
 * asked for is a flat cockpit frame around a wide windshield, and that is
 * exactly what HTML and CSS are good at — crisp text at any resolution, lit
 * buttons, and layout that cannot clip through itself. It is also testable
 * in jsdom, which no 3D cockpit was.
 *
 * ## What the instruments teach
 *
 * Each screen answers one question a pilot is actually asking:
 *
 * - FLIGHT — how high, how fast, and how hard is the air pushing back?
 * - ATTITUDE — where is the nose, and where should it be? A cyan marker shows
 *   the guidance pitch, so flying by hand is a matter of keeping the nose on
 *   it rather than memorising a profile.
 * - ORBIT — what shape is my path? The trajectory is drawn around the Earth,
 *   and the player watches it grow from an arc that hits the planet into an
 *   ellipse that clears the atmosphere. That picture is the whole lesson of
 *   the phase.
 * - VEHICLE — how much is left in the tank, and what is the throttle doing?
 */

export interface CockpitPanelCallbacks {
  readonly operate: (action: ControlAction) => void;
  readonly hold: (action: ControlAction, down: boolean) => void;
}

/** Diagram geometry, in SVG units. */
const ORBIT_SIZE = 180;
const EARTH_PX = 44;
/** Largest radius the diagram will draw before rescaling. */
const ORBIT_MAX_PX = 84;

export class CockpitPanel {
  readonly root: HTMLElement;
  private readonly fields = new Map<string, HTMLElement>();
  private readonly buttons = new Map<ControlAction, HTMLButtonElement>();
  private readonly guidance: HTMLElement;
  private readonly hover: HTMLElement;
  private readonly countdown: HTMLElement;
  private readonly frame: HTMLElement;
  private readonly adiWorld: SVGGElement;
  private readonly adiTarget: SVGGElement;
  private readonly orbitPath: SVGEllipseElement;
  private readonly atmosphereRing: SVGCircleElement;
  private readonly targetRing: SVGCircleElement;
  private readonly qBar: HTMLElement;
  private readonly propBar: HTMLElement;
  private readonly throttleBar: HTMLElement;
  /** Which held control each active pointer is pressing. */
  private readonly pressed = new Map<number, ControlAction>();

  constructor(container: HTMLElement, private readonly callbacks: CockpitPanelCallbacks) {
    this.root = el('div', 'cockpit');
    container.replaceChildren(this.root);

    // ---- the frame: overhead, pillars and glass ----
    this.frame = el('div', 'cp-frame');
    const overhead = el('div', 'cp-overhead');
    const lamps = el('div', 'cp-lamps');
    for (let i = 0; i < 16; i++) lamps.append(el('i', `cp-lamp tone-${['go', 'info', 'go', 'caution'][i % 4]}`));
    const title = el('div', 'cp-title', 'AD ASTRA · FLIGHT DECK');
    const clock = el('div', 'cp-clock', 'T−00:00');
    this.fields.set('clock', clock);
    overhead.append(lamps, title, clock);

    const glass = el('div', 'cp-glass');
    this.frame.append(
      el('div', 'cp-pillar cp-left'),
      el('div', 'cp-pillar cp-right'),
      overhead,
      glass,
    );

    // ---- HUD text on the glass ----
    this.guidance = el('div', 'cp-guidance');
    this.guidance.setAttribute('role', 'status');
    this.hover = el('div', 'cp-hover hidden');
    this.countdown = el('div', 'cp-countdown hidden');

    // ---- the dashboard ----
    const dash = el('div', 'cp-dash');
    const screens = el('div', 'cp-screens');

    // FLIGHT
    const flight = screen('Flight');
    flight.body.append(
      row('Altitude', this.field('alt')),
      row('Speed', this.field('speed')),
      row('Vertical', this.field('vs')),
      row('Mach', this.field('mach')),
      row('Dyn. pressure', this.field('q')),
    );
    this.qBar = bar(flight.body, 'q');

    // ATTITUDE
    const attitude = screen('Attitude');
    const adi = svg('svg', { viewBox: '-60 -60 120 120', class: 'cp-adi' });
    const clip = svg('clipPath', { id: 'cp-adi-clip' });
    clip.append(svg('circle', { r: '54' }));
    const defs = svg('defs');
    defs.append(clip);
    adi.append(defs);
    const clipped = svg('g', { 'clip-path': 'url(#cp-adi-clip)' });
    this.adiWorld = svg('g');
    this.adiWorld.append(
      svg('rect', { x: '-120', y: '-240', width: '240', height: '240', class: 'adi-sky' }),
      svg('rect', { x: '-120', y: '0', width: '240', height: '240', class: 'adi-ground' }),
      svg('line', { x1: '-120', y1: '0', x2: '120', y2: '0', class: 'adi-horizon' }),
    );
    // Pitch ladder every 15 degrees, so the scale is readable at a glance.
    for (let degrees = -90; degrees <= 90; degrees += 15) {
      if (degrees === 0) continue;
      const y = -degrees * PX_PER_DEGREE;
      const half = degrees % 30 === 0 ? 18 : 9;
      this.adiWorld.append(svg('line', {
        x1: String(-half), y1: String(y), x2: String(half), y2: String(y), class: 'adi-ladder',
      }));
      if (degrees % 30 === 0) {
        const label = svg('text', { x: String(half + 4), y: String(y + 3), class: 'adi-label' });
        label.textContent = String(Math.abs(degrees));
        this.adiWorld.append(label);
      }
    }
    // Target marker: where guidance wants the nose.
    this.adiTarget = svg('g', { class: 'adi-target' });
    this.adiTarget.append(svg('path', { d: 'M -30 0 L -22 -5 L -22 5 Z M 30 0 L 22 -5 L 22 5 Z' }));
    clipped.append(this.adiWorld, this.adiTarget);
    adi.append(
      clipped,
      svg('circle', { r: '54', class: 'adi-rim' }),
      // The vehicle symbol stays fixed; the world moves behind it.
      svg('path', { d: 'M -26 0 L -9 0 L 0 7 L 9 0 L 26 0', class: 'adi-symbol' }),
    );
    attitude.body.classList.add('split');
    attitude.body.append(adi, rows(row('Nose', this.field('pitch')), row('Target', this.field('target'))));

    // ORBIT
    const orbit = screen('Orbit');
    const diagram = svg('svg', {
      viewBox: `${-ORBIT_SIZE / 2} ${-ORBIT_SIZE / 2} ${ORBIT_SIZE} ${ORBIT_SIZE}`,
      class: 'cp-orbit',
    });
    this.orbitPath = svg('ellipse', { class: 'orbit-path', rx: '0', ry: '0' });
    this.atmosphereRing = svg('circle', { r: String(EARTH_PX + 6), class: 'orbit-atmosphere' });
    this.targetRing = svg('circle', { r: String(EARTH_PX + 10), class: 'orbit-target' });
    diagram.append(
      this.orbitPath,
      svg('circle', { r: String(EARTH_PX), class: 'orbit-earth' }),
      this.atmosphereRing,
      this.targetRing,
    );
    const scaleNote = svg('text', { x: '0', y: String(ORBIT_SIZE / 2 - 6), class: 'orbit-note' });
    scaleNote.textContent = 'heights exaggerated';
    diagram.append(scaleNote);
    orbit.body.classList.add('split');
    orbit.body.append(diagram, rows(row('Apoapsis', this.field('apo')), row('Periapsis', this.field('peri'))));

    // VEHICLE
    const vehicle = screen('Vehicle');
    vehicle.body.append(row('Stage', this.field('stage')));
    vehicle.body.append(row('Propellant', this.field('prop')));
    this.propBar = bar(vehicle.body, 'prop');
    vehicle.body.append(row('Throttle', this.field('throttle')));
    this.throttleBar = bar(vehicle.body, 'throttle');
    vehicle.body.append(row('Stage Δv', this.field('dv')), row('TWR', this.field('twr')));

    screens.append(flight.root, attitude.root, orbit.root, vehicle.root);

    // ---- switches ----
    const switches = el('div', 'cp-switches');
    for (const group of [
      ['throttle-up', 'throttle-down'],
      ['pitch-up', 'pitch-down'],
      ['launch', 'stage'],
      ['jettison', 'autopilot', 'time-warp'],
    ] as ControlAction[][]) {
      const cluster = el('div', 'cp-cluster');
      for (const action of group) cluster.append(this.makeSwitch(action));
      switches.append(cluster);
    }

    dash.append(screens, switches);
    this.root.append(this.frame, this.guidance, this.hover, this.countdown, dash);
  }

  private field(name: string): HTMLElement {
    // `cp-f-` prefix: the STAGE switch is `.cp-stage`, and a readout that
    // shared the class picked up the switch's red background.
    const value = el('b', `cp-value cp-f-${name}`, '—');
    this.fields.set(name, value);
    return value;
  }

  private makeSwitch(action: ControlAction): HTMLButtonElement {
    const control = CONTROLS.find(entry => entry.action === action) as ControlDefinition;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `cp-switch tone-${control.tone} cp-${action}`;
    button.dataset.action = action;
    // Buttons must not take focus: a focused button is re-activated by Space,
    // which would fire STAGE twice — once from the key, once from the button.
    button.tabIndex = -1;
    button.title = control.description;
    button.setAttribute('aria-label', `${control.label}: ${control.description}`);
    button.append(
      el('i', 'cp-switch-lamp'),
      el('span', 'cp-switch-label', control.label),
      el('kbd', 'cp-switch-key', control.key),
    );

    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0 || button.disabled) return;
      event.preventDefault();
      button.classList.add('pressed');
      if (control.continuous) {
        this.pressed.set(event.pointerId, action);
        button.setPointerCapture?.(event.pointerId);
        this.callbacks.hold(action, true);
      } else {
        this.callbacks.operate(action);
      }
    });
    const release = (event: PointerEvent) => {
      button.classList.remove('pressed');
      const held = this.pressed.get(event.pointerId);
      if (held) {
        this.pressed.delete(event.pointerId);
        this.callbacks.hold(held, false);
      }
    };
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);

    button.addEventListener('pointerenter', () => {
      this.hover.textContent = `${control.label} — ${control.description}`;
      this.hover.classList.remove('hidden');
    });
    button.addEventListener('pointerleave', () => this.hover.classList.add('hidden'));

    this.buttons.set(action, button);
    return button;
  }

  /** Offset the frame slightly against a head turn, for parallax. */
  look(yaw: number, pitch: number): void {
    this.frame.style.transform = `translate(${(yaw * 26).toFixed(1)}px, ${(-pitch * 18).toFixed(1)}px)`;
  }

  /** Redraw every instrument from the simulation. Nothing is tracked here. */
  update(snapshot: FlightSnapshot): void {
    const t = snapshot.telemetry;
    const set = (name: string, text: string) => {
      const node = this.fields.get(name);
      if (node && node.textContent !== text) node.textContent = text;
    };

    set('clock', snapshot.launched || snapshot.countingDown
      ? missionClock(snapshot.missionTime)
      : 'HOLD');

    // FLIGHT. The pad constraint can leave a hair of negative altitude;
    // "-0.0 km" reads as a bug, so floor it.
    set('alt', formatAltitude(Math.max(0, t.altitude)));
    set('speed', `${t.speed.toFixed(0)} m/s`);
    set('vs', `${t.verticalSpeed >= 0 ? '+' : '−'}${Math.abs(t.verticalSpeed).toFixed(0)} m/s`);
    set('mach', t.mach.toFixed(2));
    set('q', `${(t.dynamicPressure / 1000).toFixed(1)} kPa`);
    const qFraction = Math.min(1, t.dynamicPressure / MAX_DYNAMIC_PRESSURE);
    this.qBar.style.width = `${(qFraction * 100).toFixed(1)}%`;
    this.qBar.classList.toggle('warn', qFraction > 0.55);
    this.qBar.classList.toggle('danger', qFraction > 0.8);

    // ATTITUDE.
    const pitchDegrees = (snapshot.pitch * 180) / Math.PI;
    const targetDegrees = (snapshot.guidance.pitch * 180) / Math.PI;
    this.adiWorld.setAttribute('transform', `translate(0 ${(pitchDegrees * PX_PER_DEGREE).toFixed(2)})`);
    // The target sits on the ladder at its own pitch, so it moves with the
    // world and lines up with the vehicle symbol when the nose is on it.
    this.adiTarget.setAttribute(
      'transform', `translate(0 ${((pitchDegrees - targetDegrees) * PX_PER_DEGREE).toFixed(2)})`,
    );
    set('pitch', `${pitchDegrees.toFixed(0)}°`);
    set('target', snapshot.launched ? `${targetDegrees.toFixed(0)}°` : '—');

    // ORBIT.
    set('apo', formatApsis(t.apoapsis));
    set('peri', formatApsis(t.periapsis));
    this.drawOrbit(t.apoapsis, t.periapsis);

    // VEHICLE.
    set('stage', `${snapshot.stage + 1} of ${snapshot.stageCount}`);
    set('prop', `${Math.round(snapshot.propellantFraction * 100)}%`);
    this.propBar.style.width = `${(snapshot.propellantFraction * 100).toFixed(1)}%`;
    this.propBar.classList.toggle('warn', snapshot.propellantFraction < 0.15);
    set('throttle', `${Math.round(snapshot.throttle * 100)}%`);
    this.throttleBar.style.width = `${(snapshot.throttle * 100).toFixed(1)}%`;
    set('dv', `${t.stageDeltaV.toFixed(0)} m/s`);
    set('twr', t.twr.toFixed(2));

    // Guidance, with the one warning that matters on the pad.
    const stuck = snapshot.launched && t.altitude < 50 && t.twr > 0 && t.twr < 1;
    const text = stuck
      ? 'Not enough thrust to lift off. Open the throttle.'
      : `${snapshot.autopilot ? 'AUTOPILOT · ' : ''}${snapshot.guidance.instruction}`;
    if (this.guidance.textContent !== text) this.guidance.textContent = text;
    this.guidance.classList.toggle('warn', stuck || qFraction > 0.7);

    // Countdown numerals over the glass.
    if (snapshot.countingDown) {
      this.countdown.textContent = `T−${Math.ceil(-snapshot.missionTime)}`;
      this.countdown.classList.remove('hidden');
    } else if (snapshot.launched && snapshot.missionTime < 2) {
      this.countdown.textContent = 'LIFT-OFF';
      this.countdown.classList.remove('hidden');
    } else {
      this.countdown.classList.add('hidden');
    }

    // Switch state: lamps show what the vehicle is actually doing.
    this.setSwitch('launch', !snapshot.launched && !snapshot.countingDown, snapshot.countingDown);
    this.buttons.get('launch')?.classList.toggle('gone', snapshot.launched);
    this.buttons.get('stage')?.classList.toggle('gone', !snapshot.launched);
    this.setSwitch('stage', snapshot.canStage, snapshot.canStage && snapshot.propellantFraction <= 0.001);
    this.setSwitch('jettison', snapshot.canJettison, snapshot.canJettison);
    this.setSwitch('autopilot', true, snapshot.autopilot);
    this.setSwitch('time-warp', snapshot.launched, snapshot.timeScale > 1);
    this.fields.get('clock')?.classList.toggle('warp', snapshot.timeScale > 1);
    const warpLabel = this.buttons.get('time-warp')?.querySelector('.cp-switch-label');
    if (warpLabel) warpLabel.textContent = snapshot.timeScale > 1 ? `WARP ×${snapshot.timeScale}` : 'WARP';
    for (const action of ['throttle-up', 'throttle-down', 'pitch-up', 'pitch-down'] as ControlAction[]) {
      this.setSwitch(action, snapshot.launched, false);
    }
  }

  private setSwitch(action: ControlAction, enabled: boolean, lit: boolean): void {
    const button = this.buttons.get(action);
    if (!button) return;
    button.disabled = !enabled;
    button.classList.toggle('lit', lit);
  }

  /**
   * Draw the current trajectory around the Earth.
   *
   * Altitudes are exaggerated — a 180 km orbit drawn to scale is a line one
   * pixel outside a 44-pixel planet — and the scale shrinks if the apoapsis
   * would leave the screen. Periapsis below the surface draws an ellipse that
   * dips inside the Earth, and the Earth is painted over it, so a suborbital
   * path visibly hits the planet.
   */
  private drawOrbit(apoapsis: number | null, periapsis: number | null): void {
    if (apoapsis === null || periapsis === null) {
      this.orbitPath.setAttribute('rx', '0');
      this.orbitPath.setAttribute('ry', '0');
      this.orbitPath.classList.remove('suborbital', 'stable');
      return;
    }
    const apoKm = Math.max(0, apoapsis / 1000);
    // Exaggerate heights, but never past the diagram edge.
    const pxPerKm = Math.min(0.06, (ORBIT_MAX_PX - EARTH_PX) / Math.max(apoKm, 1));
    const radiusOf = (altitudeKm: number) => Math.max(1, EARTH_PX + altitudeKm * pxPerKm);
    // The reference rings rescale with the trajectory, or they would lie about
    // where the atmosphere ends once a high apoapsis shrinks the scale.
    this.atmosphereRing.setAttribute('r', radiusOf(100).toFixed(2));
    this.targetRing.setAttribute('r', radiusOf(MIN_ORBIT_ALTITUDE / 1000).toFixed(2));
    const ra = radiusOf(apoKm);
    // A periapsis deep underground is drawn true-to-shape against the
    // planet's own radius, so the arc plunges into the Earth.
    const rp = periapsis >= 0
      ? radiusOf(periapsis / 1000)
      : Math.max(1, EARTH_PX * (1 + periapsis / 6_371_000));
    const semiMajor = (ra + rp) / 2;
    const focusOffset = semiMajor - rp;
    const semiMinor = Math.sqrt(Math.max(0, ra * rp));
    // Apoapsis to the right, focus at the Earth's centre.
    this.orbitPath.setAttribute('cx', (-focusOffset).toFixed(2));
    this.orbitPath.setAttribute('cy', '0');
    this.orbitPath.setAttribute('rx', semiMajor.toFixed(2));
    this.orbitPath.setAttribute('ry', semiMinor.toFixed(2));
    this.orbitPath.classList.toggle('suborbital', periapsis < 100_000);
    this.orbitPath.classList.toggle('stable', periapsis >= MIN_ORBIT_ALTITUDE);
  }

  dispose(): void {
    for (const action of this.pressed.values()) this.callbacks.hold(action, false);
    this.pressed.clear();
    this.root.remove();
  }
}

/** Pixels of attitude-indicator travel per degree of pitch. */
const PX_PER_DEGREE = 1.5;

function formatAltitude(metres: number): string {
  return metres < 10_000 ? `${metres.toFixed(0)} m` : `${(metres / 1000).toFixed(1)} km`;
}

/**
 * Format an apsis for the display.
 *
 * A periapsis thousands of kilometres underground is mathematically right and
 * meaningless to read, so a trajectory that intersects the planet says so.
 */
function formatApsis(metres: number | null): string {
  if (metres === null) return '—';
  if (metres < 0) return 'suborbital';
  return `${(metres / 1000).toFixed(0)} km`;
}

function missionClock(seconds: number): string {
  const sign = seconds < 0 ? '−' : '+';
  const whole = Math.floor(Math.abs(seconds));
  const minutes = Math.floor(whole / 60).toString().padStart(2, '0');
  const rest = (whole % 60).toString().padStart(2, '0');
  return `T${sign}${minutes}:${rest}`;
}

// ------------------------------------------------------------ DOM helpers

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function screen(title: string): { root: HTMLElement; body: HTMLElement } {
  const root = el('section', 'cp-screen');
  root.setAttribute('aria-label', title);
  const body = el('div', 'cp-screen-body');
  root.append(el('header', 'cp-screen-title', title.toUpperCase()), body);
  return { root, body };
}

function row(label: string, value: HTMLElement): HTMLElement {
  const node = el('div', 'cp-row');
  node.append(el('span', 'cp-row-label', label), value);
  return node;
}

function rows(...children: HTMLElement[]): HTMLElement {
  const column = el('div', 'cp-rows');
  column.append(...children);
  return column;
}

function bar(parent: HTMLElement, name: string): HTMLElement {
  const track = el('div', `cp-bar cp-bar-${name}`);
  const fill = el('i', 'cp-bar-fill');
  track.append(fill);
  parent.append(track);
  return fill;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K, attributes: Record<string, string> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}
