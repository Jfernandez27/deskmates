import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { layoutFor, deviceLayout, fitCss, labelUnit, roomOrigin, roomW, roomH } from "../../web/render.ts";
import { validateTheme, floorOf } from "../../web/theme.ts";
import { ROOM } from "../../web/layout.ts";

test("one room on a laptop keeps the scale it always had", () => {
  expect(layoutFor(1248, 723, 1, ROOM)).toEqual({ cols: 1, rows: 1, scale: 3 });
});

test("two rooms stay side by side when stacking would not make them bigger", () => {
  expect(layoutFor(1248, 723, 2, ROOM)).toEqual({ cols: 2, rows: 1, scale: 1 });
});

test("three rooms on a 1080p screen go two by two, twice as big as in a row", () => {
  expect(layoutFor(1888, 1003, 3, ROOM)).toEqual({ cols: 2, rows: 2, scale: 2 });
});

test("height counts: a wide, short window does not overflow downwards", () => {
  const l = layoutFor(2528, 500, 1, ROOM);
  expect(l.scale * roomH(ROOM)).toBeLessThanOrEqual(500);
});

test("no cap on big screens", () => {
  expect(layoutFor(3808, 2100, 1, ROOM).scale).toBe(9);
});

test("when not even 1× fits, the rooms stack in one column instead of running off the side", () => {
  expect(layoutFor(568, 368, 3, ROOM)).toEqual({ cols: 1, rows: 3, scale: 1 });
});

test("rooms fill the grid row by row", () => {
  expect(roomOrigin(0, 2, ROOM)).toEqual({ x: 0, y: 0 });
  expect(roomOrigin(1, 2, ROOM)).toEqual({ x: roomW(ROOM), y: 0 });
  expect(roomOrigin(2, 2, ROOM)).toEqual({ x: 0, y: roomH(ROOM) });
});

test("layoutFor scales to the floor's size", () => {
  expect(layoutFor(1920, 1080, 1, ROOM).scale).toBe(Math.floor(Math.min(1920 / (24 * 16), 1080 / (14 * 16))));
  const big = { ...ROOM, cols: 48, rows: 28 };
  expect(layoutFor(1920, 1080, 1, big).scale).toBe(2);
  expect(layoutFor(800, 1280, 1, big).scale).toBe(1);
});

const HQ = floorOf(validateTheme(JSON.parse(readFileSync(new URL("../../assets/themes/headquarters/theme.json", import.meta.url), "utf8"))));

test("the whole-number scale is picked in device pixels: a 1280x720 window at 1.5 dppx draws headquarters at 2x", () => {
  expect(roomW(HQ)).toBe(768);
  expect(layoutFor(1280, 720, 1, HQ).scale).toBe(1);
  const l = deviceLayout(1280, 720, 1.5, 1, HQ);
  expect(l.scale).toBe(2);
  // backing 1536 device pixels wide, shown 1024 CSS pixels wide
  expect(roomW(HQ) * l.scale / 1.5).toBe(1024);
});

test("at 1 dppx the device layout is the CSS layout", () => {
  expect(deviceLayout(1248, 723, 1, 1, ROOM)).toEqual(layoutFor(1248, 723, 1, ROOM));
  expect(deviceLayout(1888, 1003, 1, 3, ROOM)).toEqual(layoutFor(1888, 1003, 3, ROOM));
});

test("fitCss keeps the aspect ratio and fills one side of the area", () => {
  expect(fitCss(768, 448, 1280, 720)).toEqual({ w: 768 * 720 / 448, h: 720 });
  expect(fitCss(384, 224, 1000, 2000)).toEqual({ w: 1000, h: 224 * 1000 / 384 });
  expect(fitCss(800, 400, 800, 400)).toEqual({ w: 800, h: 400 });
});

test("labels never get smaller than one CSS pixel per font pixel on a dense screen", () => {
  expect(labelUnit(3)).toBe(1);             // dpr 1: as before
  expect(labelUnit(1, 1)).toBe(1);
  expect(labelUnit(2, 2)).toBe(2);
  expect(labelUnit(2, 1.5)).toBe(2);
  expect(labelUnit(6, 2)).toBe(3);
});
