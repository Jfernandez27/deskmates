import { test, expect } from "@playwright/test";

const empty = JSON.stringify({ type: "state", now: 0, state: { rooms: 1, characters: [] } });

test("a theme whose floor fails to load once keeps the choice and is tried again a minute later", async ({ page }) => {
  await page.clock.install();
  await page.routeWebSocket("**/ws", (ws) => ws.send(empty));
  let failing = true;
  await page.route("**/assets/pixel-agents/floors/floor_3.png", (r) => (failing ? r.fulfill({ status: 404 }) : r.continue()));
  await page.goto("/?theme=night");
  await expect(page.locator("#conn")).toHaveText("live");
  await expect(page.locator("#theme")).toHaveValue("night");
  const dayBg = await page.locator("body").evaluate((b) => getComputedStyle(b).backgroundColor);
  failing = false;
  await page.clock.fastForward(61_000);
  await expect.poll(() => page.locator("body").evaluate((b) => getComputedStyle(b).backgroundColor)).not.toBe(dayBg);
  await expect(page.locator("#theme")).toHaveValue("night");
});

test("after a reconnect the page reads /v1/config again: a service restarted as a shared office goes quiet", async ({ page }) => {
  await page.clock.install();
  let shared = false;
  await page.route("**/v1/config", (r) => r.fulfill({ json: { shared } }));
  const sockets: { close(): Promise<void> }[] = [];
  await page.routeWebSocket("**/ws", (ws) => { sockets.push(ws); ws.send(empty); });
  await page.goto("/");
  await expect(page.locator("#conn")).toHaveText("live");
  await expect(page.locator("#mute")).toBeVisible();
  shared = true;
  await sockets[0].close();
  await expect(page.locator("#conn")).toHaveText("offline");
  await page.clock.fastForward(1_000);
  await expect(page.locator("#conn")).toHaveText("live");
  await expect(page.locator("#mute")).toBeHidden();
});
