import { test, expect } from "@playwright/test";
import type { StateMessage, ViewCharacter } from "../../src/server/server.ts";

const agent = (key: string, desk: number, status: ViewCharacter["status"] = "working"): ViewCharacter => ({
  key, source: "claude", session: key, label: key, status, activity: "typing", startedAt: "2026-10-14T12:00:00Z", lastEventAt: 0, desk,
});
const msg = (characters: ViewCharacter[]): StateMessage => ({ type: "state", now: 0, state: { rooms: 1, characters } });

test("a keyboard user on a count in the bar stays on it when the counts change", async ({ page }) => {
  await page.goto("/?demo&t=1000");
  await page.waitForSelector("body[data-ready='1']");
  await page.evaluate((m) => (window as any).__deskmates.setState(m), msg([agent("a", 0)]));
  await page.getByRole("button", { name: "1 working" }).focus();
  await page.evaluate((m) => (window as any).__deskmates.setState(m), msg([agent("a", 0), agent("b", 1), agent("c", 2, "waiting")]));
  await expect(page.getByRole("button", { name: "2 working" })).toBeFocused();
});

test("Escape closes the Share dialog first, then the History panel under it", async ({ page }) => {
  await page.goto("/?demo&t=1000");
  await page.waitForSelector("body[data-ready='1']");
  await page.locator("#history-btn").click();
  await expect(page.locator("#history")).toBeVisible();
  // the panel covers the button for the mouse; the keyboard still reaches it
  await page.locator("#share-btn").evaluate((b: HTMLButtonElement) => b.click());
  await expect(page.locator("#share")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#share")).toBeHidden();
  await expect(page.locator("#history")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#history")).toBeHidden();
});

test("a theme that no longer exists shows the theme drawn in the selector, not a blank one", async ({ page }) => {
  await page.goto("/?demo&t=1000&theme=deleted-theme");
  await page.waitForSelector("body[data-ready='1']");
  await expect(page.locator("#theme")).toHaveValue("day");
});

test("a tapped card follows its agent: new status shown, closed when it leaves", async ({ page }) => {
  await page.goto("/?demo&t=1000");
  await page.waitForSelector("body[data-ready='1']");
  await page.evaluate((m) => (window as any).__deskmates.setState(m), msg([agent("a", 0)]));
  await page.evaluate(() => (window as any).__deskmates.advance(10_000));
  const [box] = await page.evaluate(() => (window as any).__deskmates.hits());
  await page.locator("#office").click({ position: { x: box.x + box.w / 2, y: box.y + box.h / 2 } });
  await expect(page.locator("#card")).toContainText("working");
  await page.evaluate((m) => (window as any).__deskmates.setState(m), msg([agent("a", 0, "waiting")]));
  await expect(page.locator("#card")).toContainText("waiting");
  await page.evaluate((m) => (window as any).__deskmates.setState(m), msg([]));
  await expect(page.locator("#card")).toBeHidden();
});
