import type { AgentEvent, Tokens } from "../types/events.ts";
import { keyOf } from "./reducer.ts";

/** A silence longer than this cuts a working stretch: the gap does not count as work (the office shows the agent asleep). */
export const WORK_GAP_MS = 10 * 60_000;
/** Waiting for you counts until the agent would have left the office. */
export const WAIT_GAP_MS = 30 * 60_000;

type Phase = "working" | "waiting" | "idle" | "ended";

/** One session's day. Counts only: never prompts, tool names, details or contents. */
export type SessionDay = {
  key: string;
  source: string;
  profile?: string;
  agent?: string;
  cwd?: string;
  parent?: string;
  /** ISO times */
  firstSeen: string;
  lastSeen: string;
  ended: boolean;
  workingMs: number;
  waitingMs: number;
  tools: number;
  /** latest cumulative usage reported for the session */
  tokens?: Tokens;
  /** bit h set = active during hour h (local) */
  hourMask: number;
  /** where the session stood at its last event, so the next one (or a restart) can continue the count */
  phase: Phase;
  /** ms epoch the counters were last advanced to */
  at: number;
};

export type Day = { version: 1; date: string; sessions: Record<string, SessionDay> };

export type SessionView = Omit<SessionDay, "hourMask" | "phase" | "at">;
export type HistoryView = {
  date: string;
  sessions: SessionView[];
  totals: { sessions: number; workingMs: number; tokens: number };
  hours: number[];
};

const pad = (n: number) => String(n).padStart(2, "0");
/** Server-local calendar day, YYYY-MM-DD. */
export const localDate = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const nextMidnight = (ms: number) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime(); };

export const emptyDay = (date: string): Day => ({ version: 1, date, sessions: {} });

/** Sets the hour bits covered by [from, to] (same local day). */
function markHours(mask: number, from: number, to: number): number {
  const h0 = new Date(from).getHours(), h1 = new Date(Math.max(from, to)).getHours();
  for (let h = h0; h <= h1; h++) mask |= 1 << h;
  return mask;
}

/** Advances a session's counters to time t, according to the phase it was in. */
function advance(s: SessionDay, t: number): SessionDay {
  const d = t - s.at;
  if (d <= 0) return s;
  let { workingMs, waitingMs, hourMask } = s;
  if (s.phase === "working" && d <= WORK_GAP_MS) { workingMs += d; hourMask = markHours(hourMask, s.at, t); }
  else if (s.phase === "waiting" && d <= WAIT_GAP_MS) { waitingMs += d; hourMask = markHours(hourMask, s.at, t); }
  return { ...s, workingMs, waitingMs, hourMask, at: t };
}

const nextPhase = (p: Phase, e: AgentEvent): Phase => {
  switch (e.kind) {
    case "start": case "tool": return "working";
    case "waiting": return "waiting";
    case "idle": return "idle";
    case "end": return "ended";
    case "usage": return p;
  }
};

/** Pure: folds one event into the day. Events from another calendar day are ignored (see `roll`). */
export function applyEvent(day: Day, e: AgentEvent): Day {
  const t = Date.parse(e.ts);
  if (!Number.isFinite(t) || localDate(t) !== day.date) return day;
  const key = keyOf(e);
  let s = day.sessions[key];
  if (!s) {
    if (e.kind === "usage" || e.kind === "end") return day; // same rule as the office: these never open a session
    s = {
      key, source: e.source, profile: e.profile, agent: e.agent, cwd: e.cwd,
      parent: e.parent ? keyOf({ ...e, session: e.parent }) : undefined,
      firstSeen: e.ts, lastSeen: e.ts, ended: false, workingMs: 0, waitingMs: 0, tools: 0, hourMask: 0, phase: "idle", at: t,
    };
  } else if (s.phase === "ended" && e.kind !== "start" && e.kind !== "usage") {
    return day;
  } else if (t < s.at && e.kind !== "usage") {
    return day; // already counted: a transcript read again from its start after a restart (usage carries totals, so it may)
  }
  s = advance(s, t);
  s = {
    ...s,
    agent: s.agent ?? e.agent,
    cwd: s.cwd ?? e.cwd,
    lastSeen: t >= Date.parse(s.lastSeen) ? new Date(t).toISOString() : s.lastSeen,
    hourMask: s.hourMask | (1 << new Date(t).getHours()),
    tools: s.tools + (e.kind === "tool" && e.tool ? 1 : 0),
    tokens: e.kind === "usage" && e.tokens ? { ...e.tokens } : s.tokens,
    phase: nextPhase(s.phase, e),
  };
  if (s.phase === "ended") s.ended = true;
  else if (e.kind === "start") s.ended = false;
  return { ...day, sessions: { ...day.sessions, [key]: s } };
}

/**
 * Pure: if `now` is past the day's midnight, closes the day (counting work and waits up to midnight)
 * and opens the next one, carrying over sessions that were still working or waiting.
 * Returns the finished day as `closed` when it rolled.
 */
export function roll(day: Day, now: number): { day: Day; closed?: Day } {
  if (localDate(now) <= day.date) return { day };
  const [y, m, d] = day.date.split("-").map(Number);
  const midnight = nextMidnight(new Date(y, m - 1, d, 12).getTime());
  const closedSessions: Record<string, SessionDay> = {};
  const carried: Record<string, SessionDay> = {};
  const today = localDate(now);
  const sameDay = localDate(midnight) === today;
  for (const [k, s0] of Object.entries(day.sessions)) {
    const live = (s0.phase === "working" && midnight - s0.at <= WORK_GAP_MS) || (s0.phase === "waiting" && midnight - s0.at <= WAIT_GAP_MS);
    closedSessions[k] = live ? advance(s0, midnight - 1) : s0;
    if (live && sameDay) {
      const iso = new Date(midnight).toISOString();
      carried[k] = { ...s0, firstSeen: iso, lastSeen: iso, ended: false, workingMs: 0, waitingMs: 0, tools: 0, tokens: s0.tokens, hourMask: 1, at: midnight };
    }
  }
  return { day: { version: 1, date: today, sessions: carried }, closed: { ...day, sessions: closedSessions } };
}

const total = (t?: Tokens) => (t ? t.input + t.output : 0);

/** What the API returns. `now` (same day) also counts the stretch still in progress. */
export function viewOf(day: Day, now?: number): HistoryView {
  const hours = new Array<number>(24).fill(0);
  const sessions: SessionView[] = [];
  for (const s0 of Object.values(day.sessions)) {
    const s = now !== undefined && localDate(now) === day.date ? advance(s0, now) : s0;
    for (let h = 0; h < 24; h++) if (s.hourMask & (1 << h)) hours[h]++;
    const { hourMask: _m, phase: _p, at: _a, ...v } = s;
    sessions.push(v);
  }
  sessions.sort((a, b) => a.firstSeen.localeCompare(b.firstSeen));
  return {
    date: day.date,
    sessions,
    totals: {
      sessions: sessions.length,
      workingMs: sessions.reduce((n, s) => n + s.workingMs, 0),
      tokens: sessions.reduce((n, s) => n + total(s.tokens), 0),
    },
    hours,
  };
}

/** Strict YYYY-MM-DD that is a real calendar date. */
export function isValidDate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Accepts a stored day only if it has the expected shape; anything else is treated as missing. */
export function parseDay(raw: unknown, date: string): Day | undefined {
  const r = raw as Day;
  if (!r || typeof r !== "object" || r.version !== 1 || r.date !== date || !r.sessions || typeof r.sessions !== "object") return undefined;
  const sessions: Record<string, SessionDay> = {};
  for (const [k, s] of Object.entries(r.sessions)) {
    if (!s || typeof s.source !== "string" || typeof s.firstSeen !== "string" || typeof s.lastSeen !== "string") continue;
    const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : 0);
    const str = (x: unknown) => (typeof x === "string" ? x : undefined);
    const tk = s.tokens && typeof s.tokens === "object" ? s.tokens : undefined;
    sessions[k] = {
      key: k, source: s.source, profile: str(s.profile), agent: str(s.agent), cwd: str(s.cwd), parent: str(s.parent),
      firstSeen: s.firstSeen, lastSeen: s.lastSeen, ended: s.ended === true,
      workingMs: n(s.workingMs), waitingMs: n(s.waitingMs), tools: n(s.tools),
      tokens: tk ? {
        input: n(tk.input), output: n(tk.output),
        ...(tk.cacheRead !== undefined ? { cacheRead: n(tk.cacheRead) } : {}),
        ...(tk.cacheWrite !== undefined ? { cacheWrite: n(tk.cacheWrite) } : {}),
      } : undefined,
      hourMask: n(s.hourMask) & 0xffffff,
      phase: (["working", "waiting", "idle", "ended"] as const).includes(s.phase) ? s.phase : "idle",
      at: n(s.at) || Date.parse(s.lastSeen) || 0,
    };
  }
  return { version: 1, date, sessions };
}
