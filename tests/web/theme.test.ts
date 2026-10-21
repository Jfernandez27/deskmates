import { test, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { validateTheme, floorOf } from "../../web/theme.ts";

const A = new URL("../../assets/", import.meta.url);
const index = JSON.parse(readFileSync(new URL("themes/index.json", A), "utf8"));

test("every bundled theme is valid and its floor exists", () => {
  expect(index.themes).toContain(index.default);
  for (const id of index.themes) {
    const t = validateTheme(JSON.parse(readFileSync(new URL(`themes/${id}/theme.json`, A), "utf8")));
    expect(t.id).toBe(id);
    expect(existsSync(new URL(t.floor, A))).toBe(true);
  }
});

test("a broken theme names the field", () => {
  const ok = JSON.parse(readFileSync(new URL("themes/night/theme.json", A), "utf8"));
  expect(() => validateTheme({ ...ok, floorTint: "blue" })).toThrow(/floorTint/);
  expect(() => validateTheme({ ...ok, floor: "../../etc/passwd.png" })).toThrow(/floor/);
  expect(() => validateTheme({ ...ok, night: { ...ok.night, darkness: 2 } })).toThrow(/darkness/);
  expect(() => validateTheme({ ...ok, page: { ...ok.page, bg: "#000" } })).toThrow(/page.bg/);
});

test("a theme with a layout block brings its own floor and furniture; without one it gets the room", () => {
  const minimalTheme = JSON.parse(readFileSync(new URL("themes/night/theme.json", A), "utf8"));
  const layout = { cols: 48, rows: 28, seats: [{ c: 3, r: 5 }], door: { c: 23, r: 27 }, doorGap: [23, 24], meeting: [] };
  const t = validateTheme({ ...minimalTheme, layout, decor: [] });
  expect(floorOf(t)).toMatchObject({ cols: 48, desksPerRoom: 1, decor: [] });
  expect(floorOf(validateTheme(minimalTheme))).toMatchObject({ cols: 24, desksPerRoom: 8 });
  expect(() => validateTheme({ ...minimalTheme, layout, removeDecor: ["x.png"] })).toThrow(/removeDecor/);
  expect(() => validateTheme({ ...minimalTheme, layout: { ...layout, cols: 8 } })).toThrow(/floor\.cols/);
  // beyond 23/13 is fine on a big floor, beyond its own size is not
  expect(() => validateTheme({ ...minimalTheme, layout, rugs: [{ c: 40, r: 20, w: 2, h: 2, color: "#000000", border: "#000000" }] })).not.toThrow();
  expect(() => validateTheme({ ...minimalTheme, layout, decor: [{ src: "x.png", c: 48, r: 5, blocks: false }] })).toThrow(/decor\[0\]/);
  expect(() => validateTheme({ ...minimalTheme, decor: [{ src: "x.png", c: 22, r: 5, w: 3, blocks: true }] })).toThrow(/decor\[0\]/);   // runs off the right edge
  expect(() => validateTheme({ ...minimalTheme, decor: [{ src: "x.png", c: 2, r: 1, h: 3, blocks: true }] })).toThrow(/decor\[0\]/);    // runs off the top
  expect(() => validateTheme({ ...minimalTheme, rugs: [{ c: 20, r: 10, w: 5, h: 2, color: "#000000", border: "#000000" }] })).toThrow(/rugs\[0\]/);
  expect(() => validateTheme({ ...minimalTheme, rugs: [{ c: 40, r: 20, w: 2, h: 2, color: "#000000", border: "#000000" }] })).toThrow(/rugs\[0\]/);
});
