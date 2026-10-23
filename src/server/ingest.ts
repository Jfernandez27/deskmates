import { timingSafeEqual } from "node:crypto";
import type { AgentEvent, EventKind } from "../types/events.ts";

export const MAX_EVENTS_PER_REQUEST = 100;
export const RATE_PER_MINUTE = 600;
const KINDS: EventKind[] = ["start", "tool", "waiting", "idle", "end", "usage"];
/** the longest each optional string field may be; the relay trims to these before sending */
export const FIELDS: Record<string, number> = { profile: 80, parent: 200, agent: 80, name: 40, ownerName: 40, model: 80, cwd: 400, tool: 80, detail: 120 };

export class IngestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export function checkToken(header: string | undefined, token: string): boolean {
  const m = /^Bearer (.+)$/.exec(header ?? "");
  if (!m) return false;
  const a = Buffer.from(m[1]), b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Validates one event from the public API. Throws IngestError naming the field that failed. */
export function validate(raw: unknown, i: number, now: Date, skewMs = 0): AgentEvent {
  const at = (f: string) => `events[${i}].${f}`;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new IngestError(400, `events[${i}] must be an object`);
  const r = raw as Record<string, unknown>;
  if (typeof r.source !== "string" || !/^[a-z0-9][a-z0-9._-]{0,39}$/.test(r.source)) throw new IngestError(400, `${at("source")} must match [a-z0-9._-], 1-40 chars`);
  if (typeof r.session !== "string" || r.session.length < 1 || r.session.length > 200) throw new IngestError(400, `${at("session")} must be a string of 1-200 chars`);
  if (!KINDS.includes(r.kind as EventKind)) throw new IngestError(400, `${at("kind")} must be one of ${KINDS.join(", ")}`);
  const ev: AgentEvent = { source: r.source, session: r.session, kind: r.kind as EventKind, ts: now.toISOString(), transport: "api" };
  for (const [f, max] of Object.entries(FIELDS)) {
    const v = r[f];
    if (v === undefined) continue;
    if (typeof v !== "string" || v.length > max) throw new IngestError(400, `${at(f)} must be a string of at most ${max} chars`);
    (ev as Record<string, unknown>)[f] = v;
  }
  if (r.owner !== undefined) {
    if (typeof r.owner !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(r.owner)) throw new IngestError(400, `${at("owner")} must match [a-z0-9._-], 1-64 chars`);
    ev.owner = r.owner;
  }
  if (r.ownerHost !== undefined) {
    if (typeof r.ownerHost !== "string" || !/^[a-zA-Z0-9.-]{1,64}$/.test(r.ownerHost)) throw new IngestError(400, `${at("ownerHost")} must match [a-zA-Z0-9.-], 1-64 chars`);
    ev.ownerHost = r.ownerHost;
  }
  if (r.ts !== undefined) {
    const t = (typeof r.ts === "string" ? Date.parse(r.ts) : NaN) + skewMs;
    if (Number.isNaN(t)) throw new IngestError(400, `${at("ts")} must be an ISO 8601 date`);
    ev.ts = new Date(Math.min(t, now.getTime())).toISOString(); // a clock ahead of ours must not freeze the character
  }
  if (r.tokens !== undefined) {
    const t = r.tokens as Record<string, unknown>;
    const ok = (k: string, req: boolean) => (t?.[k] === undefined ? !req : typeof t[k] === "number" && Number.isFinite(t[k] as number) && (t[k] as number) >= 0);
    if (!t || typeof t !== "object" || !ok("input", true) || !ok("output", true) || !ok("cacheRead", false) || !ok("cacheWrite", false))
      throw new IngestError(400, `${at("tokens")} needs non-negative numbers input and output (cacheRead, cacheWrite optional)`);
    ev.tokens = { input: t.input as number, output: t.output as number, ...(t.cacheRead !== undefined ? { cacheRead: t.cacheRead as number } : {}), ...(t.cacheWrite !== undefined ? { cacheWrite: t.cacheWrite as number } : {}) };
  }
  return ev;
}

/** Clocks closer than this are taken as they are. */
const SKEW_TOLERANCE_MS = 2_000;

/**
 * `senderClock` is the sender's own time when it sent the request (header x-deskmates-clock, set by the relay):
 * timestamps are moved by the difference, so a PC whose clock is minutes off does not fall asleep or walk out on the lab.
 */
export function parseBody(body: unknown, now = new Date(), senderClock?: number): AgentEvent[] {
  const skew = senderClock !== undefined && Number.isFinite(senderClock) ? now.getTime() - senderClock : 0;
  const skewMs = Math.abs(skew) > SKEW_TOLERANCE_MS ? skew : 0;
  const list = Array.isArray(body) ? body : [body];
  if (list.length === 0) throw new IngestError(400, "no events");
  if (list.length > MAX_EVENTS_PER_REQUEST) throw new IngestError(413, `at most ${MAX_EVENTS_PER_REQUEST} events per request`);
  return list.map((e, i) => validate(e, i, now, skewMs));
}

/** Fixed one-minute window per token. */
export class RateLimit {
  private windowStart = 0;
  private count = 0;
  take(n: number, now = Date.now()): boolean {
    if (now - this.windowStart >= 60_000) { this.windowStart = now; this.count = 0; }
    if (this.count + n > RATE_PER_MINUTE) return false;
    this.count += n;
    return true;
  }
}

/** One RateLimit per bucket (a relaying PC, or the token itself); buckets idle for over a minute are forgotten. */
export class RateLimits {
  private buckets = new Map<string, { limit: RateLimit; last: number }>();
  take(bucket: string, n: number, now = Date.now()): boolean {
    for (const [k, b] of this.buckets) if (now - b.last > 60_000) this.buckets.delete(k);
    let b = this.buckets.get(bucket);
    if (!b) this.buckets.set(bucket, (b = { limit: new RateLimit(), last: now }));
    b.last = now;
    return b.limit.take(n, now);
  }
}
