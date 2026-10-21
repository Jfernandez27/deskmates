import { test, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadOwners, saveOwners } from "../../src/server/owners-store.ts";

test("round-trips owners and tolerates a missing or broken file", () => {
  const f = join(mkdtempSync(join(tmpdir(), "dm-owners-")), "deep", "shared.json");
  expect(loadOwners(f)).toEqual([]);
  saveOwners(f, ["aaaaaaaa", "bbbbbbbb"]);
  expect(loadOwners(f)).toEqual(["aaaaaaaa", "bbbbbbbb"]);
  writeFileSync(f, "{nope");
  expect(loadOwners(f)).toEqual([]);
});
