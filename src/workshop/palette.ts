import { WORKSHOP_PARTS, type PartKind } from './parts';
import type { VesselAnalysis } from './analysis';

const dollars = (value: number) => `$${value.toLocaleString('en-US')}`;
export class WorkshopPalette {
  readonly element = document.createElement('aside');
  readonly readout = document.createElement('output');
  readonly status = document.createElement('p');
  private readonly buttons = new Map<PartKind, HTMLButtonElement>();
  private readonly undo = document.createElement('button');
  constructor(chrome: HTMLElement, select: (kind: PartKind) => void, detach: () => void) {
    this.element.className = 'workshop-palette';
    this.element.setAttribute('aria-label', 'Workshop parts');
    const heading = document.createElement('h2');
    heading.textContent = 'Propulsion';
    this.element.append(heading);
    for (const kind of ['fuel-tank', 'liquid-engine'] as const) {
      const part = WORKSHOP_PARTS[kind];
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.part = kind;
      button.textContent = part.name;
      button.setAttribute('aria-pressed', 'false');
      const item = document.createElement('div');
      item.className = 'workshop-part';
      const tooltip = document.createElement('span');
      tooltip.className = 'workshop-tooltip';
      tooltip.id = `specs-${kind}`;
      tooltip.setAttribute('role', 'tooltip');
      button.setAttribute('aria-describedby', tooltip.id);
      tooltip.textContent = `${dollars(part.cost)} · ${(part.dryMass + part.propellantMass).toLocaleString('en-US')} kg wet\n`
        + `${part.dryMass} kg dry · ${part.propellantMass} kg propellant\n`
        + (part.thrust ? `${part.thrust.toLocaleString('en-US')} N · Isp ${part.isp} s\n` : '') + part.description;
      button.addEventListener('click', () => select(kind));
      this.buttons.set(kind, button);
      item.append(button, tooltip);
      this.element.append(item);
    }
    this.undo.type = 'button';
    this.undo.textContent = 'Remove last · Q';
    this.undo.addEventListener('click', detach);
    this.element.append(this.undo);
    const note = document.createElement('small');
    note.textContent = 'Hover or focus a part for specs. Builds reset when you leave.';
    this.element.append(note);
    this.readout.className = 'workshop-readout';
    this.readout.setAttribute('aria-label', 'Vessel cost and mass');
    this.status.className = 'workshop-status';
    this.status.setAttribute('role', 'status');
    chrome.append(this.element, this.readout, this.status);
    this.select(null);
  }
  select(kind: PartKind | null): void {
    this.buttons.forEach((button, id) => button.setAttribute('aria-pressed', String(id === kind)));
    this.message(kind ? 'Move to an attachment sphere. Green: click to attach. Esc: cancel.'
      : 'Choose a part to place · Drag to orbit · Q: remove last');
  }
  message(text: string): void {
    if (this.status.textContent !== text) this.status.textContent = text;
  }
  update(analysis: VesselAnalysis, canDetach: boolean): void {
    // SI in, display units out: tonnes and km/s are what an engineer reads, but
    // the analysis itself stays in kilograms and metres per second.
    const parts = [
      `Craft cost ${dollars(analysis.cost)}`,
      `Wet mass ${(analysis.wetMass / 1000).toFixed(2)} t`,
    ];
    // Progressive disclosure: delta-v and TWR only mean something once an
    // engine can burn the propellant, so they appear when one is fitted.
    if (analysis.hasEngine) {
      parts.push(`Δv ${Math.round(analysis.deltaV).toLocaleString('en-US')} m/s`);
      parts.push(`TWR ${analysis.twr.toFixed(2)}`);
    } else {
      parts.push('Δv — no engine');
    }
    this.readout.textContent = parts.join(' · ');
    this.undo.disabled = !canDetach;
  }
  dispose(): void {
    this.element.remove(); this.readout.remove(); this.status.remove();
  }
}
