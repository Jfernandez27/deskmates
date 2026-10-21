import { test, expect } from "vitest";
import { Alerts, RATE_LIMIT_MS } from "../../web/notify.ts";
import type { ViewCharacter } from "../../src/server/server.ts";

const c = (p: Partial<ViewCharacter>): ViewCharacter => ({
  key: "k", source: "claude", session: "s", label: "claude-work · id3a:designer", agent: "id3a:designer",
  status: "working", activity: "typing", startedAt: "", lastEventAt: 0, desk: 0, ...p,
});

test("nothing on the first snapshot, so opening the page is silent", () => {
  expect(new Alerts(() => 0).next([c({ status: "waiting" })])).toEqual([]);
});

test("entering waiting alerts once, with the tool in the body", () => {
  const a = new Alerts(() => 0);
  a.next([c({})]);
  expect(a.next([c({ status: "waiting", tool: "Bash", detail: "npm test" })])).toEqual([
    { key: "k", kind: "waiting", title: "id3a:designer needs you", body: "Bash npm test" },
  ]);
  expect(a.next([c({ status: "waiting" })])).toEqual([]);
});

test("at most one alert per session every 30 s", () => {
  let now = 0;
  const a = new Alerts(() => now);
  a.next([c({})]);
  expect(a.next([c({ status: "waiting" })])).toHaveLength(1);
  a.next([c({})]);
  now = RATE_LIMIT_MS - 1;
  expect(a.next([c({ status: "waiting" })])).toHaveLength(0);
  a.next([c({})]);
  now = RATE_LIMIT_MS + 1;
  expect(a.next([c({ status: "waiting" })])).toHaveLength(1);
});

test("finished only after more than two minutes of work", () => {
  const a = new Alerts(() => 0);
  a.next([c({ key: "x" }), c({ key: "y" })]);
  const out = a.next([c({ key: "x", status: "idle", workedMs: 150_000 }), c({ key: "y", status: "idle", workedMs: 60_000 })]);
  expect(out).toEqual([{ key: "x", kind: "finished", title: "id3a:designer finished", body: "claude-work · id3a:designer" }]);
});

test("new characters do not alert until seen once", () => {
  const a = new Alerts(() => 0);
  a.next([]);
  expect(a.next([c({ status: "waiting" })])).toEqual([]);
});
