import {
  CAMPAIGN, isUnlocked, totalStars, type CampaignContract, type StarRecord,
} from '../game/campaign';

/**
 * The mission board: choose a contract before entering the building.
 *
 * It replaces a start card that was a page of instructions. A board of jobs
 * with customers, money and difficulty is what makes the build phase a
 * decision before the player has touched a part, and the stars on each card
 * are the reason to come back to one already finished.
 */

const DIFFICULTY_NAMES = ['EASY', 'NORMAL', 'HARD', 'EXPERT'];

export interface MissionBoardOptions {
  readonly onSelect: (contract: CampaignContract) => void;
}

export class MissionBoard {
  readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private readonly total: HTMLElement;
  private selectedId: string;

  constructor(container: HTMLElement, private readonly options: MissionBoardOptions,
    record: StarRecord, selectedId: string) {
    this.selectedId = selectedId;
    this.root = document.createElement('div');
    this.root.className = 'mission-board';

    const header = document.createElement('header');
    header.className = 'board-header';
    const titles = document.createElement('div');
    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = 'Ad Astra Program · Contract board';
    const heading = document.createElement('h1');
    heading.textContent = 'Choose your mission';
    titles.append(eyebrow, heading);
    this.total = document.createElement('div');
    this.total.className = 'board-total';
    header.append(titles, this.total);

    const intro = document.createElement('p');
    intro.className = 'board-intro';
    intro.textContent = 'Design a rocket in the workshop, then fly it to orbit. '
      + 'Earn stars for reaching orbit, coming in under par, and flying it yourself.';

    this.list = document.createElement('div');
    this.list.className = 'board-list';
    this.list.setAttribute('role', 'listbox');
    this.list.setAttribute('aria-label', 'Contracts');

    this.root.append(header, intro, this.list);
    container.prepend(this.root);
    this.render(record);
  }

  get selected(): CampaignContract {
    return CAMPAIGN.find(contract => contract.id === this.selectedId) ?? CAMPAIGN[0]!;
  }

  /** Highlight a contract without firing the selection callback. */
  select(contractId: string): void {
    this.selectedId = contractId;
    for (const card of this.list.querySelectorAll<HTMLElement>('.board-card')) {
      const on = card.dataset.contract === contractId;
      card.classList.toggle('selected', on);
      card.setAttribute('aria-selected', String(on));
    }
  }

  render(record: StarRecord): void {
    const earned = totalStars(record);
    this.total.textContent = `★ ${earned} / ${CAMPAIGN.length * 3}`;
    this.list.replaceChildren();

    CAMPAIGN.forEach((contract, index) => {
      const open = isUnlocked(index, record);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'board-card';
      card.dataset.contract = contract.id;
      card.setAttribute('role', 'option');
      card.setAttribute('aria-selected', String(contract.id === this.selectedId));
      card.disabled = !open;
      card.classList.toggle('selected', contract.id === this.selectedId);

      const top = document.createElement('div');
      top.className = 'card-top';
      const customer = document.createElement('span');
      customer.className = 'card-customer';
      customer.textContent = contract.customer;
      const difficulty = document.createElement('span');
      difficulty.className = 'card-difficulty';
      // Words, not glyphs: four small triangles were illegible at card size.
      difficulty.textContent = DIFFICULTY_NAMES[contract.difficulty - 1] ?? '';
      difficulty.dataset.level = String(contract.difficulty);
      difficulty.title = `Difficulty ${contract.difficulty} of 4`;
      top.append(customer, difficulty);

      const title = document.createElement('strong');
      title.className = 'card-title';
      title.textContent = contract.title;

      const tagline = document.createElement('span');
      tagline.className = 'card-tagline';
      tagline.textContent = open
        ? contract.tagline
        : `Earn a star on ${CAMPAIGN[index - 1]?.title ?? 'the previous mission'} to unlock.`;

      const facts = document.createElement('div');
      facts.className = 'card-facts';
      for (const [label, value] of [
        ['Pays', `$${contract.payment}M`],
        ['Budget', `$${contract.budget}M`],
        ['Par', `$${contract.par}M`],
      ] as Array<[string, string]>) {
        const fact = document.createElement('span');
        const l = document.createElement('small');
        l.textContent = label;
        const v = document.createElement('b');
        v.textContent = value;
        fact.append(l, v);
        facts.append(fact);
      }

      const stars = document.createElement('div');
      stars.className = 'card-stars';
      const best = record[contract.id] ?? 0;
      for (let i = 0; i < 3; i++) {
        const star = document.createElement('i');
        star.textContent = '★';
        star.classList.toggle('earned', i < best);
        stars.append(star);
      }
      if (!open) stars.classList.add('locked');

      card.append(top, title, tagline, facts, stars);
      card.addEventListener('click', () => {
        if (!open) return;
        this.selectedId = contract.id;
        this.options.onSelect(contract);
        this.render(record);
      });
      this.list.append(card);
    });
  }

  dispose(): void {
    this.root.remove();
  }
}
