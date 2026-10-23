import { test, expect } from "vitest";
import { mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadOrCreateToken, readRelayToken } from "../../src/cli/token.ts";

test("creates an owner-only token once and reuses it", () => {
  const f = join(mkdtempSync(join(tmpdir(), "dm-tok-")), "deskmates", "token");
  const t = loadOrCreateToken(f);
  expect(t.length).toBeGreaterThanOrEqual(32);
  expect(statSync(f).mode & 0o777).toBe(0o600);
  expect(loadOrCreateToken(f)).toBe(t);
});

test("replaces a token that is too short to be safe", () => {
  const f = join(mkdtempSync(join(tmpdir(), "dm-tok-")), "token");
  writeFileSync(f, "123\n");
  expect(loadOrCreateToken(f)).not.toBe("123");
});

test("relay token: flag, env, file, nothing", () => {
  const f = join(mkdtempSync(join(tmpdir(), "dm-relay-")), "relay-token");
  expect(readRelayToken("flag", { DESKMATES_RELAY_TOKEN: "env" }, f)).toBe("flag");
  expect(readRelayToken(undefined, { DESKMATES_RELAY_TOKEN: "env" }, f)).toBe("env");
  expect(readRelayToken(undefined, {}, f)).toBeUndefined();
  writeFileSync(f, "filetoken\n");
  expect(readRelayToken(undefined, {}, f)).toBe("filetoken");
});

test("configDir follows an absolute XDG_CONFIG_HOME, else ~/.config, for every file deskmates reads", async () => {
  const { configDir } = await import("../../src/root.ts");
  const { homedir } = await import("node:os");
  expect(configDir({ XDG_CONFIG_HOME: "/x/conf" })).toBe("/x/conf/deskmates");
  expect(configDir({ XDG_CONFIG_HOME: "relative" })).toBe(`${homedir()}/.config/deskmates`);
  expect(configDir({})).toBe(`${homedir()}/.config/deskmates`);
});
