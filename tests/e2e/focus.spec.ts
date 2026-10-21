import { test, expect } from "@playwright/test";
import { office } from "./states.ts";
import { PORT } from "../../playwright.config.ts";

// the outer test page is served by a route (no real address): let Chromium frame the local service from it
test.use({ launchOptions: { args: ["--disable-features=LocalNetworkAccessChecks"] } });

test("inside an iframe, clicking a character posts deskmates.focus to the parent", async ({ page }) => {
  // an outer page on another origin (localhost vs 127.0.0.1), like the VS Code webview
  const outer = `http://localhost:${PORT}/__outer`;
  await page.route(outer, (r) => r.fulfill({ contentType: "text/html", body: `<!doctype html><iframe id="f" src="http://127.0.0.1:${PORT}/?demo&t=1000" style="width:1200px;height:760px;border:0"></iframe>
<script>window.__msgs = []; addEventListener("message", (e) => window.__msgs.push({ origin: e.origin, data: e.data }));</script>` }));
  await page.goto(outer);
  const frame = page.frameLocator("#f");
  await frame.locator("body[data-ready='1']").waitFor({ state: "attached" });
  const inner = page.frames().find((f) => f.url().includes("demo"))!;
  const designer = { ...office.state.characters[0], pids: [900, 800] };
  await inner.evaluate((m) => (window as any).__deskmates.setState(m), { ...office, state: { rooms: 1, characters: [designer] } });
  const [h] = await inner.evaluate(() => (window as any).__deskmates.hits());
  await frame.locator("#office").click({ position: { x: h.x + h.w / 2, y: h.y + h.h / 2 } });
  await expect.poll(() => page.evaluate(() => (window as any).__msgs)).toEqual([
    { origin: `http://127.0.0.1:${PORT}`, data: { type: "deskmates.focus", pids: [900, 800], label: designer.label } },
  ]);
});

test("as a top-level page, clicking does not post anything", async ({ page }) => {
  await page.goto("/?demo&t=1000");
  await page.waitForSelector("body[data-ready='1']");
  await page.evaluate(() => { (window as any).__posted = 0; const p = window.postMessage.bind(window); window.postMessage = ((...a: any[]) => { (window as any).__posted++; return (p as any)(...a); }) as any; });
  await page.evaluate((m) => (window as any).__deskmates.setState(m), office);
  const [h] = await page.evaluate(() => (window as any).__deskmates.hits());
  await page.locator("#office").click({ position: { x: h.x + h.w / 2, y: h.y + h.h / 2 } });
  await expect(page.locator("#card")).toBeVisible();
  expect(await page.evaluate(() => (window as any).__posted)).toBe(0);
});
