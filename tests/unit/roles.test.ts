import { test, expect } from "vitest";
import { parseRoles, roleFor, loadRoles } from "../../src/core/roles.ts";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const roles = parseRoles(`
[roles.designer]
match = ["designer"]
color = "#7A4FD6"
accessory = "beret"
[roles.explore]
match = ["Explore"]
accessory = "magnifier"
`);

test("matches with or without plugin prefix", () => {
  expect(roleFor(roles, "id3a:designer")).toEqual({ role: "designer", color: "#7A4FD6", accessory: "beret" });
  expect(roleFor(roles, "designer")?.role).toBe("designer");
  expect(roleFor(roles, "Explore")?.accessory).toBe("magnifier");
});

test("unknown or missing agent has no role", () => {
  expect(roleFor(roles, "general-purpose")).toBeUndefined();
  expect(roleFor(roles, undefined)).toBeUndefined();
});

test("rejects bad colours and unknown accessories instead of rendering garbage", () => {
  expect(() => parseRoles(`[roles.x]\nmatch=["x"]\ncolor="red"`)).toThrow(/color/);
  expect(() => parseRoles(`[roles.x]\nmatch=["x"]\naccessory="cape"`)).toThrow(/accessory/);
  expect(() => parseRoles(`[roles.x]\ncolor="#000000"`)).toThrow(/match/);
});

test("the bundled roles.toml loads, and a user file overrides and extends it", () => {
  const dir = mkdtempSync(join(tmpdir(), "dm-roles-"));
  const user = join(dir, "roles.toml");
  writeFileSync(user, `[roles.designer]\nmatch=["designer"]\ncolor="#000000"\naccessory="beret"\n[roles.qa]\nmatch=["qa"]\naccessory="magnifier"\n`);
  const r = loadRoles(user);
  expect(roleFor(r, "id3a:designer")?.color).toBe("#000000");
  expect(roleFor(r, "qa")?.accessory).toBe("magnifier");
  expect(roleFor(r, "community-manager")?.accessory).toBe("headset");
  expect(roleFor(loadRoles(join(dir, "missing.toml")), "content-creator")?.accessory).toBe("notebook");
});

test("computer per role: designers on a Mac, creators on a laptop; bad values rejected", () => {
  const r = loadRoles(undefined);
  expect(roleFor(r, "id3a:designer")?.computer).toBe("mac");
  expect(roleFor(r, "content-creator")?.computer).toBe("laptop");
  expect(roleFor(r, "community-manager")?.computer).toBeUndefined();
  expect(() => parseRoles(`[roles.x]\nmatch=["x"]\ncomputer="amiga"`)).toThrow(/computer/);
});

test("a role can wear a character of your own, named like a file without .png", () => {
  const r = parseRoles(`[roles.designer]\nmatch = ["designer"]\ncharacter = "my-designer"\n`);
  expect(roleFor(r, "id3a:designer")).toEqual({ role: "designer", character: "my-designer" });
  for (const bad of ["../x", "My Designer", "x.png", "-x", ""]) expect(() => parseRoles(`[roles.d]\nmatch = ["d"]\ncharacter = "${bad}"\n`), bad).toThrow(/character/);
});

test("the bundled roles dress the common subagent types", () => {
  const r = loadRoles(join(tmpdir(), "no-such-roles.toml"));
  expect(roleFor(r, "general-purpose")?.accessory).toBe("toolbox");
  expect(roleFor(r, "cavecrew:cavecrew-builder")?.accessory).toBe("toolbox");
  expect(roleFor(r, "code-reviewer")?.accessory).toBe("pen");
  expect(roleFor(r, "superpowers:code-reviewer")?.accessory).toBe("pen");
  expect(roleFor(r, "claude-code-guide")?.accessory).toBe("book");
  expect(roleFor(r, "researcher")?.accessory).toBe("globe");
  expect(roleFor(r, "cavecrew-investigator")?.accessory).toBe("magnifier");
});

test("every accessory a role may name has a sprite and an anchor", async () => {
  const { ACCESSORIES } = await import("../../src/core/roles.ts");
  const { existsSync, readFileSync } = await import("node:fs");
  const dir = new URL("../../assets/accessories/", import.meta.url);
  const anchors = JSON.parse(readFileSync(new URL("accessories.json", dir), "utf8")).anchors;
  for (const a of ACCESSORIES) {
    expect(existsSync(new URL(`${a}.png`, dir)), `${a}.png`).toBe(true);
    expect(anchors[a], `anchor for ${a}`).toBeDefined();
  }
});

test("a broken user roles.toml is reported and left out; the office still starts with the bundled roles", () => {
  const dir = mkdtempSync(join(tmpdir(), "dm-roles-"));
  const user = join(dir, "roles.toml");
  writeFileSync(user, '[roles.designer]\nmatch = ["designer"\n');
  const warnings: string[] = [];
  const r = loadRoles(user, (m) => warnings.push(m));
  expect(roleFor(r, "designer")?.accessory).toBe("beret");
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toContain(user);
});

test("a user role wins over a bundled one that matches the same name, and an exact plugin:agent match wins over a bare one", () => {
  const dir = mkdtempSync(join(tmpdir(), "dm-roles-"));
  const user = join(dir, "roles.toml");
  writeFileSync(user, '[roles.scout]\nmatch = ["Explore"]\naccessory = "globe"\n[roles.id3a-designer]\nmatch = ["id3a:designer"]\naccessory = "book"\n');
  const r = loadRoles(user);
  expect(roleFor(r, "Explore")?.role).toBe("scout");
  expect(roleFor(r, "id3a:designer")?.role).toBe("id3a-designer");
  expect(roleFor(r, "other:designer")?.role).toBe("designer");
});
