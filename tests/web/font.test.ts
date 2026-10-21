import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { glyph, hasGlyph, GLYPH_W, ABOVE, BELOW } from "../../web/font.ts";
import { NAMES } from "../../web/names.ts";

test("every glyph is five wide and stays between the accent rows and the descenders", () => {
  for (let c = 32; c < 127; c++) {
    const ch = String.fromCharCode(c);
    expect(hasGlyph(ch), `ASCII ${JSON.stringify(ch)}`).toBe(true);
    for (const [x, y] of glyph(ch)) {
      expect(x, ch).toBeGreaterThanOrEqual(0); expect(x, ch).toBeLessThan(GLYPH_W);
      expect(y, ch).toBeGreaterThanOrEqual(-ABOVE); expect(y, ch).toBeLessThan(BELOW);
    }
  }
});

test("every name in the banks and every bundled role can be written", () => {
  const roles = readFileSync(new URL("../../roles.toml", import.meta.url), "utf8").match(/"[^"]+"/g)!.join("");
  for (const ch of [...NAMES.f.join(""), ...NAMES.m.join(""), ..."…·¿¡↳", ...roles]) expect(hasGlyph(ch), ch).toBe(true);
});

test("accents sit above lowercase within the line, and above capitals over the cap line", () => {
  const top = (ch: string) => Math.min(...glyph(ch).map(([, y]) => y));
  expect(top("a")).toBe(2);
  expect(top("á")).toBe(0);
  expect(top("í")).toBe(0);
  expect(glyph("í").filter(([, y]) => y === 2)).toEqual([[1, 2], [2, 2]]); // dotless: no dot under the accent
  expect(top("Á")).toBe(-ABOVE);
});

test("a character the font lacks is drawn as ?", () => {
  expect(hasGlyph("漢")).toBe(false);
  expect(glyph("漢")).toEqual(glyph("?"));
});
