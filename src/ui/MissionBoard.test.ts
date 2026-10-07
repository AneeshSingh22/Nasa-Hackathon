// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { MissionBoard } from './MissionBoard';
import { CAMPAIGN, type CampaignContract } from '../game/campaign';

/**
 * The mission board is the first thing a player sees, so it has to show the
 * right missions as open, the right ones as locked, and the stars earned.
 */

let container: HTMLElement;
beforeEach(() => {
  container = document.createElement('div');
  document.body.replaceChildren(container);
});

const card = (id: string) => container.querySelector<HTMLButtonElement>(`[data-contract="${id}"]`)!;

describe('the mission board', () => {
  it('lists every contract with its customer, pay, budget and par', () => {
    new MissionBoard(container, { onSelect: () => {} }, {}, CAMPAIGN[0]!.id);
    for (const contract of CAMPAIGN) {
      const text = card(contract.id).textContent!;
      expect(text).toContain(contract.title);
      expect(text).toContain(contract.customer);
      expect(text).toContain(`$${contract.payment}M`);
      expect(text).toContain(`$${contract.par}M`);
    }
  });

  it('opens only the first contract for a new player', () => {
    new MissionBoard(container, { onSelect: () => {} }, {}, CAMPAIGN[0]!.id);
    expect(card(CAMPAIGN[0]!.id).disabled).toBe(false);
    for (const contract of CAMPAIGN.slice(1)) expect(card(contract.id).disabled).toBe(true);
    expect(card(CAMPAIGN[1]!.id).textContent).toMatch(/Earn a star on Relay Run/);
  });

  it('shows earned stars and opens the next contract', () => {
    const record = { [CAMPAIGN[0]!.id]: 2 };
    new MissionBoard(container, { onSelect: () => {} }, record, CAMPAIGN[0]!.id);
    expect(card(CAMPAIGN[0]!.id).querySelectorAll('.card-stars i.earned')).toHaveLength(2);
    expect(card(CAMPAIGN[1]!.id).disabled).toBe(false);
    expect(container.querySelector('.board-total')!.textContent).toContain('2 / 12');
  });

  it('selects a contract when its card is clicked', () => {
    const chosen: CampaignContract[] = [];
    const record = { [CAMPAIGN[0]!.id]: 1 };
    const board = new MissionBoard(container, { onSelect: c => chosen.push(c) }, record, CAMPAIGN[0]!.id);
    card(CAMPAIGN[1]!.id).click();
    expect(chosen.map(c => c.id)).toEqual([CAMPAIGN[1]!.id]);
    expect(board.selected.id).toBe(CAMPAIGN[1]!.id);
    expect(card(CAMPAIGN[1]!.id).classList.contains('selected')).toBe(true);
  });

  it('ignores clicks on a locked contract', () => {
    const chosen: CampaignContract[] = [];
    new MissionBoard(container, { onSelect: c => chosen.push(c) }, {}, CAMPAIGN[0]!.id);
    card(CAMPAIGN[3]!.id).click();
    expect(chosen).toHaveLength(0);
  });
});
