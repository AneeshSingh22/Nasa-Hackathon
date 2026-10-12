// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BudgetOdometer, drumPosition } from './BudgetOdometer';

afterEach(() => vi.unstubAllGlobals());

describe('mechanical budget drums', () => {
  it('holds higher digits until a carry and rolls all drums through 199 → 200', () => {
    expect(drumPosition(148.9, 100)).toBe(1);
    expect(drumPosition(148.9, 10)).toBe(4);
    expect(drumPosition(148.9, 1)).toBeCloseTo(8.9);
    expect(drumPosition(199.5, 100)).toBeCloseTo(1.5);
    expect(drumPosition(199.5, 10)).toBeCloseTo(9.5);
    expect(drumPosition(199.5, 1)).toBeCloseTo(9.5);
    expect(drumPosition(200, 100)).toBe(2);
    expect(drumPosition(200, 10)).toBe(0);
    expect(drumPosition(200, 1)).toBe(0);
  });

  it('animates purchases and interrupted refunds, then settles on real funds', () => {
    const node = document.createElement('div');
    const meter = new BudgetOdometer(node);
    meter.setValue(300);
    const strips = [...node.querySelectorAll<HTMLElement>('.drum-strip')];
    expect(strips).toHaveLength(3);
    expect(strips[0]!.children).toHaveLength(11);
    expect(strips[0]!.lastElementChild!.textContent).toBe('0');
    const initial = strips.map(s => s.style.transform);
    meter.setValue(299);
    expect(strips.map(s => s.style.transform)).toEqual(initial);
    meter.update(0.2);
    const halfway = strips.map(s => s.style.transform);
    expect(halfway).not.toEqual(initial);
    meter.setValue(300);
    expect(strips.map(s => s.style.transform)).toEqual(halfway);
    meter.update(1);
    expect(strips.map(s => s.style.transform)).toEqual(initial);
    expect(node.getAttribute('aria-label')).toBe('300 million dollars available');
    meter.setValue(290);
    meter.update(1);
    expect(strips[1]!.style.transform).toBe(`translateY(${-9 * 100 / 11}%)`);
    expect(strips[2]!.style.transform).toBe('translateY(0%)');
  });

  it('honours reduced motion, clamps negative budgets, and grows for larger grants', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const node = document.createElement('div');
    const meter = new BudgetOdometer(node);
    meter.setValue(1000);
    expect(node.querySelectorAll('.drum-slot')).toHaveLength(4);
    meter.setValue(-2);
    expect(node.getAttribute('aria-label')).toBe('0 million dollars available');
    expect([...node.querySelectorAll<HTMLElement>('.drum-strip')].every(s => s.style.transform === 'translateY(0%)')).toBe(true);
    meter.update(1);
    expect(node.dataset.value).toBe('0');
  });
});
