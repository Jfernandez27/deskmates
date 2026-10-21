import { test, expect, type Page } from "@playwright/test";
import { office } from "./states.ts";

async function live(page: Page) {
  // no ?t: the clock runs, so animations would show; no pets, who would walk between the two frames
  await page.goto("/?demo&pets=off");
  await page.waitForSelector("body[data-ready='1']");
  await page.evaluate((m) => (window as any).__deskmates.setState(m), office);
}
const frame = (page: Page) => page.locator("#office").evaluate((c: HTMLCanvasElement) => c.toDataURL());

test("with reduced motion the office holds still: no bouncing ?, flicker or blinking", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await live(page);
  await page.waitForTimeout(250);
  const a = await frame(page);
  await page.waitForTimeout(450);
  expect(await frame(page)).toBe(a);
});

test("without it the office moves", async ({ page }) => {
  await live(page);
  await page.waitForTimeout(250);
  const a = await frame(page);
  await page.waitForTimeout(450);
  expect(await frame(page)).not.toBe(a);
});

test("a screen reader gets the agents and their states as a list", async ({ page }) => {
  await live(page);
  const roster = page.locator("#roster");
  await expect(roster.getByText("community-manager: waiting for you")).toHaveCount(1);
  await expect(roster.getByText("designer: working, Edit gen.py")).toHaveCount(1);
  await expect(roster.getByText(/: done$/)).toHaveCount(1);
  // visually hidden, not display:none, so screen readers still read it
  expect(await roster.boundingBox()).toMatchObject({ width: 1, height: 1 });
});

test("the bar: one line at 1280 px, controls tall enough to hit, the bell named", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/?demo&t=1000");
  await page.waitForSelector("body[data-ready='1']");
  await page.evaluate((m) => (window as any).__deskmates.setState(m), office);
  await expect(page.locator("#count")).toContainText("asleep");
  for (const sel of ["#theme", "#chars", "#pets", "#season", "#history-btn", "#share-btn", "#mute", "#kiosk-btn"]) {
    const box = (await page.locator(sel).boundingBox())!;
    expect(box.height, sel).toBeGreaterThanOrEqual(32);
  }
  await expect(page.locator("#mute")).toHaveAttribute("aria-label", /sound/i);
  const tops = await page.locator("header > *").evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().top + e.getBoundingClientRect().height / 2)))]);
  expect(Math.max(...tops) - Math.min(...tops), "everything on one row").toBeLessThanOrEqual(2);
});
