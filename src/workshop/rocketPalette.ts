import type { PartDefinition } from '../vab/parts';
import type { StackAnalysis } from '../vab/Assembly';
import { SLOT_LABELS, optionsFor, BUILD_ORDER } from './catalog';

/**
 * The parts palette, built from the real library.
 *
 * Every slot shows all of its options at once with the numbers that
 * distinguish them, because the decision the phase exists to create is only a
 * decision if the alternatives are visible. The previous palette listed one
 * tank and one engine, so there was nothing to choose and nothing to get
 * wrong.
 *
 * The palette renders state; it never decides legality. `Assembly.nextSlot`
 * does that, and the palette asks.
 */

export interface PaletteCallbacks {
  readonly select: (part: PartDefinition) => void;
  readonly removeLast: () => void;
}

const millions = (value: number) => `$${value}M`;

export class RocketPalette {
  readonly element = document.createElement('aside');
  readonly readout = document.createElement('output');
  readonly status = document.createElement('p');
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private readonly slotSections = new Map<string, HTMLElement>();
  private readonly undo = document.createElement('button');
  private selectedId: string | null = null;

  constructor(chrome: HTMLElement, private readonly callbacks: PaletteCallbacks) {
    this.element.className = 'rocket-palette';
    this.element.setAttribute('aria-label', 'Rocket parts');

    for (const kind of BUILD_ORDER) {
      const section = document.createElement('section');
      section.className = 'palette-slot';
      section.dataset.slot = kind;

      const heading = document.createElement('h3');
      heading.textContent = SLOT_LABELS[kind];
      section.append(heading);

      for (const part of optionsFor(kind)) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'palette-part';
        button.dataset.part = part.id;
        button.setAttribute('aria-pressed', 'false');

        const name = document.createElement('b');
        name.textContent = part.name;
        const fact = document.createElement('small');
        // keyFact is the one number that makes the part interesting, and it is
        // already written for every part in the library.
        fact.textContent = part.keyFact;
        const cost = document.createElement('span');
        cost.className = 'palette-cost';
        cost.textContent = millions(part.cost);

        button.append(name, fact, cost);
        button.addEventListener('click', () => this.callbacks.select(part));
        this.buttons.set(part.id, button);
        section.append(button);
      }

      this.slotSections.set(kind, section);
      this.element.append(section);
    }

    this.undo.type = 'button';
    this.undo.className = 'palette-undo';
    this.undo.textContent = 'Remove top part · Q';
    this.undo.addEventListener('click', () => this.callbacks.removeLast());
    this.element.append(this.undo);

    this.readout.className = 'rocket-readout';
    this.readout.setAttribute('aria-label', 'Vehicle analysis');
    this.status.className = 'workshop-status';
    this.status.setAttribute('role', 'status');
    chrome.append(this.element, this.readout, this.status);
  }

  /** Reflect what may be fitted now. */
  refresh(nextKind: PartDefinition['kind'] | null, fitted: readonly PartDefinition[]): void {
    const fittedIds = new Set(fitted.map(part => part.id));
    for (const [kind, section] of this.slotSections) {
      // The active slot is the one the stack is ready for; the rest dim.
      section.classList.toggle('active', kind === nextKind);
      section.classList.toggle('done', fitted.some(part => part.kind === kind));
    }
    for (const [id, button] of this.buttons) {
      button.classList.toggle('fitted', fittedIds.has(id));
      button.setAttribute('aria-pressed', String(this.selectedId === id));
    }
    for (const kind of BUILD_ORDER) {
      for (const option of optionsFor(kind)) {
        const button = this.buttons.get(option.id);
        if (button) button.disabled = kind !== nextKind;
      }
    }
    this.undo.disabled = fitted.length === 0;
  }

  select(id: string | null): void {
    this.selectedId = id;
    for (const [partId, button] of this.buttons) {
      button.setAttribute('aria-pressed', String(partId === id));
    }
  }

  message(text: string): void {
    if (this.status.textContent !== text) this.status.textContent = text;
  }

  /** The engineering line: what this vehicle can actually do. */
  update(analysis: StackAnalysis, spent: number): void {
    const fields = [
      `Spent ${millions(spent)}`,
      `Mass ${(analysis.liftoffMass / 1000).toFixed(1)} t`,
      `\u0394v ${Math.round(analysis.totalDeltaV).toLocaleString('en-US')} m/s`,
      `TWR ${analysis.liftoffTWR.toFixed(2)}`,
    ];
    this.readout.textContent = fields.join(' \u00b7 ');
    this.readout.classList.toggle('bad', analysis.verdictLevel === 'bad');
    this.readout.classList.toggle('good', analysis.verdictLevel === 'good');
  }

  dispose(): void {
    this.element.remove();
    this.readout.remove();
    this.status.remove();
  }
}
