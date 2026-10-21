import { test, expect } from "vitest";
import { teamColor, TEAM } from "../../web/render.ts";
import { Scene } from "../../web/scene.ts";
import type { ViewCharacter } from "../../src/server/server.ts";

const ch = (p: Partial<ViewCharacter>): ViewCharacter => ({
  key: "k", source: "claude", session: "s", label: "l", status: "working", activity: "typing",
  startedAt: "2026-10-14T12:00:00Z", lastEventAt: 0, desk: 0, ...p,
});

test("an agent and its subagents share a team colour; an agent alone has none", () => {
  const s = new Scene();
  s.update([ch({ key: "a", desk: 0 }), ch({ key: "b", desk: 1 }), ch({ key: "c", desk: 2 }), ch({ key: "f", parent: "a", desk: 3 })]);
  const [a, b, f] = ["a", "b", "f"].map((k) => s.actors.get(k)!);
  expect(TEAM).toContain(teamColor(s, a));
  expect(teamColor(s, f)).toBe(teamColor(s, a));
  expect(teamColor(s, b)).toBeUndefined();
});

test("the team colour is the lead's role colour when it has one", () => {
  const s = new Scene();
  s.update([ch({ key: "a", outfit: { role: "designer", color: "#7A4FD6" } }), ch({ key: "f", parent: "a", desk: 1 })]);
  expect(teamColor(s, s.actors.get("f")!)).toBe("#7A4FD6");
});
