import { describe, test, expect } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyEvent, emptyDay, roll, viewOf, isValidDate, localDate, WORK_GAP_MS, type Day } from "../../src/core/history.ts";
import { saveDay, loadDay, dayFile, defaultHistoryDir, DebouncedSaver } from "../../src/server/history-store.ts";
import type { AgentEvent } from "../../src/types/events.ts";

// local times, so the tests hold in any time zone
const T = (h: number, m = 0, s = 0, d = 14) => new Date(2026, 9, d, h, m, s).getTime();
const MIN = 60_000;
const ev = (kind: AgentEvent["kind"], t: number, p: Partial<AgentEvent> = {}): AgentEvent =>
  ({ source: "claude", profile: "claude-work", session: "s1", kind, ts: new Date(t).toISOString(), transport: "hook", ...p });
const run = (events: AgentEvent[], day: Day = emptyDay("2026-10-14")) => events.reduce(applyEvent, day);
const one = (d: Day, session = "s1") => viewOf(d).sessions.find((s) => s.key.endsWith(`/${session}`))!;

describe("history aggregator", () => {
  test("working time runs from start/tool until waiting, idle or end; waiting is counted apart", () => {
    const d = run([
      ev("start", T(10), { agent: "id3a:designer", cwd: "/p/atlas" }),
      ev("tool", T(10, 2), { tool: "Edit", detail: "secret.ts" }),
      ev("waiting", T(10, 5)),
      ev("tool", T(10, 8), { tool: "Bash" }),
      ev("idle", T(10, 10)),
      ev("start", T(11)), // the user comes back an hour later
      ev("end", T(11, 3)),
    ]);
    const s = one(d);
    expect(s.workingMs).toBe((5 + 2 + 3) * MIN);
    expect(s.waitingMs).toBe(3 * MIN);
    expect(s).toMatchObject({ tools: 2, ended: true, agent: "id3a:designer", cwd: "atlas", source: "claude", profile: "claude-work" });
    expect(s.firstSeen).toBe(new Date(T(10)).toISOString());
    expect(s.lastSeen).toBe(new Date(T(11, 3)).toISOString());
    expect(JSON.stringify(d)).not.toContain("secret.ts");
    expect(JSON.stringify(d)).not.toContain("Edit");
  });

  test("a silence longer than ten minutes while working does not count", () => {
    const d = run([ev("start", T(9)), ev("tool", T(9, 9), { tool: "Read" }), ev("tool", T(9, 40), { tool: "Read" }), ev("idle", T(9, 41))]);
    expect(one(d).workingMs).toBe((9 + 1) * MIN);
    expect(WORK_GAP_MS).toBe(10 * MIN);
  });

  test("usage is cumulative: the last report wins", () => {
    const d = run([
      ev("start", T(9)),
      ev("usage", T(9, 1), { tokens: { input: 10, output: 100 } }),
      ev("usage", T(9, 2), { tokens: { input: 20, output: 300, cacheRead: 5 } }),
    ]);
    expect(one(d).tokens).toEqual({ input: 20, output: 300, cacheRead: 5 });
    expect(viewOf(d).totals.tokens).toBe(320);
  });

  test("usage or end alone never opens a session", () => {
    expect(viewOf(run([ev("usage", T(9), { tokens: { input: 1, output: 1 } }), ev("end", T(9))])).sessions).toEqual([]);
  });

  test("hourly buckets count distinct active agents, including hours a stretch runs through", () => {
    const d = run([
      ev("start", T(9, 55)), ev("tool", T(10, 4), { tool: "Edit" }), ev("idle", T(10, 5)),
      ev("start", T(10, 30), { session: "s2" }), ev("idle", T(10, 31), { session: "s2" }),
      ev("start", T(15), { session: "s3", source: "codex", profile: undefined }),
    ]);
    const v = viewOf(d);
    expect(v.hours).toHaveLength(24);
    expect(v.hours[9]).toBe(1);
    expect(v.hours[10]).toBe(2);
    expect(v.hours[15]).toBe(1);
    expect(v.hours.reduce((a, b) => a + b)).toBe(4);
    expect(v.totals).toMatchObject({ sessions: 3, workingMs: 10 * MIN + 1 * MIN });
  });

  test("view counts the stretch still in progress", () => {
    const d = run([ev("start", T(9))]);
    expect(viewOf(d, T(9, 4)).sessions[0].workingMs).toBe(4 * MIN);
    expect(viewOf(d).sessions[0].workingMs).toBe(0);
  });

  test("events from another day are ignored", () => {
    expect(run([ev("start", T(23, 0, 0, 13))]).sessions).toEqual({});
  });

  test("midnight closes the day and carries agents that are still working", () => {
    let d = run([ev("start", T(23, 55)), ev("tool", T(23, 58), { tool: "Bash" }), ev("start", T(22), { session: "old" }), ev("idle", T(22, 1), { session: "old" })]);
    expect(roll(d, T(23, 59)).closed).toBeUndefined();
    const r = roll(d, T(0, 3, 0, 15));
    expect(r.closed!.date).toBe("2026-10-14");
    expect(one(r.closed!).workingMs).toBe(5 * MIN - 1);
    expect(r.day.date).toBe("2026-10-15");
    expect(Object.keys(r.day.sessions)).toEqual(["claude/claude-work/s1"]);
    d = applyEvent(r.day, ev("tool", T(0, 3, 0, 15), { tool: "Edit" }));
    const s = one(d);
    expect(s.workingMs).toBe(3 * MIN);
    expect(s.firstSeen).toBe(new Date(T(0, 0, 0, 15)).toISOString());
    expect(viewOf(d).hours[0]).toBe(1);
  });

  test("dates are strict", () => {
    for (const ok of ["2026-10-14", "2024-02-29"]) expect(isValidDate(ok)).toBe(true);
    for (const bad of ["2026-02-30", "2026-13-01", "../../etc/passwd", "2026-10-14.json", "2026-1-4", "", "20261014", "2026-10-14/../x"])
      expect(isValidDate(bad)).toBe(false);
    expect(localDate(T(0, 0, 0, 15))).toBe("2026-10-15");
  });
});

describe("history persistence", () => {
  const dir = () => join(mkdtempSync(join(tmpdir(), "dm-hist-")), "history");

  test("round trip keeps counts and lets the count continue after a restart", () => {
    const where = dir();
    const d = run([ev("start", T(9), { agent: "Explore", parent: "p1" }), ev("usage", T(9, 1), { tokens: { input: 1, output: 2 } })]);
    saveDay(where, d);
    const back = loadDay(where, "2026-10-14")!;
    expect(viewOf(back)).toEqual(viewOf(d));
    expect(one(applyEvent(back, ev("idle", T(9, 6)))).workingMs).toBe(6 * MIN);
    expect(loadDay(where, "2026-10-13")).toBeUndefined();
  });

  test("writes are atomic: only the final file remains, never a temporary one", () => {
    const where = dir();
    saveDay(where, run([ev("start", T(9))]));
    saveDay(where, run([ev("start", T(9)), ev("idle", T(9, 1))]));
    expect(readdirSync(where)).toEqual(["2026-10-14.json"]);
    expect(JSON.parse(readFileSync(join(where, "2026-10-14.json"), "utf8")).date).toBe("2026-10-14");
  });

  test("corrupt files read as missing", () => {
    const where = dir();
    mkdirSync(where, { recursive: true });
    writeFileSync(join(where, "2026-10-14.json"), "{half");
    expect(loadDay(where, "2026-10-14")).toBeUndefined();
  });

  test("bad dates never become paths", () => {
    expect(() => dayFile("/x", "../../etc/passwd")).toThrow(/bad date/);
    expect(loadDay("/x", "../secret")).toBeUndefined();
    expect(() => saveDay(dir(), { ...emptyDay("2026-10-14"), date: "../evil" })).toThrow(/bad date/);
  });

  test("XDG_STATE_HOME is respected", () => {
    expect(defaultHistoryDir({ XDG_STATE_HOME: "/s" })).toBe("/s/deskmates/history");
    expect(defaultHistoryDir({})).toMatch(/\.local\/state\/deskmates\/history$/);
  });

  test("the debounced saver writes once after the delay and on flush", async () => {
    const where = dir();
    const s = new DebouncedSaver(where, 30);
    s.schedule(run([ev("start", T(9))]));
    s.schedule(run([ev("start", T(9)), ev("idle", T(9, 2))]));
    expect(() => readdirSync(where)).toThrow();
    await new Promise((r) => setTimeout(r, 80));
    expect(one(loadDay(where, "2026-10-14")!).workingMs).toBe(2 * MIN);
    s.schedule(run([ev("start", T(9)), ev("idle", T(9, 3))]));
    s.flush();
    expect(one(loadDay(where, "2026-10-14")!).workingMs).toBe(3 * MIN);
  });
});

test("events replayed after a restart (a transcript read again from the start) count nothing twice and leave the phase alone", () => {
  const events = [ev("start", T(10)), ev("tool", T(10, 1), { tool: "Read" }), ev("tool", T(10, 2), { tool: "Edit" }), ev("idle", T(10, 3))];
  const once = run(events);
  const twice = run(events, once);
  expect(twice).toEqual(once);
  expect(one(twice).tools).toBe(2);
});

test("history keeps the folder's name, not its full path", () => {
  const d = run([ev("start", T(10), { cwd: "/home/someone/clients/acme/api" })]);
  expect(one(d).cwd).toBe("api");
});
