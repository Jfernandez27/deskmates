import { test, expect } from "vitest";
import { cast, eventsAt, endAll, normalize, DEFAULTS } from "../../src/cli/demo.ts";
import { reduce, emptyState } from "../../src/core/reducer.ts";
import { parseBody } from "../../src/server/ingest.ts";

test("options are clamped and unknown tools dropped", () => {
  expect(normalize({ agents: 500, meetings: -2, tools: ["codex", "msword"], seconds: NaN })).toMatchObject({ agents: 40, meetings: 0, tools: ["codex"], seconds: 0 });
});

test("the cast matches the options", () => {
  const c = cast(normalize({ agents: 5, meetings: 2, waiting: 1, subagents: 2, breaks: 1, tools: ["codex"] }));
  const count = (k: string) => c.filter((x) => x.kind === k).length;
  expect([count("worker"), count("meeter"), count("waiter"), count("breaker"), count("sub")]).toEqual([5, 4, 1, 1, 2]);
  expect(c.filter((x) => x.kind === "worker").map((x) => x.ev.source)).toEqual(["claude", "codex", "claude", "codex", "claude"]);
  const meeters = c.filter((x) => x.kind === "meeter");
  expect(meeters[0].ev.cwd).toBe(meeters[1].ev.cwd);
  expect(meeters[2].ev.cwd).not.toBe(meeters[0].ev.cwd);
  for (const s of c.filter((x) => x.kind === "sub")) expect(c.some((p) => p.ev.session === s.ev.parent)).toBe(true);
});

test("every event passes the ingest API validation, and the office fills as asked", () => {
  const c = cast(normalize({ ...DEFAULTS, agents: 9 }));
  let state = emptyState();
  for (let t = 0; t < 40; t++) {
    const evs = eventsAt(c, t, new Date(1_800_000_000_000 + t * 4000));
    if (!evs.length) continue;
    for (let i = 0; i < evs.length; i += 100) parseBody(evs.slice(i, i + 100));
    for (const e of evs) state = reduce(state, e);
  }
  const chars = Object.values(state.characters);
  expect(chars.filter((x) => !x.parent).length).toBe(9 + 2 + 1 + 1);
  expect(chars.some((x) => x.status === "waiting")).toBe(true);
  expect(state.rooms).toBe(2);
  for (const e of endAll(c, new Date(1_800_000_000_000 + 41 * 4000))) state = reduce(state, e);
  expect(Object.values(state.characters).every((x) => x.status === "leaving")).toBe(true);
});

test("both sides of a meeting go idle at the same tick", () => {
  const c = cast(normalize({ agents: 0, meetings: 1, waiting: 0, subagents: 0, breaks: 0, tools: [] }));
  const idleAt = (side: string) => Array.from({ length: 60 }, (_, t) => t).filter((t) => eventsAt(c, t).some((e) => e.session === side && e.kind === "idle"));
  expect(idleAt("m0-0")).toEqual(idleAt("m0-1"));
  expect(idleAt("m0-0").length).toBeGreaterThan(0);
});

test("a flag that was not given keeps its default", () => {
  expect(normalize({ agents: undefined, seconds: undefined } as never)).toMatchObject({ agents: DEFAULTS.agents, seconds: DEFAULTS.seconds });
});

test("--pcs spreads the cast over PCs and keeps a subagent on its parent's PC", () => {
  const c = cast(normalize({ agents: 4, meetings: 0, waiting: 2, subagents: 2, breaks: 0, tools: [], pcs: 3 }));
  const owners = new Set(c.map((m) => m.ev.owner));
  expect(owners).toEqual(new Set(["demo-pc0", "demo-pc1", "demo-pc2"]));
  for (const m of c) {
    expect(m.ev.ownerName).toBeTruthy();
    expect(m.ev.ownerHost).toMatch(/^[a-zA-Z0-9.-]{1,64}$/);
  }
  for (const sub of c.filter((m) => m.kind === "sub")) {
    const parent = c.find((m) => m.ev.session === sub.ev.parent)!;
    expect(sub.ev.owner).toBe(parent.ev.owner);
  }
  expect(cast(normalize({ agents: 2, pcs: 0 })).every((m) => m.ev.owner === undefined)).toBe(true);
});
