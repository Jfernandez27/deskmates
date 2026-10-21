import { test, expect, type Page } from "@playwright/test";
import type { ViewCharacter, StateMessage } from "../../src/server/server.ts";

const agent = (p: Partial<ViewCharacter>): ViewCharacter => ({
  key: "x", source: "claude", profile: "claude", session: "x", label: "claude · x",
  status: "idle", activity: "typing", startedAt: "2026-10-14T12:00:00Z", lastEventAt: 0, desk: 0, ...p,
});
const state = (characters: ViewCharacter[]): StateMessage => ({ type: "state", now: 0, state: { rooms: 1, characters } });

// `?demo&walk` lets agents walk; __deskmates.advance(ms) steps the scene clock, so the picture is the same on every run
async function open(page: Page) {
  await page.goto("/?demo&walk&t=1000");
  await page.waitForSelector("body[data-ready='1']");
}
const setState = (page: Page, msg: StateMessage) => page.evaluate((m) => (window as any).__deskmates.setState(m), msg);
const advance = (page: Page, ms: number) => page.evaluate((n) => (window as any).__deskmates.advance(n), ms);

test("agents meet, chat at the machines, and the pet keeps an idle agent company", async ({ page }) => {
  await open(page);
  const team = [
    agent({ key: "a", agent: "id3a:designer", label: "claude-work · id3a:designer", desk: 0, cwd: "/p/atlas",
      outfit: { role: "designer", color: "#7A4FD6", accessory: "beret", computer: "mac" } }),
    agent({ key: "b", agent: "id3a:community-manager", label: "claude-work · id3a:community-manager", desk: 1, cwd: "/p/atlas",
      outfit: { role: "community-manager", color: "#1F9E89", accessory: "headset" } }),
    agent({ key: "c", agent: "id3a:content-creator", label: "claude-work · id3a:content-creator", desk: 2, cwd: "/p/atlas",
      outfit: { role: "content-creator", color: "#E0832B", accessory: "notebook" } }),
    agent({ key: "d", label: "claude · harbor", desk: 4, cwd: "/p/harbor" }),
    agent({ key: "e", label: "claude · summit", desk: 6, cwd: "/p/summit" }),
    agent({ key: "g", label: "claude · deskmates", desk: 3, cwd: "/p/deskmates", status: "working", tool: "Edit" }),
  ];
  const f = agent({ key: "f", label: "claude · beacon", desk: 5, cwd: "/p/beacon", status: "working", tool: "Edit" });
  await setState(page, state([...team, f]));
  await advance(page, 40_000); // everyone sat down; the idle ones went to the table or the machines
  await setState(page, state([...team, { ...f, status: "idle" }]));
  await advance(page, 8_000); // the pet trots over to beacon, who has just finished
  await expect(page.locator("#office")).toHaveScreenshot("social.png");
});

test("a finished subagent hands its work over before walking out", async ({ page }) => {
  await open(page);
  const parent = agent({ key: "p", label: "claude · deskmates", desk: 0, status: "working" });
  const sub = agent({ key: "s", parent: "p", agent: "Explore", label: "claude · Explore", desk: 1, status: "working",
    outfit: { role: "explore", accessory: "magnifier" } });
  await setState(page, state([parent, sub]));
  await advance(page, 10_000);
  await setState(page, state([parent, { ...sub, desk: null, status: "leaving" }]));
  await advance(page, 1_600); // seven tiles: around the parent's chair, not across it
  await expect(page.locator("#office")).toHaveScreenshot("handover.png");
});
