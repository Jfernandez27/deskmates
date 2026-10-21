import type { ViewCharacter } from "../src/server/server.ts";

export const RATE_LIMIT_MS = 30_000;
export const FINISHED_AFTER_MS = 2 * 60_000;
export type Alert = { key: string; kind: "waiting" | "finished"; title: string; body: string };

const who = (c: ViewCharacter) => c.agent ?? c.label;

/** Decides which state changes deserve a sound/notification. Pure apart from the clock. */
export class Alerts {
  private prev = new Map<string, ViewCharacter>();
  private last = new Map<string, number>();
  private primed = false;
  private now: () => number;
  constructor(now = () => Date.now()) { this.now = now; }

  next(chars: ViewCharacter[]): Alert[] {
    const out: Alert[] = [];
    for (const c of chars) {
      const p = this.prev.get(c.key);
      if (!this.primed || !p) continue;
      let alert: Alert | undefined;
      if (c.status === "waiting" && p.status !== "waiting")
        alert = { key: c.key, kind: "waiting", title: `${who(c)} needs you`, body: [c.tool, c.detail].filter(Boolean).join(" ") || c.label };
      else if (c.status === "idle" && p.status === "working" && (c.workedMs ?? 0) > FINISHED_AFTER_MS)
        alert = { key: c.key, kind: "finished", title: `${who(c)} finished`, body: c.label };
      if (alert && this.now() - (this.last.get(c.key) ?? -Infinity) >= RATE_LIMIT_MS) {
        this.last.set(c.key, this.now());
        out.push(alert);
      }
    }
    this.prev = new Map(chars.map((c) => [c.key, c]));
    this.primed = true;
    return out;
  }
}

const MUTE_KEY = "deskmates.muted";
export function isMuted(): boolean { try { return localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; } }
export function setMuted(v: boolean) { try { localStorage.setItem(MUTE_KEY, v ? "1" : "0"); } catch { /* private mode */ } }

let audio: AudioContext | undefined;
/** Short synthesized chime; browsers only allow it after one user gesture on the page. */
export function chime(kind: Alert["kind"]) {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
    const notes = kind === "waiting" ? [880, 1175] : [660];
    notes.forEach((hz, i) => {
      const o = audio!.createOscillator(), g = audio!.createGain();
      const t0 = audio!.currentTime + i * 0.12;
      o.frequency.value = hz; o.type = "triangle";
      g.gain.setValueAtTime(kind === "waiting" ? 0.15 : 0.07, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.25);
      o.connect(g).connect(audio!.destination); o.start(t0); o.stop(t0 + 0.26);
    });
  } catch { /* no audio available */ }
}

export function deliver(a: Alert) {
  if (isMuted()) return;
  chime(a.kind);
  if (typeof Notification !== "undefined" && document.hidden && Notification.permission === "granted")
    new Notification(a.title, { body: a.body, tag: `deskmates-${a.key}`, silent: true });
}
