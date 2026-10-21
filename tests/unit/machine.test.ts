import { test, expect } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadOrCreateMachineId, displayName, hostName } from "../../src/cli/machine.ts";

const dir = () => mkdtempSync(join(tmpdir(), "dm-machine-"));

test("creates an 8-char id once and keeps it", () => {
  const f = join(dir(), "machine-id");
  const a = loadOrCreateMachineId(f);
  expect(a).toMatch(/^[a-z0-9]{8}$/);
  expect(loadOrCreateMachineId(f)).toBe(a);
  expect(readFileSync(f, "utf8")).toBe(a + "\n");
  expect(statSync(f).mode & 0o777).toBe(0o600);
});

test("rewrites a corrupt id file", () => {
  const f = join(dir(), "machine-id");
  writeFileSync(f, "not an id\n");
  expect(loadOrCreateMachineId(f)).toMatch(/^[a-z0-9]{8}$/);
});

test("display name: flag, then env, then the OS user, cleaned", () => {
  expect(displayName("  Jesús\u0007 ", {})).toBe("Jesús");
  expect(displayName(undefined, { DESKMATES_NAME: "Ana" })).toBe("Ana");
  expect(displayName(undefined, {})).toBeTruthy();
  expect(displayName("x".repeat(60), {})).toHaveLength(40);
  expect(displayName("   ", {})).toBe("someone");
});

test("host name is safe for the ingest validator", () => {
  expect(hostName()).toMatch(/^[a-z0-9.-]{1,64}$/);
});
