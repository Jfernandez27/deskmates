import { mkdirSync, readFileSync, renameSync, writeFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { isValidDate, parseDay, type Day } from "../core/history.ts";

/** $XDG_STATE_HOME/deskmates/history, or ~/.local/state/deskmates/history. */
export function defaultHistoryDir(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.XDG_STATE_HOME && env.XDG_STATE_HOME.startsWith("/") ? env.XDG_STATE_HOME : join(homedir(), ".local", "state");
  return join(base, "deskmates", "history");
}

/** The file for a date. Throws on anything that is not a strict YYYY-MM-DD, so no path can be smuggled in. */
export function dayFile(dir: string, date: string): string {
  if (!isValidDate(date)) throw new Error(`bad date: ${date}`);
  return join(dir, `${date}.json`);
}

/** Missing, unreadable or malformed files all read as "no history". */
export function loadDay(dir: string, date: string): Day | undefined {
  let raw: string;
  try { raw = readFileSync(dayFile(dir, date), "utf8"); } catch { return undefined; }
  try { return parseDay(JSON.parse(raw), date); } catch { return undefined; }
}

/** Atomic: written to a temporary file next to the target, then renamed over it. */
export function saveDay(dir: string, day: Day): void {
  const file = dayFile(dir, day.date);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(day), { mode: 0o600 });
    renameSync(tmp, file);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
}

/** Debounced writer: at most one write per `delayMs` while events flow, and a final one on flush. */
export class DebouncedSaver {
  private timer?: NodeJS.Timeout;
  private pending?: Day;
  private dir: string;
  private delayMs: number;
  private onError: (e: unknown) => void;
  constructor(dir: string, delayMs = 10_000, onError: (e: unknown) => void = () => {}) {
    this.dir = dir; this.delayMs = delayMs; this.onError = onError;
  }

  schedule(day: Day): void {
    this.pending = day;
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = undefined; this.flush(); }, this.delayMs);
    this.timer.unref();
  }

  /** Writes now; a different day (rollover) is written immediately, without waiting. */
  saveNow(day: Day): void {
    try { saveDay(this.dir, day); } catch (e) { this.onError(e); }
  }

  flush(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    const d = this.pending;
    this.pending = undefined;
    if (d) this.saveNow(d);
  }
}
