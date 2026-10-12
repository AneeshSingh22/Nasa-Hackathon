import type { PartDefinition } from '../vab/parts';
import type { StackAnalysis } from '../vab/Assembly';
import { LEO_DELTA_V_REQUIRED } from '../game/launchRequirements';
import { STARTER_DESIGN, STARTER_ANALYSIS, STARTER_COST } from './starterDesign';
import type { Readiness } from '../game/readiness';
import { MODULAR_PARTS, WORKSHOP_CATEGORIES, type WorkshopCategory } from './modularParts';
import { partIcon, partThumbnails } from './thumbnails';

export interface PaletteCallbacks {
  readonly select: (part: PartDefinition, event?: PointerEvent) => void;
  readonly removeLast: () => void;
  readonly launch: () => void;
  readonly sell: (instanceId: string) => void;
}

/** Shared inspection values, taken from the purchased part rather than another catalog copy. */
function facts(part: PartDefinition): HTMLElement {
  const list = document.createElement('dl'); list.className = 'part-facts';
  const entries = [['Dry mass', `${(part.dryMass / 1000).toFixed(1)} t`]];
  if (part.propellantMass) entries.push(['Fuel', `${(part.propellantMass / 1000).toFixed(0)} t`]);
  if (part.thrust) entries.push([part.vacuumOptimized ? 'Vacuum thrust' : 'Thrust', `${(part.thrust / 1000000).toFixed(2)} MN`]);
  if (part.isp) entries.push(['Isp', `${part.isp} s`]);
  if (part.science) entries.push(['Science', String(part.science)]);
  for (const [name, value] of entries) {
    const dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = name!; dd.textContent = value!; list.append(dt, dd);
  }
  return list;
}

export class RocketPalette {
  readonly element = document.createElement('aside');
  readonly readout = document.createElement('output');
  readonly status = document.createElement('p');
  readonly verdict = document.createElement('section');
  readonly returnTray = document.createElement('button');
  private readonly grid = document.createElement('div');
  private readonly tooltip = document.createElement('section');
  private readonly inspection = document.createElement('section');
  private readonly specs = document.createElement('aside');
  private readonly specsScreen = document.createElement('div');
  private readonly specsToggle = document.createElement('button');
  private readonly heading = document.createElement('h3');
  private readonly rail = document.createElement('nav');
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private active: WorkshopCategory | null = 'propulsion';
  private picking = false;
  private lastVerdict: Readiness['verdict'] | null = null;

  constructor(private readonly chrome: HTMLElement, private readonly callbacks: PaletteCallbacks, showStarterGuide = false) {
    this.element.className = 'rocket-palette';
    this.element.setAttribute('aria-label', 'Rocket parts');
    this.rail.className = 'category-rail'; this.rail.setAttribute('aria-label', 'Part categories');
    for (const category of WORKSHOP_CATEGORIES) {
      const button = document.createElement('button'); button.type = 'button';
      button.dataset.category = category.id; button.setAttribute('aria-label', category.name);
      button.title = category.name; button.innerHTML = partIcon(category.icon);
      button.addEventListener('click', () => {
        this.active = this.active === category.id ? null : category.id; this.showCategory();
      });
      this.rail.append(button);
    }
    const drawer = document.createElement('section'); drawer.className = 'parts-drawer';
    this.grid.className = 'parts-grid'; drawer.append(this.heading, this.grid);
    this.element.append(this.rail, drawer);
    const thumbnails = partThumbnails(MODULAR_PARTS);
    this.tooltip.className = 'part-tooltip'; this.tooltip.id = 'workshop-part-tooltip';
    this.tooltip.setAttribute('role', 'tooltip'); this.tooltip.hidden = true;
    for (const part of MODULAR_PARTS) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'palette-part';
      button.dataset.part = part.id; button.dataset.kind = part.kind;
      button.setAttribute('aria-label', part.name); button.setAttribute('aria-describedby', this.tooltip.id);
      button.setAttribute('aria-disabled', String(!!part.deferred));
      const image = thumbnails.get(part.id);
      if (image) {
        const img = document.createElement('img'); img.src = image; img.alt = ''; img.draggable = false; button.append(img);
      } else button.innerHTML = partIcon(part.kind);
      if (part.deferred) button.classList.add('planned');
      button.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        event.preventDefault(); this.tooltip.hidden = true;
        if (!part.deferred) this.callbacks.select(part, event);
      });
      button.addEventListener('click', event => {
        if (event.detail === 0 && !part.deferred) this.callbacks.select(part);
      });
      const show = () => this.showTooltip(part, button);
      button.addEventListener('pointerenter', show); button.addEventListener('focus', show);
      button.addEventListener('pointerleave', () => { this.tooltip.hidden = true; });
      button.addEventListener('blur', () => { this.tooltip.hidden = true; });
      this.buttons.set(part.id, button); this.grid.append(button);
    }

    this.specs.className = 'workshop-specs'; this.specs.setAttribute('aria-label', 'Rocket specs monitor');
    this.specsScreen.className = 'specs-screen'; this.specsScreen.id = 'workshop-specs-screen';
    const title = document.createElement('h3'); title.textContent = 'Rocket specs';
    this.readout.className = 'rocket-readout'; this.readout.setAttribute('aria-label', 'Vehicle analysis');
    this.verdict.className = 'mission-verdict'; this.verdict.setAttribute('role', 'status');
    this.specsScreen.append(title, this.readout, this.verdict);
    if (showStarterGuide) {
      const guide = document.createElement('details'); guide.className = 'workshop-build-guide';
      const summary = document.createElement('summary'); summary.textContent = 'Build guide';
      const intro = document.createElement('p'); intro.textContent = 'An easy two-stage relay. Build from bottom to top; tanks go above their engines.';
      const order = document.createElement('ol');
      for (const part of [...STARTER_DESIGN].reverse()) {
        const item = document.createElement('li'); item.textContent = part.name; order.append(item);
      }
      const result = document.createElement('p'); result.className = 'starter-result';
      result.textContent = `$${STARTER_COST}M · ${Math.round(STARTER_ANALYSIS.totalDeltaV).toLocaleString('en-US')} m/s`;
      guide.append(summary, intro, order, result); this.specsScreen.append(guide);
    }
    this.specsToggle.type = 'button'; this.specsToggle.className = 'specs-toggle';
    this.specsToggle.setAttribute('aria-controls', this.specsScreen.id);
    this.specsToggle.setAttribute('aria-expanded', 'true');
    this.specsToggle.setAttribute('aria-label', 'Collapse rocket specs'); this.specsToggle.textContent = '›';
    this.specsToggle.addEventListener('click', () => {
      const open = this.specsScreen.hidden;
      this.specsScreen.hidden = !open; this.specs.classList.toggle('specs-collapsed', !open);
      this.specsToggle.setAttribute('aria-expanded', String(open));
      this.specsToggle.setAttribute('aria-label', open ? 'Collapse rocket specs' : 'Expand rocket specs');
      this.specsToggle.textContent = open ? '›' : '‹';
    });
    this.specs.append(this.specsToggle, this.specsScreen);
    this.inspection.className = 'installed-part-info'; this.inspection.hidden = true;
    this.inspection.setAttribute('role', 'dialog'); this.inspection.setAttribute('aria-label', 'Selected rocket part');
    this.inspection.tabIndex = -1;
    this.status.className = 'workshop-status'; this.status.setAttribute('role', 'status');
    this.returnTray.className = 'workshop-return'; this.returnTray.type = 'button'; this.returnTray.textContent = '↩ Return';
    this.returnTray.title = 'Drag a part here for a full refund';
    this.returnTray.setAttribute('aria-label', 'Sell selected part or last installed part, full refund');
    this.returnTray.addEventListener('click', () => this.callbacks.removeLast());
    chrome.append(this.element, this.specs, this.status, this.returnTray, this.tooltip, this.inspection);
    this.showCategory(); this.message('Drag any part into the bay');
  }

  inspect(part: PartDefinition, x: number, y: number): void {
    if (!part.instanceId) return;
    this.tooltip.hidden = true; this.inspection.replaceChildren();
    const header = document.createElement('header');
    const name = document.createElement('h3'); name.textContent = part.name;
    const close = document.createElement('button'); close.type = 'button'; close.textContent = '×';
    close.className = 'part-info-close'; close.setAttribute('aria-label', 'Close part details');
    close.addEventListener('click', () => this.hideInspection()); header.append(name, close);
    const description = document.createElement('p'); description.className = 'part-description';
    description.textContent = part.keyFact || part.briefing.split('. ')[0]!;
    const sell = document.createElement('button'); sell.type = 'button'; sell.className = 'sell-part';
    sell.textContent = `Sell · $${part.cost}M`;
    sell.setAttribute('aria-label', `Sell ${part.name} for a full $${part.cost} million refund`);
    sell.addEventListener('click', () => { sell.disabled = true; this.callbacks.sell(part.instanceId!); });
    this.inspection.append(header, facts(part), description, sell);
    this.inspection.hidden = false;
    this.inspection.style.left = `${Math.max(10, Math.min(x + 20, window.innerWidth - 278))}px`;
    this.inspection.style.top = `${Math.max(70, Math.min(y - 30, window.innerHeight - 310))}px`;
    this.inspection.focus({ preventScroll: true });
  }
  hideInspection(): void { this.inspection.hidden = true; }

  private showCategory(): void {
    const category = WORKSHOP_CATEGORIES.find(c => c.id === this.active);
    this.element.classList.toggle('collapsed', !category); this.tooltip.hidden = true;
    this.heading.textContent = category?.name ?? '';
    for (const part of MODULAR_PARTS) this.buttons.get(part.id)!.hidden = !category?.kinds.some(k => k === part.kind);
    for (const button of this.rail.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.category === this.active));
  }
  private showTooltip(part: PartDefinition, tile: HTMLElement): void {
    if (this.picking) return;
    this.tooltip.replaceChildren();
    const title = document.createElement('h3'); title.textContent = part.name;
    const cost = document.createElement('strong'); cost.textContent = part.deferred ? 'Planned' : `$${part.cost}M`;
    const description = document.createElement('p'); description.textContent = part.briefing;
    this.tooltip.append(title, cost, facts(part), description); this.tooltip.hidden = false;
    const rect = tile.getBoundingClientRect();
    this.tooltip.style.left = `${Math.min(rect.right + 12, Math.max(8, window.innerWidth - 288))}px`;
    this.tooltip.style.top = `${Math.max(70, Math.min(rect.top, window.innerHeight - 360))}px`;
  }
  refresh(_next: PartDefinition['kind'] | null, fitted: readonly PartDefinition[]): void {
    for (const [id, button] of this.buttons) button.classList.toggle('fitted', fitted.some(p => p.id === id));
    this.returnTray.disabled = !fitted.length;
  }
  select(id: string | null): void {
    this.picking = id !== null; if (this.picking) this.tooltip.hidden = true;
    for (const [key, button] of this.buttons) button.setAttribute('aria-pressed', String(id === key));
  }
  message(text: string): void { this.status.textContent = text; }
  update(analysis: StackAnalysis, _spent: number, readiness?: Readiness, par?: number | null): void {
    this.readout.replaceChildren();
    for (const [label, value] of [['Mass', `${(analysis.liftoffMass / 1000).toFixed(1)} t`],
      ['Delta-v (m/s)', `${Math.round(analysis.totalDeltaV).toLocaleString('en-US')} / ${LEO_DELTA_V_REQUIRED.toLocaleString('en-US')}`],
      ['TWR', analysis.liftoffTWR.toFixed(2)], ['Stages', String(analysis.stageCount)]]) {
      const row = document.createElement('div'), name = document.createElement('span'), metric = document.createElement('b');
      name.textContent = label!; metric.textContent = value!; row.append(name, metric); this.readout.append(row);
    }
    if (!readiness) return;
    this.verdict.dataset.verdict = readiness.verdict; this.verdict.replaceChildren();
    const headline = document.createElement('strong'); headline.textContent = readiness.headline;
    const detail = document.createElement('p');
    detail.textContent = readiness.verdict === 'incomplete' ? analysis.verdict
      : readiness.verdict === 'go' || readiness.verdict === 'marginal' ? `${Math.round(analysis.totalDeltaV - LEO_DELTA_V_REQUIRED)} m/s margin`
      : analysis.stageCount === 1 && analysis.totalDeltaV < LEO_DELTA_V_REQUIRED
        ? 'Add a tank + vacuum engine above the booster'
        : readiness.detail;
    this.verdict.append(headline, detail);
    if (par != null) { const line = document.createElement('small'); line.textContent = `Par $${par}M`; this.verdict.append(line); }
    this.lastVerdict = readiness.verdict;
  }
  get currentVerdict(): Readiness['verdict'] | null { return this.lastVerdict; }
  flashCost(amount: number): void {
    const tag = document.createElement('span'); tag.className = `cost-float ${amount < 0 ? 'spend' : 'refund'}`;
    tag.textContent = `${amount < 0 ? '−' : '+'}$${Math.abs(amount)}M`;
    this.chrome.append(tag); window.setTimeout(() => tag.remove(), 1500);
  }
  shake(): void { this.element.classList.remove('shake'); void this.element.offsetWidth; this.element.classList.add('shake'); }
  dispose(): void {
    for (const node of [this.element, this.specs, this.status, this.returnTray, this.tooltip, this.inspection]) node.remove();
  }
}
