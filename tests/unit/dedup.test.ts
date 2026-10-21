import { test, expect } from "vitest";
import { Dedup } from "../../src/server/state.ts";
import type { AgentEvent } from "../../src/types/events.ts";

const e = (transport: AgentEvent["transport"], ms: number, kind: AgentEvent["kind"] = "idle"): AgentEvent =>
  ({ source: "claude", session: "s", kind, transport, ts: new Date(1_000_000 + ms).toISOString() });

test("a transcript echo of a hook fact within 2 s is dropped; same-transport repeats are kept", () => {
  const d = new Dedup();
  expect(d.keep(e("hook", 0))).toBe(true);
  expect(d.keep(e("transcript", 1500))).toBe(false);
  expect(d.keep(e("transcript", 2500))).toBe(true);
  expect(d.keep(e("hook", 2600))).toBe(true);
  expect(d.keep(e("hook", 2700))).toBe(true);
  expect(d.keep(e("transcript", 2800, "usage"))).toBe(true);
});

test("the same source/profile/session from two owners are not deduped against each other", () => {
  const d = new Dedup();
  expect(d.keep({ ...e("hook", 0), owner: "aaaaaaaa" })).toBe(true);
  expect(d.keep({ ...e("transcript", 500), owner: "bbbbbbbb" })).toBe(true);
  expect(d.keep({ ...e("transcript", 600), owner: "aaaaaaaa" })).toBe(false);
});
