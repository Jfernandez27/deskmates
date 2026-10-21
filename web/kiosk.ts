/** Kiosk state: the office alone, the bar back for a few seconds after a tap. No DOM; the page applies it. */
export const PEEK_MS = 4_000;
export const KIOSK_KEY = "deskmates.kiosk";
export type KioskState = { on: boolean; peekUntil: number };   // peekUntil 0 = bar hidden (when on)
export type Storage = { get(): string | null; set(v: string): void };

export class Kiosk {
  private s: KioskState;
  private readonly opts: { urlKiosk: boolean; demo: boolean; storage: Storage; now: () => number };

  /** `urlKiosk` is `?kiosk`; `demo` ignores storage; `now` is a clock in ms. */
  constructor(opts: { urlKiosk: boolean; demo: boolean; storage: Storage; now: () => number }) {
    this.opts = opts;
    const saved = opts.demo ? null : opts.storage.get();
    this.s = { on: opts.urlKiosk || saved === "1", peekUntil: 0 };
  }

  get state(): KioskState { return { ...this.s }; }

  /** The button: toggles kiosk, saves the choice (not under demo), ends any peek. Returns true when it just turned on. */
  toggle(): boolean {
    this.s = { on: !this.s.on, peekUntil: 0 };
    if (!this.opts.demo) this.opts.storage.set(this.s.on ? "1" : "0");
    return this.s.on;
  }

  /** A tap on the office while on: shows the bar until now + PEEK_MS, extending an open peek. No effect when off. */
  tap(): void {
    if (this.s.on) this.s.peekUntil = this.opts.now() + PEEK_MS;
  }

  /** Whether the bar is visible right now: off, or on and peeking. */
  barVisible(): boolean {
    return !this.s.on || this.opts.now() < this.s.peekUntil;
  }

  /** Full screen was lost (Escape, system gesture, screen lock): nothing changes. */
  fullscreenLost(): void {}
}
