import type { AgentEvent, Character, OfficeState } from "../types/events.ts";
import { FIELDS, validate } from "./ingest.ts";

export type RelayOptions = {
  /** the shared office, e.g. http://lab:47821 */
  url: string; token: string;
  /** this PC's machine id, display name and host name, stamped on every event */
  owner: string; ownerName: string; ownerHost: string;
  fetch?: typeof fetch;
  log?: (line: string) => void;
  /** how often the server flushes (ms); default 250 */
  batchMs?: number;
  /** events held while the shared office is slow or away; the oldest go first; default 1000 */
  buffer?: number;
};

const BATCH = 100;
/** the lab answers 413 over 64 KB; leave room for the brackets and commas */
const MAX_BYTES = 60 * 1024;
const LIMITS: Record<string, number> = { ...FIELDS, session: 200 };
const TIMEOUT_MS = 1000;
const LOG_EVERY_MS = 60_000;
/** after a 429 the lab is over this PC's rate limit, which counts a minute; sending sooner would only be refused again */
const PAUSE_AFTER_429_MS = 60_000;

/**
 * Forwards every event this office keeps to a shared office on another machine.
 * Never slows the local office: `push` only queues, sending happens in `flush` (the server calls it on a timer),
 * every request gives up after a second, and a batch that fails twice is dropped. An event the lab's validator would
 * refuse is dropped alone, so it cannot sink its batch; a 429 keeps the batch and pauses sending for a minute.
 */
export class Relay {
  #o: RelayOptions;
  #fetch: typeof fetch;
  #log: (line: string) => void;
  #buffer: number;
  #queue: AgentEvent[] = [];
  #dropped = 0;
  #lastLog = -Infinity;
  #lastInvalidLog = -Infinity;
  /** no sending before this time (ms), set by a 429 */
  #pausedUntil = -Infinity;
  /** the drain in flight; a flush called meanwhile joins it (the drain keeps going until the queue is empty) */
  #inflight: Promise<void> | undefined;
  /** this office now, sent whole when the lab answers again after a failure */
  #current?: () => OfficeState;
  /** a batch was lost since the lab last took one */
  #lost = false;

  constructor(o: RelayOptions, current?: () => OfficeState) {
    this.#o = o;
    this.#current = current;
    this.#fetch = o.fetch ?? fetch;
    this.#log = o.log ?? ((l) => console.error(l));
    this.#buffer = Math.max(1, o.buffer ?? 1000);
  }

  get dropped(): number { return this.#dropped; }

  /** stamps owner fields and queues; never throws, never awaits */
  push(e: AgentEvent): void {
    const out = this.#stamp(e);
    if (!out) return;
    this.#queue.push(out);
    while (this.#queue.length > this.#buffer) { this.#queue.shift(); this.#dropped++; }
  }

  /** sends everything queued now, at most 100 per request, one retry per batch, 1 s timeout each */
  flush(): Promise<void> {
    if (this.#inflight) return this.#inflight;
    if (Date.now() < this.#pausedUntil) return Promise.resolve();
    this.#inflight = this.#drain().catch(() => {}).finally(() => { this.#inflight = undefined; });
    return this.#inflight;
  }

  /**
   * a copy with the owner fields and every string cut to what the lab's validator accepts, so one long cwd cannot sink a
   * batch; undefined (counted as dropped) when the lab would still refuse it
   */
  #stamp(e: AgentEvent): AgentEvent | undefined {
    const { owner, ownerName, ownerHost } = this.#o;
    const out: Record<string, unknown> = { ...e, owner, ownerName, ownerHost };
    for (const [f, max] of Object.entries(LIMITS)) {
      const v = out[f];
      if (typeof v === "string" && v.length > max) out[f] = v.slice(0, max);
    }
    try {
      validate(out, 0, new Date());
    } catch (err) {
      this.#dropped++;
      const now = Date.now();
      if (now - this.#lastInvalidLog >= LOG_EVERY_MS) {
        this.#lastInvalidLog = now;
        this.#log(`relay: dropped an event the shared office would refuse: ${(err as Error).message}`);
      }
      return undefined;
    }
    return out as AgentEvent;
  }

  /** the next batch off the queue: at most 100 events and MAX_BYTES of JSON */
  #take(): { batch: AgentEvent[]; body: string } {
    const parts: string[] = [];
    let bytes = 2;
    while (parts.length < BATCH && parts.length < this.#queue.length) {
      const json = JSON.stringify(this.#queue[parts.length]);
      const size = Buffer.byteLength(json) + 1;
      if (parts.length && bytes + size > MAX_BYTES) break;
      parts.push(json); bytes += size;
    }
    return { batch: this.#queue.splice(0, parts.length), body: `[${parts.join(",")}]` };
  }

  /** `end` for each character still in `state`, then flush; best effort within 1 s overall */
  async close(state: OfficeState): Promise<void> {
    const ts = new Date().toISOString();
    // ends go first: with a backlog and one second left, they are what the lab most needs
    const ends = Object.values(state.characters).flatMap((c) =>
      this.#stamp({ kind: "end", ts, transport: "api", source: c.source, profile: c.profile, session: c.session, parent: c.parent }) ?? []);
    this.#queue.unshift(...ends);
    while (this.#queue.length > this.#buffer) { this.#queue.pop(); this.#dropped++; }
    // one last try even during a 429 pause: there is no later
    this.#pausedUntil = -Infinity;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([this.flush(), new Promise<void>((ok) => { timer = setTimeout(ok, TIMEOUT_MS); })]);
    clearTimeout(timer);
  }

  async #drain(): Promise<void> {
    while (this.#queue.length && Date.now() >= this.#pausedUntil) {
      const { batch, body } = this.#take();
      let r = await this.#send(body);
      if (r === 429) {
        // over this PC's rate limit: keep the batch for when the minute is up instead of retrying into the limit
        this.#queue.unshift(...batch);
        while (this.#queue.length > this.#buffer) { this.#queue.shift(); this.#dropped++; }
        this.#pausedUntil = Date.now() + PAUSE_AFTER_429_MS;
        return;
      }
      // a 4xx says the lab will refuse it again (bad token, too big, over the limit): no retry
      if (r !== "ok" && !(typeof r === "number" && r >= 400 && r < 500)) r = await this.#send(body);
      if (r === "ok") {
        // the lab may have restarted or never heard of sessions that went quiet while it was away: tell it who is here
        if (this.#lost) { this.#lost = false; for (const e of snapshot(this.#current?.())) this.push(e); }
        continue;
      }
      this.#dropped += batch.length;
      if (r === "unreachable" || (typeof r === "number" && r >= 500)) this.#lost = true;
      const now = Date.now();
      if (now - this.#lastLog >= LOG_EVERY_MS) {
        this.#lastLog = now;
        const why = r === "unreachable" ? "unreachable" : `answered ${r}`;
        this.#log(`relay: ${this.#o.url} ${why} (${this.#dropped} events dropped so far)`);
      }
    }
  }

  /** one attempt: "ok" when the shared office took the batch, its status when it refused, "unreachable" otherwise */
  async #send(body: string): Promise<"ok" | "unreachable" | number> {
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    // a fetch that ignores the signal still cannot hold the queue past the timeout
    const timedOut = new Promise<never>((_, fail) => signal.addEventListener("abort", () => fail(signal.reason), { once: true }));
    try {
      const res = await Promise.race([this.#fetch(`${this.#o.url.replace(/\/+$/, "")}/v1/events`, {
        method: "POST",
        headers: { authorization: `Bearer ${this.#o.token}`, "content-type": "application/json", "x-deskmates-clock": String(Date.now()) },
        body,
        signal,
      }), timedOut]);
      void res.body?.cancel().catch(() => {});
      return res.ok ? "ok" : res.status;
    } catch {
      return "unreachable";
    }
  }
}

const STATUS_EVENT: Partial<Record<Character["status"], AgentEvent["kind"]>> = { working: "tool", waiting: "waiting", idle: "idle", sleeping: "idle" };

/**
 * Every character of `state` as events that rebuild it on the lab: a start, then its status, stamped with the time of
 * its last real event, so the lab's sleep and leave timers stay right and a lab that already knew it changes nothing.
 */
export function snapshot(state: OfficeState | undefined): AgentEvent[] {
  return Object.values(state?.characters ?? {}).flatMap((c): AgentEvent[] => {
    const kind = STATUS_EVENT[c.status];
    if (!kind) return [];
    const base = { source: c.source, profile: c.profile, session: c.session, parent: c.parent, ts: new Date(c.lastEventAt).toISOString(), transport: "api" as const };
    const start: AgentEvent = { ...base, kind: "start", agent: c.agent, name: c.name, model: c.model, cwd: c.cwd };
    const now: AgentEvent = kind === "tool" ? { ...base, kind, tool: c.tool, detail: c.detail } : { ...base, kind };
    const out = [start, now];
    if (c.tokens) out.push({ ...base, kind: "usage", tokens: c.tokens });
    return out.map((e) => Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined)) as AgentEvent);
  });
}
