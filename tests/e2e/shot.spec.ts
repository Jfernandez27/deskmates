import { test, expect, type Page } from "@playwright/test";
import { office, shared, sharedHeadquarters } from "./states.ts";
import type { StateMessage } from "../../src/server/server.ts";

async function show(page: Page, msg: StateMessage, params = "") {
  await page.goto(`/?demo&t=1000${params}`);
  await page.waitForSelector("body[data-ready='1']");
  await page.evaluate((m) => (window as any).__deskmates.setState(m), msg);
}

test("office renders the six poses", async ({ page }) => {
  await show(page, office);
  await expect(page.locator("#office")).toHaveScreenshot("office.png");
});

test("a shared office: each PC's agents wear its colour and carry its name", async ({ page }) => {
  await show(page, shared, "&theme=day");
  await expect(page.locator("#office")).toHaveScreenshot("shared.png");
});

test("a shared office on the headquarters floor: one island per PC, tinted with its colour", async ({ page }) => {
  await show(page, sharedHeadquarters, "&theme=headquarters");
  await expect(page.locator("#office")).toHaveScreenshot("headquarters.png");
});

test("the headquarters floor fits a tablet in portrait without scrolling sideways", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 1280 });
  await page.goto("/?demo&t=1000&theme=headquarters");
  await page.waitForSelector("body[data-ready='1']");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // drawn at scale 1: the 48-column floor is 768 canvas pixels wide (the canvas is W × scale; 800 px fits no scale 2)
  await expect.poll(() => page.locator("#office").evaluate((c: HTMLCanvasElement) => c.width)).toBe(48 * 16);
});

test("an empty office", async ({ page }) => {
  await show(page, { type: "state", now: 0, state: { rooms: 1, characters: [] } });
  await expect(page.locator("#count")).toHaveText("0 agents");
  await expect(page.locator("#office")).toHaveScreenshot("empty.png");
});

test("a ninth agent opens a second room at the same integer scale", async ({ page }) => {
  const base = office.state.characters[4];
  const many = Array.from({ length: 9 }, (_, i) => ({ ...base, key: `k${i}`, label: `claude · p${i}`, desk: i, status: "working" as const }));
  await show(page, { type: "state", now: 0, state: { rooms: 2, characters: many } });
  const w = await page.locator("#office").evaluate((c: HTMLCanvasElement) => c.width);
  expect(w % (2 * 384)).toBe(0);
  await expect(page.locator("#office")).toHaveScreenshot("two-rooms.png");
});

test("hovering a character shows its card", async ({ page }) => {
  await show(page, office);
  const box = (await page.locator("#office").boundingBox())!;
  const scale = (await page.locator("#office").evaluate((c: HTMLCanvasElement) => c.width)) / 384;
  // designer sits at desk 0: seat tile (3,4), feet at the bottom of row 4
  await page.mouse.move(box.x + (3 * 16 + 8) * scale, box.y + (5 * 16 - 12) * scale);
  const card = page.locator("#card");
  await expect(card).toBeVisible();
  await expect(card.locator(".title")).toHaveText("designer");
  await expect(card).toContainText("claude-work · id3a:designer");
  await expect(card).toContainText("Edit · gen.py");
  await expect(card).toContainText("claude-opus-5-5");
  await expect(card).toContainText("tokens");
});

test("night shift theme: dark office, glowing screens and machines", async ({ page }) => {
  await page.goto("/?demo&t=1000&theme=night");
  await page.waitForSelector("body[data-ready='1']");
  await page.evaluate((m) => (window as any).__deskmates.setState(m), office);
  await expect(page.locator("#theme")).toHaveValue("night");
  await expect(page.locator("#office")).toHaveScreenshot("night.png");
});

test("the theme picker is remembered by the browser", async ({ page }) => {
  await page.goto("/?demo&t=1000");
  await page.waitForSelector("body[data-ready='1']");
  await page.selectOption("#theme", "night");
  await page.reload();
  await page.waitForSelector("body[data-ready='1']");
  await expect(page.locator("#theme")).toHaveValue("night");
});

test("below a small tablet the page says so instead of drawing a tiny office", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?demo&t=1000");
  await page.waitForSelector("body[data-ready='1']");
  await expect(page.locator("#too-small")).toBeVisible();
  await expect(page.locator("#office")).toBeHidden();
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(page.locator("#too-small")).toBeHidden();
  await expect(page.locator("#office")).toBeVisible();
});

test("the bar sums the office up, and a count shows the next agent in that state", async ({ page }) => {
  await show(page, office);
  const count = page.locator("#count");
  await expect(count).toHaveText("1 waiting · 3 working · 1 done · 1 asleep");
  await count.getByRole("button", { name: "1 waiting" }).click();
  await expect(page.locator("#card .title")).toHaveText("community-manager");
  const working = count.getByRole("button", { name: "3 working" });
  await working.click();
  const first = await page.locator("#card .title").textContent();
  await working.click();
  await expect(page.locator("#card .title"), "the next click moves on").not.toHaveText(first!);
});

test("kiosk mode drops the bar and gives the office the whole window", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 700 });
  const width = () => page.locator("#office").evaluate((c: HTMLCanvasElement) => c.width);
  await show(page, office);
  expect(await width()).toBe(2 * 384);
  await page.goto("/?demo&t=1000&kiosk");
  await page.waitForSelector("body[data-ready='1']");
  await page.evaluate((m) => (window as any).__deskmates.setState(m), office);
  await expect(page.locator("header")).toBeHidden();
  expect(await width()).toBe(3 * 384);
});

test("kiosk stretches the headquarters floor to fill a 1280x720 screen, keeping its aspect", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/?demo&t=1000&kiosk&theme=headquarters");
  await page.waitForSelector("body[data-ready='1']");
  await page.evaluate((m) => (window as any).__deskmates.setState(m), sharedHeadquarters);
  // no whole-number scale above 1 fits, so the canvas holds 768x448 pixels and CSS stretches them
  expect(await page.locator("#office").evaluate((c: HTMLCanvasElement) => [c.width, c.height])).toEqual([768, 448]);
  const box = (await page.locator("#office").boundingBox())!;
  expect(Math.abs(box.width - 1280) <= 1 || Math.abs(box.height - 720) <= 1).toBe(true);
  expect(box.width).toBeLessThanOrEqual(1281);
  expect(box.height).toBeLessThanOrEqual(721);
  expect(Math.abs(box.width / box.height - 768 / 448)).toBeLessThan(0.01);
  expect(await page.locator("#office").evaluate((c) => getComputedStyle(c).imageRendering)).toBe("pixelated");
});

test("the kiosk button turns kiosk on; a tap on the office peeks the bar; the button turns it off", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 700 });
  const width = () => page.locator("#office").evaluate((c: HTMLCanvasElement) => c.width);
  await show(page, office);
  await page.locator("#kiosk-btn").click();
  await expect(page.locator("body")).toHaveClass(/kiosk/);
  await expect(page.locator("#kiosk-btn")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("header")).toBeHidden();
  expect(await width()).toBe(3 * 384);
  await page.locator("#office").click({ position: { x: 10, y: 10 } });
  await expect(page.locator("header")).toBeVisible();
  expect(await width()).toBe(3 * 384);                              // the peek lays the bar over the office
  await page.locator("#kiosk-btn").click();
  await expect(page.locator("body")).not.toHaveClass(/kiosk/);
  expect(await width()).toBe(2 * 384);
  expect(await page.evaluate(() => localStorage.getItem("deskmates.kiosk"))).toBeNull();   // ?demo never writes
});

test.describe("on a 2 dppx screen", () => {
  test.use({ deviceScaleFactor: 2 });

  test("the canvas holds device pixels and a click on a character still opens its card", async ({ page }) => {
    await show(page, office);
    const c = page.locator("#office");
    const [w, cssW] = await c.evaluate((el: HTMLCanvasElement) => [el.width, el.getBoundingClientRect().width]);
    expect(w).toBe(2 * cssW);
    const box = (await c.boundingBox())!;
    const scale = box.width / 384;   // CSS pixels per source pixel
    // designer sits at desk 0: seat tile (3,4), feet at the bottom of row 4
    await page.mouse.click(box.x + (3 * 16 + 8) * scale, box.y + (5 * 16 - 12) * scale);
    const card = page.locator("#card");
    await expect(card.locator(".title")).toHaveText("designer");
    // the card lands next to the click, not off by the pixel ratio
    const cb = (await card.boundingBox())!;
    expect(cb.x).toBeLessThan(box.x + (3 * 16 + 8) * scale + 40);
    expect(cb.y).toBeLessThan(box.y + (5 * 16 - 12) * scale + 40);
  });

  test("labels keep at least one CSS pixel per font pixel", async ({ page }) => {
    await show(page, office);
    expect(await page.evaluate(() => (window as any).__deskmates.labelUnit())).toBeGreaterThanOrEqual(2);
  });

  test("a count in the bar puts the card next to its agent", async ({ page }) => {
    await show(page, office);
    await page.locator("#count").getByRole("button", { name: "1 waiting" }).click();
    await expect(page.locator("#card .title")).toHaveText("community-manager");
    const hits = (await page.evaluate(() => (window as any).__deskmates.hits())) as { x: number; y: number; w: number; h: number }[];
    const box = (await page.locator("#office").boundingBox())!;
    const cb = (await page.locator("#card").boundingBox())!;
    // showCard puts the card 14 px right of and below the agent's top-right corner; hits() reports CSS pixels
    expect(hits.some((h) => Math.abs(cb.x - (box.x + h.x + h.w + 14)) <= 1 && Math.abs(cb.y - (box.y + h.y + 14)) <= 1)).toBe(true);
  });
});

test("the page sets up its pixel-density watch once, not on every frame", async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__mm = 0;
    const mm = window.matchMedia.bind(window);
    window.matchMedia = ((q: string) => { if (q.includes("dppx")) (window as any).__mm++; return mm(q); }) as typeof window.matchMedia;
  });
  await page.goto("/?demo&walk");
  await page.waitForSelector("body[data-ready='1']");
  await page.evaluate(() => new Promise((ok) => { let n = 30; const f = () => (--n ? requestAnimationFrame(f) : ok(null)); requestAnimationFrame(f); }));
  expect(await page.evaluate(() => (window as any).__mm)).toBeLessThanOrEqual(2);
});
