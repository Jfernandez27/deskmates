import { test, expect, type Page } from "@playwright/test";
import { office, historyDay } from "./states.ts";

test.use({ timezoneId: "UTC" });

async function openHistory(page: Page) {
  await page.goto("/?demo&t=1000");
  await page.waitForSelector("body[data-ready='1']");
  await page.evaluate((m) => (window as any).__deskmates.setState(m), office);
  await page.evaluate((h) => (window as any).__deskmates.setHistory(h), historyDay);
  const btn = page.getByRole("button", { name: "History", exact: true });
  await expect(btn).toHaveAttribute("aria-expanded", "false");
  await btn.click();
  await expect(btn).toHaveAttribute("aria-expanded", "true");
  const panel = page.locator("#history");
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Today's history" })).toBeFocused();
  return panel;
}

test("the history panel lists today's sessions with totals", async ({ page }) => {
  const panel = await openHistory(page);
  await expect(panel.locator(".h-totals")).toContainText("5");
  await expect(panel.locator(".h-totals")).toContainText("6h 38m");
  await expect(panel.locator(".h-totals")).toContainText("210k");
  await expect(panel.locator(".h-hours .h-bar")).toHaveCount(24);
  const names = await panel.locator(".h-name").allTextContents();
  expect(names).toEqual(["designer", "↳ Explore", "deskmates", "codex: harbor", "gemini: summit-mo…"]);
  await expect(panel.locator(".h-row").first()).toContainText("2h 22m working");
  await expect(panel.locator(".h-row").first()).toContainText("08:40–12:15");
  await expect(page).toHaveScreenshot("history-desktop.png");
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(page.getByRole("button", { name: "History", exact: true })).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: "History", exact: true })).toBeFocused();
});

test("the history panel fits a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const panel = await openHistory(page);
  const box = (await panel.boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page).toHaveScreenshot("history-phone.png");
  await panel.getByRole("button", { name: "Close history" }).click();
  await expect(panel).toBeHidden();
});
