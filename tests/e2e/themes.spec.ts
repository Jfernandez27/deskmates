import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { office } from "./states.ts";

const A = new URL("../../assets/themes/", import.meta.url);
const NEW_THEMES = ["cozy", "cafe", "servers", "library"];
const seasons: string[] = JSON.parse(readFileSync(new URL("seasons.json", A), "utf8")).seasons.map((s: { id: string }) => s.id);

async function show(page: Page, query: string) {
  await page.goto(`/?demo&t=1000&${query}`);
  await page.waitForSelector("body[data-ready='1']");
  await page.evaluate((m) => (window as any).__deskmates.setState(m), office);
}

for (const id of NEW_THEMES) {
  test(`theme ${id}`, async ({ page }) => {
    await show(page, `theme=${id}&season=off`);
    await expect(page.locator("#theme")).toHaveValue(id);
    await expect(page.locator("#office")).toHaveScreenshot(`theme-${id}.png`);
  });
}

for (const id of seasons) {
  test(`season ${id} on the day theme`, async ({ page }) => {
    await show(page, `theme=day&season=${id}`);
    await expect(page.locator("#office")).toHaveScreenshot(`season-${id}.png`);
  });
}

test("seasons are off until you pick them, and the choice is remembered", async ({ page }) => {
  const pixels = () => page.locator("#office").evaluate((c: HTMLCanvasElement) => c.toDataURL());
  // a normal page, not ?demo: demo pages keep seasons off whatever this browser chose
  await page.goto("/?t=1000&theme=day");
  await expect(page.locator("#conn")).toHaveText("live");
  await expect(page.locator("#season")).toHaveValue("off");
  const plain = await pixels();
  await page.locator("#season").selectOption("auto");
  await expect.poll(pixels, { message: "the date's season is drawn" }).not.toBe(plain);
  await page.reload();
  await expect(page.locator("#conn")).toHaveText("live");
  await expect(page.locator("#season")).toHaveValue("auto");
});

test("a theme of your own is listed under Yours and applies; one that walls off the desks is left out", async ({ page }) => {
  const warnings: string[] = [];
  page.on("console", (m) => { if (m.type() === "warning") warnings.push(m.text()); });
  const parasol = page.waitForResponse((r) => r.url().endsWith("/assets/themes/beach/PARASOL.png"));
  await show(page, "theme=beach&season=off");
  await expect(page.locator("#theme")).toHaveValue("beach");
  await expect(page.locator('#theme optgroup[label="Yours"] option')).toHaveText(["Beach"]);
  expect((await parasol).status()).toBe(200);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg").trim())).toBe("#10202a");
  await expect(page.locator('#theme option[value="walled"]')).toHaveCount(0);
  expect(warnings.some((w) => w.includes("theme walled") && w.includes("cannot be reached from the door"))).toBe(true);
});
