import { test, expect, vi } from "vitest";
import { Relay } from "../../src/server/relay.ts";
import { emptyState, reduce } from "../../src/core/reducer.ts";
import type { AgentEvent } from "../../src/types/events.ts";

const ev = (p: Partial<AgentEvent>): AgentEvent =>
  ({ source: "claude", session: "s", kind: "start", ts: new Date().toISOString(), transport: "hook", ...p });

test("batches, stamps the owner and respects the 100-event limit", async () => {
  const calls: any[] = [];
  const f = vi.fn(async (_u: string, init: any) => { calls.push(JSON.parse(init.body)); return new Response("{}", { status: 202 }); });
  const r = new Relay({ url: "http://lab:47821", token: "tok", owner: "aaaaaaaa", ownerName: "Ana", ownerHost: "pc", fetch: f as any });
  for (let i = 0; i < 150; i++) r.push(ev({ session: `s${i}` }));
  await r.flush();
  expect(calls.map((b) => b.length)).toEqual([100, 50]);
  expect(calls[0][0]).toMatchObject({ owner: "aaaaaaaa", ownerName: "Ana", ownerHost: "pc", session: "s0" });
  expect(f.mock.calls[0][0]).toBe("http://lab:47821/v1/events");
  expect(f.mock.calls[0][1].headers.authorization).toBe("Bearer tok");
});

test("an unreachable lab costs one retry, then the batch is dropped and logged once a minute", async () => {
  const lines: string[] = [];
  const f = vi.fn(async () => { throw new Error("ECONNREFUSED"); });
  const r = new Relay({ url: "http://lab:47821", token: "tok", owner: "a", ownerName: "A", ownerHost: "h", fetch: f as any, log: (l) => lines.push(l) });
  r.push(ev({})); await r.flush();
  r.push(ev({})); await r.flush();
  expect(f).toHaveBeenCalledTimes(4);
  expect(r.dropped).toBe(2);
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatch(/unreachable/);
});

test("a non-2xx answer is a failure like a refused connection", async () => {
  const f = vi.fn(async () => new Response("{}", { status: 500 }));
  const r = new Relay({ url: "http://lab", token: "t", owner: "a", ownerName: "A", ownerHost: "h", fetch: f as any, log: () => {} });
  r.push(ev({})); await r.flush();
  expect(f).toHaveBeenCalledTimes(2);
  expect(r.dropped).toBe(1);
});

test("a full buffer drops the oldest", async () => {
  const r = new Relay({ url: "http://lab", token: "t", owner: "a", ownerName: "A", ownerHost: "h", buffer: 3, fetch: (async () => new Response("{}", { status: 202 })) as any });
  for (let i = 0; i < 5; i++) r.push(ev({ session: `s${i}` }));
  expect(r.dropped).toBe(2);
});

test("close sends an end for every character still in the office", async () => {
  const calls: any[] = [];
  const f = vi.fn(async (_u: string, init: any) => { calls.push(JSON.parse(init.body)); return new Response("{}", { status: 202 }); });
  const r = new Relay({ url: "http://lab", token: "t", owner: "a", ownerName: "A", ownerHost: "h", fetch: f as any });
  let s = emptyState(); s = reduce(s, ev({ session: "p" })); s = reduce(s, ev({ session: "q" }));
  await r.close(s);
  expect(calls.flat().map((e) => [e.session, e.kind]).sort()).toEqual([["p", "end"], ["q", "end"]]);
});

test("close gives up after a second when the lab hangs", async () => {
  const f = vi.fn(() => new Promise<Response>(() => {}));
  const r = new Relay({ url: "http://lab", token: "t", owner: "a", ownerName: "A", ownerHost: "h", fetch: f as any, log: () => {} });
  let s = emptyState(); s = reduce(s, ev({ session: "p" }));
  const t0 = Date.now();
  await r.close(s);
  expect(Date.now() - t0).toBeLessThan(1500);
});

test("a flush while another is in flight waits for it, so nothing is sent twice", async () => {
  const calls: any[] = [];
  const f = vi.fn(async (_u: string, init: any) => { calls.push(JSON.parse(init.body)); await new Promise((ok) => setTimeout(ok, 20)); return new Response("{}", { status: 202 }); });
  const r = new Relay({ url: "http://lab", token: "t", owner: "a", ownerName: "A", ownerHost: "h", fetch: f as any });
  r.push(ev({ session: "a" }));
  const one = r.flush();
  r.push(ev({ session: "b" }));
  await Promise.all([one, r.flush()]);
  expect(calls.flat().map((e) => e.session)).toEqual(["a", "b"]);
});

test("flushes during a hang join the drain in flight instead of piling up", async () => {
  const f = vi.fn(() => new Promise<Response>(() => {}));
  const r = new Relay({ url: "http://lab", token: "t", owner: "a", ownerName: "A", ownerHost: "h", fetch: f as any, log: () => {} });
  r.push(ev({}));
  const first = r.flush();
  const later = Array.from({ length: 50 }, () => { r.push(ev({})); return r.flush(); });
  expect(later.every((p) => p === first)).toBe(true);
  expect(f).toHaveBeenCalledTimes(1);
});

test("a 4xx is not retried and the log names the status", async () => {
  const lines: string[] = [];
  const f = vi.fn(async () => new Response("{}", { status: 401 }));
  const r = new Relay({ url: "http://lab", token: "t", owner: "a", ownerName: "A", ownerHost: "h", fetch: f as any, log: (l) => lines.push(l) });
  r.push(ev({})); await r.flush();
  expect(f).toHaveBeenCalledTimes(1);
  expect(r.dropped).toBe(1);
  expect(lines).toEqual(["relay: http://lab answered 401 (1 events dropped so far)"]);
});

test("the failure line comes back after a minute", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    const lines: string[] = [];
    const r = new Relay({ url: "http://lab", token: "t", owner: "a", ownerName: "A", ownerHost: "h", fetch: (async () => { throw new Error("x"); }) as any, log: (l) => lines.push(l) });
    r.push(ev({})); await r.flush();
    vi.advanceTimersByTime(59_000);
    r.push(ev({})); await r.flush();
    expect(lines).toHaveLength(1);
    vi.advanceTimersByTime(1_000);
    r.push(ev({})); await r.flush();
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/3 events dropped/);
  } finally { vi.useRealTimers(); }
});

test("long fields are cut to what the lab accepts", async () => {
  const calls: any[] = [];
  const f = vi.fn(async (_u: string, init: any) => { calls.push(JSON.parse(init.body)); return new Response("{}", { status: 202 }); });
  const r = new Relay({ url: "http://lab", token: "t", owner: "a", ownerName: "A", ownerHost: "h", fetch: f as any });
  r.push(ev({ cwd: "/x".repeat(500), detail: "d".repeat(300), name: "n".repeat(80) }));
  await r.flush();
  expect(calls[0][0].cwd).toHaveLength(400);
  expect(calls[0][0].detail).toHaveLength(120);
  expect(calls[0][0].name).toHaveLength(40);
});

test("fat events are split so every request stays under 64 KB", async () => {
  const sizes: number[] = [];
  const f = vi.fn(async (_u: string, init: any) => { sizes.push(Buffer.byteLength(init.body)); return new Response("{}", { status: 202 }); });
  const r = new Relay({ url: "http://lab", token: "t", owner: "a", ownerName: "A", ownerHost: "h", fetch: f as any });
  for (let i = 0; i < 100; i++) r.push(ev({ session: `s${i}`.padEnd(200, "s"), cwd: "c".repeat(400), detail: "d".repeat(120), profile: "p".repeat(80), parent: "q".repeat(200), model: "m".repeat(80), tool: "t".repeat(80), agent: "a".repeat(80), name: "n".repeat(40) }));
  await r.flush();
  expect(sizes.length).toBeGreaterThan(1);
  expect(sizes.every((s) => s < 64 * 1024)).toBe(true);
});

test("on close the ends go ahead of a backlog", async () => {
  const calls: any[] = [];
  const f = vi.fn(async (_u: string, init: any) => { calls.push(JSON.parse(init.body)); return new Response("{}", { status: 202 }); });
  const r = new Relay({ url: "http://lab", token: "t", owner: "a", ownerName: "A", ownerHost: "h", fetch: f as any });
  for (let i = 0; i < 150; i++) r.push(ev({ session: `b${i}`, kind: "tool" }));
  let s = emptyState(); s = reduce(s, ev({ session: "p" }));
  await r.close(s);
  expect(calls[0][0]).toMatchObject({ session: "p", kind: "end", owner: "a" });
});

test("an event the shared office would refuse is dropped alone and logged, the next one is sent", async () => {
  const calls: any[] = [];
  const lines: string[] = [];
  const f = vi.fn(async (_u: string, init: any) => { calls.push(JSON.parse(init.body)); return new Response("{}", { status: 202 }); });
  const r = new Relay({ url: "http://lab", token: "t", owner: "a", ownerName: "A", ownerHost: "h", fetch: f as any, log: (l) => lines.push(l) });
  r.push(ev({ session: "" }));
  r.push(ev({ session: "" }));
  r.push(ev({ session: "ok" }));
  await r.flush();
  expect(calls).toHaveLength(1);
  expect(calls[0].map((e: any) => e.session)).toEqual(["ok"]);
  expect(r.dropped).toBe(2);
  expect(lines).toEqual(["relay: dropped an event the shared office would refuse: events[0].session must be a string of 1-200 chars"]);
});

test("a 429 puts the batch back and pauses the relay for a minute, then sends it once", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    const calls: any[] = [];
    let status = 429;
    const f = vi.fn(async (_u: string, init: any) => { calls.push(JSON.parse(init.body)); return new Response("{}", { status }); });
    const r = new Relay({ url: "http://lab", token: "t", owner: "a", ownerName: "A", ownerHost: "h", fetch: f as any, log: () => {} });
    r.push(ev({ session: "x" }));
    await r.flush();
    expect(f).toHaveBeenCalledTimes(1);
    expect(r.dropped).toBe(0);
    status = 202;
    r.push(ev({ session: "y" }));
    vi.advanceTimersByTime(30_000); await r.flush();
    vi.advanceTimersByTime(29_999); await r.flush();
    expect(f).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1); await r.flush();
    expect(f).toHaveBeenCalledTimes(2);
    expect(calls[1].map((e: any) => e.session)).toEqual(["x", "y"]);
    await r.flush();
    expect(f).toHaveBeenCalledTimes(2);
    expect(r.dropped).toBe(0);
  } finally { vi.useRealTimers(); }
});
