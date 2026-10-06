// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { CockpitPanel } from './CockpitPanel';
import { FlightPhase, COUNTDOWN_SECONDS } from '../flight/FlightPhase';
import { vehicleFromParts } from '../flight/vehicle';
import { PART_LIBRARY } from '../vab/parts';
import { CONTROLS, type ControlAction } from '../flight/controls';

/**
 * The flight deck.
 *
 * Three modelled cockpits failed the player in ways no test could see. The
 * DOM version can be checked: every control exists and says what it does,
 * pressing it reaches the simulation, and the instruments show what the
 * vehicle is actually doing.
 */

const part = (id: string) => PART_LIBRARY.find(p => p.id === id)!;
const vehicle = () => vehicleFromParts(
  ['extended-booster', 'upper-stage', 'telescope', 'fairing'].map(part),
)!;

let container: HTMLElement;
beforeEach(() => {
  container = document.createElement('div');
  document.body.replaceChildren(container);
});

function pointer(target: Element, type: string, id = 1) {
  const event = new MouseEvent(type, { button: 0, bubbles: true, cancelable: true });
  Object.defineProperty(event, 'pointerId', { value: id });
  target.dispatchEvent(event);
}

function wired() {
  const flight = new FlightPhase(vehicle());
  const panel = new CockpitPanel(container, {
    operate: action => flight.operate(action),
    hold: (action, down) => flight.hold(action, down),
  });
  panel.update(flight.snapshot);
  const button = (action: ControlAction) =>
    container.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!;
  const text = (name: string) => container.querySelector(`.cp-f-${name}`)!.textContent;
  return { flight, panel, button, text };
}

describe('the flight deck', () => {
  it('has a labelled switch for every control, each saying what it does', () => {
    wired();
    for (const control of CONTROLS) {
      const switchElement = container.querySelector<HTMLButtonElement>(
        `[data-action="${control.action}"]`,
      );
      expect(switchElement, control.action).not.toBeNull();
      expect(switchElement!.textContent).toContain(control.label);
      // The key is printed on the switch, so the panel teaches the shortcut.
      expect(switchElement!.textContent).toContain(control.key);
      expect(switchElement!.title.length).toBeGreaterThan(20);
    }
  });

  it('offers IGNITION on the pad and swaps it for STAGE after lift-off', () => {
    const { flight, panel, button } = wired();
    expect(button('launch').classList.contains('gone')).toBe(false);
    expect(button('launch').disabled).toBe(false);
    expect(button('stage').classList.contains('gone')).toBe(true);

    pointer(button('launch'), 'pointerdown');
    flight.update(COUNTDOWN_SECONDS + 0.01);
    panel.update(flight.snapshot);

    expect(button('launch').classList.contains('gone')).toBe(true);
    expect(button('stage').classList.contains('gone')).toBe(false);
  });

  it('starts the countdown when IGNITION is pressed, and shows it', () => {
    const { flight, panel, button } = wired();
    pointer(button('launch'), 'pointerdown');
    expect(flight.snapshot.countingDown).toBe(true);
    panel.update(flight.snapshot);
    const countdown = container.querySelector('.cp-countdown')!;
    expect(countdown.classList.contains('hidden')).toBe(false);
    expect(countdown.textContent).toMatch(/T−3/);
  });

  it('holds the throttle while the switch is held and lets go on release', () => {
    const { flight, panel, button } = wired();
    flight.operate('launch');
    flight.update(COUNTDOWN_SECONDS + 0.01);
    // The game refreshes the panel every frame; the throttle switches enable
    // once the engines are lit.
    panel.update(flight.snapshot);
    expect(button('throttle-down').disabled).toBe(false);

    pointer(button('throttle-down'), 'pointerdown');
    for (let i = 0; i < 25; i++) flight.update(0.02);
    pointer(button('throttle-down'), 'pointerup');
    const after = flight.snapshot.throttle;
    expect(after).toBeLessThan(1);

    // Released: nothing keeps moving the lever.
    for (let i = 0; i < 25; i++) flight.update(0.02);
    expect(flight.snapshot.throttle).toBeCloseTo(after, 5);
  });

  it('lights the AUTO lamp when the autopilot is flying', () => {
    const { flight, panel, button } = wired();
    expect(button('autopilot').classList.contains('lit')).toBe(false);
    pointer(button('autopilot'), 'pointerdown');
    panel.update(flight.snapshot);
    expect(button('autopilot').classList.contains('lit')).toBe(true);
  });

  it('names a control on hover', () => {
    wired();
    const stage = container.querySelector('[data-action="stage"]')!;
    stage.dispatchEvent(new MouseEvent('pointerenter'));
    const hover = container.querySelector('.cp-hover')!;
    expect(hover.classList.contains('hidden')).toBe(false);
    expect(hover.textContent).toMatch(/Cannot be undone/);
  });

  it('never shows a negative altitude or an underground periapsis', () => {
    // "-0.0 km" on the pad and a periapsis 6 363 km underground were both
    // mathematically right and both read as bugs.
    const { text } = wired();
    expect(text('alt')).toBe('0 m');
    expect(text('peri')).toBe('suborbital');
  });

  it('says HOLD on the pad, counts down, then counts up', () => {
    const { flight, panel } = wired();
    const clock = () => container.querySelector('.cp-clock')!.textContent;
    expect(clock()).toBe('HOLD');
    flight.operate('launch');
    panel.update(flight.snapshot);
    expect(clock()).toMatch(/^T−/);
    flight.update(COUNTDOWN_SECONDS + 0.01);
    for (let i = 0; i < 100; i++) flight.update(0.02);
    panel.update(flight.snapshot);
    expect(clock()).toMatch(/^T\+00:02/);
  });

  it('draws a suborbital path in warning colour and a real orbit in green', () => {
    const { flight, panel } = wired();
    flight.operate('autopilot');
    flight.update(COUNTDOWN_SECONDS + 0.01);
    for (let i = 0; i < 6_000; i++) flight.update(0.02);
    panel.update(flight.snapshot);
    const path = container.querySelector('.orbit-path')!;
    expect(path.classList.contains('suborbital')).toBe(true);

    for (let i = 0; i < 400_000 && !flight.finished; i++) flight.update(0.02);
    panel.update(flight.snapshot);
    expect(flight.snapshot.outcome.kind).toBe('orbit');
    expect(path.classList.contains('stable')).toBe(true);
  });

  it('releases a held control when it is torn down mid-press', () => {
    // A flight that ends while the player is holding the throttle must not
    // leave the input stuck on for the next flight.
    const flight = new FlightPhase(vehicle());
    const released: ControlAction[] = [];
    const panel = new CockpitPanel(container, {
      operate: action => flight.operate(action),
      hold: (action, down) => { if (!down) released.push(action); },
    });
    panel.update(flight.snapshot);
    const throttle = container.querySelector('[data-action="throttle-up"]')!;
    (throttle as HTMLButtonElement).disabled = false;
    pointer(throttle, 'pointerdown');
    panel.dispose();
    expect(released).toContain('throttle-up');
    expect(container.querySelector('.cockpit')).toBeNull();
  });
});
