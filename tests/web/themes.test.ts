import { test, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { validateTheme, layoutProblems, floorOf, type Theme, type Season } from "../../web/theme.ts";
import { ROOM, BASE_DECOR, deskAt, breakSpots, type Decor, type Tile } from "../../web/layout.ts";

const A = new URL("../../assets/", import.meta.url);
const json = (p: string) => JSON.parse(readFileSync(new URL(p, A), "utf8"));
const index = json("themes/index.json") as { default: string; themes: string[] };
const themes: Theme[] = index.themes.map((id) => validateTheme(json(`themes/${id}/theme.json`)));
const seasons: Season[] = json("themes/seasons.json").seasons;

const bundled = (id: string) => themes.find((t) => t.id === id)!;

/** A season is checked with the theme rules: its decor and glows on top of a valid theme. */
const asTheme = (s: Season) => validateTheme({ ...themes[0], id: s.id, label: s.label, decor: s.decor, glows: s.glows, removeDecor: undefined, rugs: undefined });
const assetsOf = (t: { floor?: string; desk?: string; chair?: string; decor?: Decor[] }) =>
  [t.floor, t.desk, t.chair, ...(t.decor ?? []).flatMap((d) => [d.src, ...(d.frames ?? [])])].filter((x): x is string => !!x);

test("the bundled themes include the new ones", () => {
  for (const id of ["day", "night", "cozy", "cafe", "servers", "library", "headquarters"]) expect(index.themes).toContain(id);
  expect(seasons.map((s) => s.id)).toEqual(expect.arrayContaining(["halloween", "fiestas-patrias", "christmas"]));
});

for (const t of themes) {
  test(`theme ${t.id}: valid and every asset exists`, () => {
    expect(t.id).toBe(index.themes[themes.indexOf(t)]);
    for (const src of [...assetsOf(t), ...(t.removeDecor ?? [])]) expect(existsSync(new URL(src, A)), src).toBe(true);
    for (const src of t.removeDecor ?? []) expect(BASE_DECOR.some((d) => d.src === src), src).toBe(true);
  });
}

for (const s of seasons) {
  test(`season ${s.id}: valid dates, decor and glows, every asset exists`, () => {
    expect(s.from).toMatch(/^\d\d-\d\d$/);
    expect(s.to).toMatch(/^\d\d-\d\d$/);
    expect(typeof s.label).toBe("string");
    expect(() => asTheme(s)).not.toThrow();
    for (const src of assetsOf({ decor: s.decor })) expect(existsSync(new URL(src, A)), src).toBe(true);
  });
}

/** Seats, break spots and meeting spots must stay reachable from the door whatever theme and season are on. */
for (const t of themes) {
  for (const s of [undefined, ...seasons]) {
    test(`theme ${t.id} with season ${s?.id ?? "none"}: every seat and spot is reachable from the door`, () => {
      // a theme with a layout of its own gets no seasons
      expect(layoutProblems(floorOf(t), t.layout ? undefined : s)).toEqual([]);
    });
  }
}

test("headquarters: six islands, a café chat group of eight, every seat reachable", () => {
  const t = bundled("headquarters");
  const f = floorOf(t);
  expect(f.desksPerRoom).toBe(24);
  expect(layoutProblems(f)).toEqual([]);
  const drinks = breakSpots(f.decor).filter((s) => s.act === "drink" || s.act === "coffee");
  expect(drinks).toHaveLength(8);
  const within2 = (a: Tile, b: Tile) => Math.abs(a.c - b.c) <= 2 && Math.abs(a.r - b.r) <= 2;
  expect(drinks.every((s) => drinks.some((o) => o !== s && within2(s, o)))).toBe(true);
  expect(t.rugs).toHaveLength(7);
});

test("a room that walls off a seat, or has nowhere to drink, is reported", () => {
  const day = themes.find((t) => t.id === "day")!;
  const seat = deskAt(ROOM, 0).seat;
  const wall = [-1, 0, 1].flatMap((dc) => [-1, 0, 1].map((dr) => ({ c: seat.c + dc, r: seat.r + dr })))
    .filter((p) => p.c !== seat.c || p.r !== seat.r)
    .map((p) => ({ src: "x.png", c: p.c, r: p.r, blocks: true }));
  const walled = { ...day, decor: wall };
  expect(layoutProblems(floorOf(walled))).toContain(`tile ${seat.c},${seat.r} cannot be reached from the door`);
  const drinks = BASE_DECOR.filter((d) => d.spots?.some((s) => s.act === "drink")).map((d) => d.src);
  const dry = { ...day, removeDecor: drinks };
  expect(layoutProblems(floorOf(dry))).toContain("no drink spot");
});

test("the seasons of the year follow the hemisphere, and a festivity beats them", async () => {
  const { seasonFor } = await import("../../web/theme.ts");
  const on = (md: string, south: boolean) => seasonFor(seasons, new Date(`2026-${md}T12:00:00`), south)?.id;
  expect(on("10-14", true)).toBe("spring");
  expect(on("10-14", false)).toBe("autumn");
  expect(on("04-10", true)).toBe("autumn");
  expect(on("07-15", true)).toBe("winter");
  expect(on("07-15", false)).toBe("summer");
  expect(on("01-20", true)).toBe("summer");
  expect(on("01-20", false)).toBe("winter");
  expect(on("10-25", true)).toBe("halloween");
  expect(on("09-18", true)).toBe("fiestas-patrias");
  expect(on("12-24", false)).toBe("christmas");
  // every day of the year has a season
  for (let d = new Date("2026-01-01T12:00:00"); d.getFullYear() === 2026; d.setDate(d.getDate() + 1))
    for (const south of [true, false]) expect(seasonFor(seasons, d, south), `${d.toDateString()} ${south}`).toBeDefined();
});

test("the hemisphere comes from the time zone", async () => {
  const { isSouthern } = await import("../../web/theme.ts");
  for (const tz of ["America/Santiago", "America/Argentina/Buenos_Aires", "America/Sao_Paulo", "Australia/Sydney", "Pacific/Auckland", "Africa/Johannesburg"]) expect(isSouthern(tz), tz).toBe(true);
  for (const tz of ["Europe/Madrid", "America/New_York", "America/Mexico_City", "Asia/Tokyo", "UTC", undefined]) expect(isSouthern(tz), String(tz)).toBe(false);
});
