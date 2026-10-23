import { test, expect } from "@playwright/test";

test("a connection that dies without closing is noticed: offline after a minute of silence, then it reconnects", async ({ page }) => {
  await page.clock.install();
  let opened = 0;
  await page.routeWebSocket("**/ws", (ws) => {
    opened++;
    ws.send(JSON.stringify({ type: "state", now: 0, state: { rooms: 1, characters: [] } }));
    // then nothing, like a server whose machine lost power: no close frame ever comes
  });
  await page.goto("/?kiosk");
  await expect(page.locator("#conn")).toHaveText("live");
  await page.clock.fastForward(30_000);
  await expect(page.locator("#conn")).toHaveText("live");
  // past a minute of silence the watchdog gives up; it retries half a second later
  await page.clock.fastForward(35_000);
  await expect(page.locator("#conn")).toHaveText("offline");
  await expect(page.locator("body")).toHaveClass(/offline/);
  await page.clock.fastForward(1_000);
  await expect.poll(() => opened).toBe(2);
  await expect(page.locator("#conn")).toHaveText("live");
  await expect(page.locator("body")).not.toHaveClass(/offline/);
});

test("pings keep a quiet office live", async ({ page }) => {
  await page.clock.install();
  const sockets: { send(m: string): void }[] = [];
  await page.routeWebSocket("**/ws", (ws) => {
    sockets.push(ws);
    ws.send(JSON.stringify({ type: "state", now: 0, state: { rooms: 1, characters: [] } }));
  });
  await page.goto("/");
  await expect(page.locator("#conn")).toHaveText("live");
  for (let i = 0; i < 6; i++) { await page.clock.fastForward(20_000); sockets[0].send('{"type":"ping"}'); }
  await page.clock.fastForward(1_000);
  await expect(page.locator("#conn")).toHaveText("live");
  expect(sockets).toHaveLength(1);
});
