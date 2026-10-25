/**
 * Real end to end: a real Claude Code session, hooks wired through a temporary --settings file
 * (the profile's own settings.json is never touched), shows up in the live page and leaves.
 * Costs a few tokens, so it only runs with DESKMATES_E2E_CLAUDE=1.
 */
import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { PORT } from "../../playwright.config.ts";

test.skip(!process.env.DESKMATES_E2E_CLAUDE, "set DESKMATES_E2E_CLAUDE=1 to run against a real Claude Code session");
test.setTimeout(180_000);

test("a real Claude session arrives, works, idles and leaves", async ({ page }) => {
  const hook = new URL("../../bin/deskmates-hook.sh", import.meta.url).pathname;
  const dir = mkdtempSync(join(tmpdir(), "dm-e2e-"));
  const events = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PermissionRequest", "Notification", "Stop", "StopFailure", "SessionEnd", "SubagentStart", "SubagentStop"];
  const settings = join(dir, "settings.json");
  writeFileSync(settings, JSON.stringify({ hooks: Object.fromEntries(events.map((e) => [e, [{ matcher: ".*", hooks: [{ type: "command", command: `'${hook}'` }] }]])) }));

  await page.goto("/");
  await expect(page.locator("#conn")).toHaveText("live");
  await expect(page.locator("#count")).toHaveText("0 agents");

  const profile = process.env.DESKMATES_E2E_PROFILE ?? join(homedir(), ".claude-work");
  // the prompt goes through stdin: --allowedTools is variadic and would swallow a trailing argument
  const child = spawn("claude", ["-p", "--settings", settings, "--allowedTools=Read"],
    { cwd: dir, env: { ...process.env, CLAUDE_CONFIG_DIR: profile, DESKMATES_PORT: String(PORT) }, stdio: ["pipe", "pipe", "pipe"] });
  child.stdin.end("Read /etc/hostname with the Read tool and reply with only its content.");
  const done = new Promise<number>((ok) => child.on("exit", (c) => ok(c ?? -1)));

  await expect(page.locator("#count")).toHaveText("1 agent", { timeout: 30_000 });
  const health = await (await page.request.get("/healthz")).json();
  expect(health.lastEvent).toMatchObject({ source: "claude", decoded: true });

  expect(await done).toBe(0);
  await expect(page.locator("#count")).toHaveText("0 agents", { timeout: 15_000 });
});
