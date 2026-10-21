import type { AgentEvent, EventKind, Tokens } from "../types/events.ts";

/** What the demo puts in the office. Every number is clamped to a sensible range. */
export type DemoOptions = {
  /** agents typing and reading at their desks */
  agents: number;
  /** pairs that share a project and meet at the table every couple of minutes */
  meetings: number;
  /** agents waiting for your permission (they show the "?") */
  waiting: number;
  /** subagents, each sitting next to a working agent and handing over when it ends */
  subagents: number;
  /** agents that finish now and then and go to the vending machines */
  breaks: number;
  /** tools shown besides Claude: codex, copilot, cursor, gemini */
  tools: string[];
  /** how long it runs, in seconds; 0 runs until stopped */
  seconds: number;
  /** PCs the cast is spread over, as in a shared office; 0 keeps everyone local, without an owner */
  pcs: number;
};

export const DEFAULTS: DemoOptions = { agents: 6, meetings: 1, waiting: 1, subagents: 1, breaks: 1, tools: ["codex", "copilot", "gemini"], seconds: 600, pcs: 0 };
export const TICK_MS = 4000;
const KNOWN_TOOLS = ["codex", "copilot", "cursor", "gemini"];

const ROLES = ["id3a:designer", "id3a:content-creator", "id3a:community-manager", undefined, undefined, "reviewer", undefined, "Plan"];
const PROJECTS = ["atlas", "harbor", "beacon", "deskmates", "summit", "id3a-website", "quarry", "relay-bridge"];
/** The PCs of a shared-office demo: a name and a host each; the owner id is derived from the index. */
export const PCS: [string, string][] = [["Jesús", "id3a-linux"], ["Ana", "ana-laptop"], ["Beto", "beto-pc"], ["Carla", "carla-mac"], ["Dani", "dani-pc"], ["Eva", "eva-laptop"], ["Fran", "fran-pc"], ["Gala", "gala-mac"]];
const WORK: [string, string][] = [["Edit", "BookingService.php"], ["Bash", "php artisan test"], ["Read", "schema.sql"], ["Grep", "TODO"], ["Write", "README.md"], ["Bash", "npm test"], ["Glob", "**/*.ts"], ["Edit", "reducer.ts"]];

export type Cast = { kind: "worker" | "meeter" | "waiter" | "breaker" | "sub"; ev: Omit<AgentEvent, "kind" | "ts" | "transport">; group?: number };

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.floor(Number.isFinite(n) ? n : lo)));

export function normalize(o: Partial<DemoOptions>): DemoOptions {
  const d = { ...DEFAULTS, ...strip({ ...o }) }; // a flag that was not given must not override its default
  return {
    agents: clamp(d.agents, 0, 40), meetings: clamp(d.meetings, 0, 10), waiting: clamp(d.waiting, 0, 10),
    subagents: clamp(d.subagents, 0, 10), breaks: clamp(d.breaks, 0, 10),
    tools: (d.tools ?? []).filter((t) => KNOWN_TOOLS.includes(t)), seconds: clamp(d.seconds, 0, 24 * 3600),
    pcs: clamp(d.pcs, 0, PCS.length),
  };
}

/** The demo's characters. Deterministic: same options, same office. */
export function cast(o: DemoOptions): Cast[] {
  const out: Cast[] = [];
  const sources = ["claude", ...o.tools];
  for (let i = 0; i < o.agents; i++) {
    const source = sources[i % sources.length];
    const ev = source === "claude"
      ? { source, profile: "demo", session: `w${i}`, agent: ROLES[i % ROLES.length], cwd: `/work/${PROJECTS[i % PROJECTS.length]}` }
      : { source, session: `w${i}`, cwd: `/work/${PROJECTS[i % PROJECTS.length]}` };
    out.push({ kind: "worker", ev: strip(ev) });
  }
  for (let m = 0; m < o.meetings; m++) for (const side of [0, 1])
    out.push({ kind: "meeter", group: m, ev: strip({ source: "claude", profile: "demo", session: `m${m}-${side}`, agent: side ? "id3a:content-creator" : "id3a:community-manager", cwd: `/work/campaign-${m + 1}` }) });
  for (let i = 0; i < o.waiting; i++)
    out.push({ kind: "waiter", ev: { source: "claude", profile: "demo", session: `q${i}`, agent: "Plan", cwd: `/work/${PROJECTS[(i + 3) % PROJECTS.length]}` } });
  for (let i = 0; i < o.breaks; i++)
    out.push({ kind: "breaker", ev: { source: "claude", profile: "demo", session: `b${i}`, cwd: `/work/${PROJECTS[(i + 5) % PROJECTS.length]}` } });
  const parents = out.filter((c) => c.kind === "worker" && c.ev.source === "claude");
  for (let i = 0; i < o.subagents && parents.length; i++) {
    const p = parents[i % parents.length];
    out.push({ kind: "sub", ev: { source: "claude", profile: "demo", session: `s${i}`, parent: p.ev.session, agent: "Explore", cwd: p.ev.cwd } });
  }
  if (o.pcs > 0) {
    // round robin over the PCs; a subagent belongs to its parent's PC, since the office keys a parent by the child's owner
    const ownerOf = (k: number) => { const [ownerName, ownerHost] = PCS[k % o.pcs]; return { owner: `demo-pc${k % o.pcs}`, ownerName, ownerHost }; };
    const byKey = new Map<string, number>();
    out.forEach((c, i) => { if (c.kind !== "sub") byKey.set(c.ev.session, i); });
    out.forEach((c, i) => {
      const k = c.kind === "sub" && c.ev.parent !== undefined ? byKey.get(c.ev.parent) ?? i : i;
      Object.assign(c.ev, ownerOf(k));
    });
  }
  return out;
}

function strip<T extends Record<string, unknown>>(o: T): T {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}

const tokensAt = (tick: number, i: number): Tokens => ({ input: 800 * (tick + 1) * (1 + (i % 3)), output: 250 * (tick + 1), cacheRead: 40_000 * (tick + 1), cacheWrite: 20_000 * (tick + 1) });

/** Events to send at a tick. Meetings: both sides go idle for ~45 s every 2 minutes. Breaks: idle every 3 minutes for ~40 s. */
export function eventsAt(c: Cast[], tick: number, now = new Date()): AgentEvent[] {
  const ts = now.toISOString();
  const ev = (x: Cast, kind: EventKind, extra: Partial<AgentEvent> = {}): AgentEvent => ({ ...x.ev, kind, ts, transport: "api", ...extra });
  if (tick === 0) return c.filter((x) => x.kind !== "sub").map((x) => ev(x, "start"));
  const out: AgentEvent[] = [];
  c.forEach((x, i) => {
    const [tool, detail] = WORK[(tick + i) % WORK.length];
    switch (x.kind) {
      case "worker":
        out.push(ev(x, "tool", { tool, detail }), ev(x, "usage", { tokens: tokensAt(tick, i) }));
        break;
      case "meeter": {
        const phase = (tick + (x.group ?? 0) * 7) % 30;
        if (phase === 6) out.push(ev(x, "idle"));
        else if (phase < 6 || phase >= 17) out.push(ev(x, "tool", { tool, detail }));
        break;
      }
      case "waiter":
        if (tick % 45 === 2) out.push(ev(x, "tool", { tool: "Read", detail: "schema.sql" }));
        if (tick % 45 === 3) out.push(ev(x, "waiting", { tool: "Bash", detail: "rm -rf node_modules" }));
        break;
      case "breaker": {
        const phase = (tick + i) % 45;
        if (phase === 10) out.push(ev(x, "idle"));
        else if (phase < 10 || phase > 20) out.push(ev(x, "tool", { tool, detail }));
        break;
      }
      case "sub": {
        const phase = (tick + i * 5) % 20;
        if (phase === 1) out.push(ev(x, "start"));
        else if (phase > 1 && phase < 9) out.push(ev(x, "tool", { tool: phase % 2 ? "Grep" : "Glob", detail: phase % 2 ? "accent" : "**/*.css" }));
        else if (phase === 9) out.push(ev(x, "end"));
        break;
      }
    }
  });
  return out;
}

export function endAll(c: Cast[], now = new Date()): AgentEvent[] {
  return c.map((x) => ({ ...x.ev, kind: "end" as const, ts: now.toISOString(), transport: "api" as const }));
}
