import type { PartDefinition } from '../vab/parts';
import type { StackAnalysis } from '../vab/Assembly';
import type { Readiness } from '../game/readiness';
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
  /** Hand the finished vehicle to the launch phase. */
  readonly launch: () => void;
}

const millions = (value: number) => `$${value}M`;

export class RocketPalette {
  readonly element = document.createElement('aside');
  readonly readout = document.createElement('output');
  readonly status = document.createElement('p');
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private readonly slotSections = new Map<string, HTMLElement>();
  private readonly undo = document.createElement('button');
  /** Mission Control's call, the thing every part choice moves. */
  readonly verdict = document.createElement('section');
  private readonly verdictHeadline = document.createElement('strong');
  private readonly verdictDetail = document.createElement('span');
  private readonly verdictGauge = document.createElement('i');
  private readonly parLine = document.createElement('span');
  private lastVerdict: Readiness['verdict'] | null = null;
  private readonly chromeElement: HTMLElement;
  private readonly launch = document.createElement('button');
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

    // The launch button lives here because this is where the build finishes.
    // It was previously only on a roll-out screen reachable by a key that the
    // Workshop disabled, so the flight phase could not be started at all.
    this.launch.type = 'button';
    this.launch.className = 'palette-launch';
    this.launch.textContent = 'Launch →';
    this.launch.addEventListener('click', () => this.callbacks.launch());
    this.element.append(this.launch);

    const note = document.createElement('small');
    note.className = 'palette-note';
    note.textContent = 'Click a fitted slot’s other options to compare and swap.';
    this.element.append(note);

    this.readout.className = 'rocket-readout';
    this.readout.setAttribute('aria-label', 'Vehicle analysis');
    this.status.className = 'workshop-status';
    this.status.setAttribute('role', 'status');
    // The verdict sits top-centre, where the eye goes after placing a part.
    this.verdict.className = 'mission-verdict';
    this.verdict.setAttribute('role', 'status');
    this.verdict.setAttribute('aria-label', 'Mission Control verdict');
    const label = document.createElement('small');
    label.textContent = 'MISSION CONTROL';
    const gauge = document.createElement('div');
    gauge.className = 'verdict-gauge';
    gauge.append(this.verdictGauge);
    this.parLine.className = 'verdict-par';
    this.verdict.append(label, this.verdictHeadline, this.verdictDetail, gauge, this.parLine);

    this.chromeElement = chrome;
    chrome.append(this.element, this.readout, this.status, this.verdict);
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
    const fittedKinds = new Set(fitted.map(part => part.kind));
    for (const kind of BUILD_ORDER) {
      // A slot stays clickable once it is filled, so the player can compare the
      // alternatives and swap. Only slots the stack is not ready for are
      // disabled.
      const usable = kind === nextKind || fittedKinds.has(kind);
      for (const option of optionsFor(kind)) {
        const button = this.buttons.get(option.id);
        if (button) button.disabled = !usable;
      }
    }
    this.undo.disabled = fitted.length === 0;

    // A vehicle can only fly once every slot is filled. Saying *why* it is
    // disabled is the difference between a dead button and an instruction.
    const complete = nextKind === null;
    this.launch.disabled = !complete;
    this.launch.textContent = complete
      ? 'Launch →'
      : `Fit the ${nextKind === 'upper' ? 'second stage' : nextKind} to launch`;
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
  update(
    analysis: StackAnalysis, spent: number, readiness?: Readiness, par?: number | null,
  ): void {
    if (readiness) this.showVerdict(readiness, spent, par ?? null);
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

  private showVerdict(readiness: Readiness, spent: number, par: number | null): void {
    this.verdict.dataset.verdict = readiness.verdict;
    this.verdictHeadline.textContent = readiness.headline;
    this.verdictDetail.textContent = readiness.detail;
    this.verdictGauge.style.width = `${(readiness.gauge * 100).toFixed(1)}%`;
    if (par !== null) {
      const under = spent <= par;
      this.parLine.textContent = `Par $${par}M · spent $${Math.round(spent)}M`;
      this.parLine.classList.toggle('over', !under);
    } else {
      this.parLine.textContent = '';
    }
    // Pulse when the call changes, so a part that flips NO-GO to GO is felt.
    if (this.lastVerdict !== null && this.lastVerdict !== readiness.verdict) {
      this.verdict.classList.remove('changed');
      void this.verdict.offsetWidth;
      this.verdict.classList.add('changed');
    }
    this.lastVerdict = readiness.verdict;
  }

  /** The verdict that was last shown, for sound cues. */
  get currentVerdict(): Readiness['verdict'] | null {
    return this.lastVerdict;
  }

  /**
   * Float a cost up off the readout: "-$148M" in red, or a refund in green.
   * The budget figure changing is easy to miss; money leaving is not.
   */
  flashCost(amount: number): void {
    if (amount === 0) return;
    const tag = document.createElement('span');
    tag.className = `cost-float ${amount < 0 ? 'spend' : 'refund'}`;
    tag.textContent = `${amount < 0 ? '−' : '+'}$${Math.abs(Math.round(amount))}M`;
    this.chromeElement.append(tag);
    window.setTimeout(() => tag.remove(), 1_500);
  }

  /** Jolt the panel, for a refusal. */
  shake(): void {
    this.element.classList.remove('shake');
    void this.element.offsetWidth;
    this.element.classList.add('shake');
  }

  dispose(): void {
    this.element.remove();
    this.readout.remove();
    this.status.remove();
    this.verdict.remove();
  }
}
