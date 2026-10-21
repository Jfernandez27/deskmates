import { test, expect } from "@playwright/test";

test("the Share button opens a dialog; under ?demo it explains how to turn LAN on", async ({ page }) => {
  await page.goto("/?demo&t=1000");
  await page.waitForSelector("body[data-ready='1']");
  const dialog = page.locator("#share");
  await expect(dialog).toBeHidden();
  await page.locator("#share-btn").click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("deskmates serve --lan");
  await expect(dialog.locator("canvas")).toHaveCount(0);
  await expect(dialog).toHaveScreenshot("share-off.png");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.locator("#share-btn")).toBeFocused();
});

test("nothing in the dialog on load, whatever the URL says", async ({ page }) => {
  await page.goto("/?demo&t=1000&share");
  await page.waitForSelector("body[data-ready='1']");
  await expect(page.locator("#share")).toBeHidden();
});

async function withLan(page: import("@playwright/test").Page, token: string) {
  await page.route("**/v1/lan", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ lan: true, port: 47999, primary: "192.168.1.9", alternatives: ["10.0.0.5"], token }),
  }));
  await page.goto("/");
  await expect(page.locator("#share-btn")).toBeVisible();
}

test("with LAN on (stubbed service) the dialog shows the link, a QR and the alternatives, and leaves nothing behind", async ({ page }) => {
  await withLan(page, "T".repeat(32));
  const dialog = page.locator("#share");
  await expect(dialog).toBeHidden();
  await expect(dialog.locator("canvas")).toHaveCount(0);
  expect(await page.content()).not.toContain("?token=");
  await page.locator("#share-btn").click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('canvas[role="img"]')).toHaveCount(1);
  await expect(dialog).toContainText("http://192.168.1.9:47999/?token=TTTT");
  await expect(dialog).toContainText("10.0.0.5");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(dialog.locator(".share-body")).toBeEmpty();
  expect(await page.content()).not.toContain("?token=");
});

test("with LAN on and a link too long for a QR, the dialog says so and draws no code", async ({ page }) => {
  await withLan(page, "T".repeat(300));
  await page.locator("#share-btn").click();
  await expect(page.locator("#share")).toContainText("too long");
  await expect(page.locator("#share canvas")).toHaveCount(0);
});
