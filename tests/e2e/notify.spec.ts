import { test, expect } from "@playwright/test";
import { office, shared } from "./states.ts";

test("a hidden tab gets a system notification when an agent starts waiting", async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__notes = [];
    class FakeNotification { static permission = "granted"; static requestPermission = async () => "granted";
      constructor(title: string, opts: any) { (window as any).__notes.push({ title, body: opts?.body }); } }
    (window as any).Notification = FakeNotification;
    Object.defineProperty(document, "hidden", { get: () => true });
  });
  await page.goto("/?demo&alerts&t=1000");
  await page.waitForSelector("body[data-ready='1']");
  const designer = office.state.characters[0];
  const msg = (status: string) => ({ ...office, state: { rooms: 1, characters: [{ ...designer, status }] } });
  await page.evaluate((m) => (window as any).__deskmates.setState(m), msg("working"));
  await page.evaluate((m) => (window as any).__deskmates.setState(m), msg("waiting"));
  expect(await page.evaluate(() => (window as any).__notes)).toEqual([{ title: "id3a:designer needs you", body: "Edit gen.py" }]);
});

test("muting stops notifications and survives a reload", async ({ page }) => {
  await page.goto("/?demo&t=1000");
  await page.click("#mute");
  await expect(page.locator("#mute")).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.locator("#mute")).toHaveAttribute("aria-pressed", "true");
});

test("the pet picker turns pets off and is remembered", async ({ page }) => {
  await page.goto("/?demo&t=1000");
  await page.waitForSelector("body[data-ready='1']");
  await page.selectOption("#pets", "off");
  await page.reload();
  await page.waitForSelector("body[data-ready='1']");
  await expect(page.locator("#pets")).toHaveValue("off");
});

test("the character picker starts on our own set, switches the drawing and is remembered", async ({ page }) => {
  await page.goto("/?demo&t=1000");
  await page.waitForSelector("body[data-ready='1']");
  await expect(page.locator("#chars")).toHaveValue("deskmates");
  await page.evaluate(() => (window as any).__deskmates.setState({ type: "state", now: 0, state: { rooms: 1, characters: [
    { key: "k", source: "claude", session: "s", label: "l", status: "working", activity: "typing", startedAt: "2026-10-14T12:00:00Z", lastEventAt: 0, desk: 0 },
  ] } }));
  const before = await page.locator("#office").screenshot();
  await page.selectOption("#chars", "pixel-agents");
  expect((await page.locator("#office").screenshot()).equals(before)).toBe(false);
  await page.reload();
  await page.waitForSelector("body[data-ready='1']");
  await expect(page.locator("#chars")).toHaveValue("pixel-agents");
});

test("quiet mode shows no bell and no waiting count", async ({ page }) => {
  await page.goto("/?demo&t=1000&quiet");
  await page.waitForSelector("body[data-ready='1']");
  await page.evaluate((m) => (window as any).__deskmates.setState(m), shared);
  await expect(page.locator("#mute")).toBeHidden();
  await expect(page.locator("#count")).not.toContainText("waiting");
  await expect(page.locator("#roster li")).toHaveCount(10);
});
