import type { HistoryView, SessionView } from "../src/core/history.ts";
import { shortName } from "./render.ts";
import { fmtElapsed, fmtTokens } from "./anim.ts";

const HOUR = 3_600_000;
const REFRESH_MS = 30_000;

const basename = (p?: string) => (p ? p.replace(/\/+$/, "").split("/").pop() || p : "");
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const hhmm = (ms: number) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const dur = (ms: number) => (ms < 60_000 ? (ms > 0 ? "<1m" : "0m") : fmtElapsed(ms).replace(/ \d+s$/, ""));
const tok = (s: SessionView) => (s.tokens ? s.tokens.input + s.tokens.output : 0);

export type Row = {
  key: string; name: string; full: string; sub: boolean; ended: boolean;
  from: string; to: string;
  /** percent of the timeline */
  left: number; width: number; workShare: number;
  working: string; waiting: string; tokens: string;
};

/** Pure: what the panel shows for a day. The timeline spans whole hours from the first to the last activity. */
export function rowsFor(v: HistoryView): { rows: Row[]; start: number; end: number } {
  const times = v.sessions.flatMap((s) => [Date.parse(s.firstSeen), Date.parse(s.lastSeen)]).filter(Number.isFinite);
  const start = times.length ? Math.floor(Math.min(...times) / HOUR) * HOUR : 0;
  const end = times.length ? Math.max(start + HOUR, Math.ceil((Math.max(...times) + 1) / HOUR) * HOUR) : HOUR;
  const span = end - start;
  const rows = v.sessions.map((s): Row => {
    const a = Date.parse(s.firstSeen), b = Math.max(a, Date.parse(s.lastSeen));
    const folder = basename(s.cwd);
    const name = shortName({ source: s.source, agent: s.agent, label: folder || s.key.split("/").pop()!.slice(0, 8) });
    return {
      key: s.key, name, sub: !!s.parent, ended: s.ended,
      full: [s.profile ?? s.source, s.agent, folder].filter(Boolean).join(" · "),
      from: hhmm(a), to: hhmm(b),
      left: ((a - start) / span) * 100,
      width: Math.max(0.8, ((b - a) / span) * 100),
      workShare: b > a ? Math.min(1, s.workingMs / (b - a)) : s.workingMs > 0 ? 1 : 0,
      working: dur(s.workingMs), waiting: dur(s.waitingMs), tokens: s.tokens ? fmtTokens(tok(s)) : "—",
    };
  });
  return { rows, start, end };
}

/** The "History" side panel: today's sessions, how long they worked and how many tokens they used. */
export class HistoryPanel {
  private button: HTMLButtonElement;
  private panel: HTMLElement;
  private body: HTMLElement;
  private timer?: ReturnType<typeof setInterval>;
  private data?: HistoryView;
  private live: boolean;

  constructor(button: HTMLButtonElement, panel: HTMLElement, live: boolean) {
    this.button = button; this.panel = panel; this.live = live;
    this.body = panel.querySelector(".history-body")!;
    button.addEventListener("click", () => (this.isOpen() ? this.close() : this.open()));
    panel.querySelector(".history-close")!.addEventListener("click", () => this.close());
    // a modal dialog over the panel (Share) takes its own Escape: only the top layer closes
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && this.isOpen() && !document.querySelector("dialog[open]")) { e.preventDefault(); this.close(); } });
  }

  isOpen() { return !this.panel.hidden; }

  open() {
    this.panel.hidden = false;
    this.button.setAttribute("aria-expanded", "true");
    this.render();
    (this.panel.querySelector("h2") as HTMLElement).focus();
    if (this.live) { void this.refresh(); this.timer = setInterval(() => void this.refresh(), REFRESH_MS); }
  }

  close() {
    this.panel.hidden = true;
    this.button.setAttribute("aria-expanded", "false");
    clearInterval(this.timer);
    this.button.focus();
  }

  set(v: HistoryView) { this.data = v; if (this.isOpen()) this.render(); }

  private async refresh() {
    try {
      const r = await fetch("/v1/history", { cache: "no-store" });
      if (r.ok) this.set(await r.json());
      else if (!this.data) this.body.innerHTML = `<p class="h-empty">History is not available.</p>`;
    } catch { if (!this.data) this.body.innerHTML = `<p class="h-empty">Offline.</p>`; }
  }

  private render() {
    const v = this.data;
    if (!v) { this.body.innerHTML = `<p class="h-empty">Loading…</p>`; return; }
    const { rows, start, end } = rowsFor(v);
    const max = Math.max(1, ...v.hours);
    const busiest = v.hours.map((n, h) => (n ? `${h}h: ${n}` : "")).filter(Boolean).join(", ") || "none";
    const bars = v.hours.map((n, h) =>
      `<span class="h-bar${n ? "" : " zero"}" style="height:${n ? Math.max(8, (n / max) * 100) : 4}%" title="${String(h).padStart(2, "0")}:00 · ${n} agent${n === 1 ? "" : "s"}"></span>`).join("");
    const ticks = [0, 6, 12, 18].map((h) => `<span style="left:${(h / 24) * 100}%">${String(h).padStart(2, "0")}</span>`).join("");
    const list = rows.length
      ? rows.map((r) => `<li class="h-row${r.sub ? " sub" : ""}">
          <div class="h-top"><span class="h-name" title="${esc(r.full)}">${r.sub ? "↳ " : ""}${esc(r.name)}</span><span class="h-span">${r.from}–${r.to}</span></div>
          <div class="h-track" aria-hidden="true"><span class="h-seg" style="left:${r.left.toFixed(2)}%;width:${r.width.toFixed(2)}%"><span class="h-work" style="width:${(r.workShare * 100).toFixed(1)}%"></span></span></div>
          <div class="h-stats"><span><b>${r.working}</b> working</span><span><b>${r.waiting}</b> waiting</span><span><b>${r.tokens}</b> tokens</span></div>
        </li>`).join("")
      : `<li class="h-empty">No agents yet today.</li>`;
    this.body.innerHTML = `
      <p class="h-date">${esc(v.date)}</p>
      <dl class="h-totals">
        <div><dt>sessions</dt><dd>${v.totals.sessions}</dd></div>
        <div><dt>working</dt><dd>${dur(v.totals.workingMs)}</dd></div>
        <div><dt>tokens</dt><dd>${fmtTokens(v.totals.tokens)}</dd></div>
      </dl>
      <h3>Agents by hour</h3>
      <div class="h-hours" role="img" aria-label="Active agents per hour: ${busiest}">${bars}</div>
      <div class="h-ticks" aria-hidden="true">${ticks}</div>
      <h3>Sessions <span class="h-range">${rows.length ? `${hhmm(start)}–${hhmm(end)}` : ""}</span></h3>
      <ul class="h-list">${list}</ul>
      <p class="h-legend"><span class="h-key work"></span> working <span class="h-key seen"></span> first to last seen</p>`;
  }
}
