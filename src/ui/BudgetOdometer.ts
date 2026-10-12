/** A higher drum turns only during the final unit before its carry.
 *  At 199.5 the hundreds, tens and ones all show half a turn toward 200.
 *  The duplicate zero at the end of each strip makes 9 → 0 continuous. */
export function drumPosition(value: number, place: number): number {
  const safe = Math.max(0, value);
  const digit = Math.floor(safe / place) % 10;
  const carry = Math.max(0, (safe % place) - (place - 1));
  return digit + carry;
}

/** Masked vertical strips, animated from the displayed amount so a second
 *  purchase can interrupt the first without jumping. Values are millions. */
export class BudgetOdometer {
  private strips: HTMLElement[] = [];
  private displayed = 0;
  private target = 0;
  private from = 0;
  private elapsed = 0.65;
  private initialized = false;

  constructor(private readonly element: HTMLElement) {
    element.classList.add('odometer');
    element.setAttribute('role', 'img');
  }

  setValue(value: number): void {
    const next = Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
    if (this.initialized && next === this.target) return;
    const digits = Math.max(3, String(Math.max(next, Math.ceil(this.displayed))).length);
    if (this.strips.length !== digits) this.build(digits);
    this.element.setAttribute('aria-label', `${next} million dollars available`);
    this.element.dataset.value = String(next);
    this.target = next;
    if (!this.initialized || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      this.initialized = true;
      this.elapsed = 0.65;
      this.paint(next);
      return;
    }
    this.from = this.displayed;
    this.elapsed = 0;
  }

  /** Advance using the game's existing frame loop; no extra listeners/timers. */
  update(dt: number): void {
    if (this.elapsed >= 0.65) return;
    this.elapsed = Math.min(0.65, this.elapsed + Math.max(0, dt));
    const progress = this.elapsed / 0.65;
    // Smooth stop without overshoot: budget digits must never invent funds.
    const eased = 1 - Math.pow(1 - progress, 3);
    this.paint(this.from + (this.target - this.from) * eased);
  }

  private build(count: number): void {
    this.element.replaceChildren();
    this.strips = [];
    for (let i = 0; i < count; i++) {
      const slot = document.createElement('span');
      slot.className = 'drum-slot';
      slot.setAttribute('aria-hidden', 'true');
      const strip = document.createElement('span');
      strip.className = 'drum-strip';
      for (let digit = 0; digit <= 10; digit++) {
        const cell = document.createElement('span');
        cell.textContent = String(digit % 10);
        strip.append(cell);
      }
      slot.append(strip);
      this.element.append(slot);
      this.strips.push(strip);
    }
  }

  private paint(value: number): void {
    this.displayed = value;
    this.strips.forEach((strip, index) => {
      const place = 10 ** (this.strips.length - index - 1);
      // Percent is relative to the eleven-cell strip, avoiding font measurement.
      strip.style.transform = `translateY(${-drumPosition(value, place) * 100 / 11}%)`;
    });
  }
}
