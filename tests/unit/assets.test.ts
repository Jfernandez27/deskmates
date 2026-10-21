import { test, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";

const A = new URL("../../assets/", import.meta.url);
/** PNG width/height from the IHDR chunk, no image library needed. */
function size(rel: string) {
  const b = readFileSync(new URL(rel, A));
  expect(b.subarray(1, 4).toString()).toBe("PNG");
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

test("character sheets are 7 frames x 3 rows of 16x32", () => {
  for (let i = 0; i < 6; i++) expect(size(`pixel-agents/characters/char_${i}.png`)).toEqual([112, 96]);
});

test("tiles and furniture have the sizes the renderer assumes", () => {
  expect(size("pixel-agents/walls/wall_0.png")).toEqual([64, 128]);
  for (const f of [0, 1, 3]) expect(size(`pixel-agents/floors/floor_${f}.png`)).toEqual([16, 16]);
  expect(size("pixel-agents/furniture/DESK/DESK_FRONT.png")).toEqual([48, 32]);
  for (const f of ["PC_BACK", "PC_FRONT_ON_1", "PC_FRONT_OFF"]) expect(size(`pixel-agents/furniture/PC/${f}.png`)).toEqual([16, 32]);
  expect(size("pixel-agents/furniture/WOODEN_CHAIR/WOODEN_CHAIR_FRONT.png")).toEqual([16, 32]);
  expect(size("pixel-agents/furniture/PLANT/PLANT.png")).toEqual([16, 32]);
  expect(size("pixel-agents/furniture/WHITEBOARD/WHITEBOARD.png")).toEqual([32, 32]);
});

test("Pixel Agents art ships with its MIT licence and pinned commit", () => {
  expect(readFileSync(new URL("pixel-agents/LICENSE", A), "utf8")).toMatch(/MIT License[\s\S]*Pablo De Lucca/);
  expect(readFileSync(new URL("pixel-agents/COMMIT", A), "utf8").trim()).toBe("d1e007a9fdf3003c252d2973abe1999ae59aec33");
});

test("every accessory a role can use has a sprite and an anchor", () => {
  const { anchors } = JSON.parse(readFileSync(new URL("accessories/accessories.json", A), "utf8"));
  for (const a of ["beret", "headset", "notebook", "magnifier", "folder"]) {
    expect(existsSync(new URL(`accessories/${a}.png`, A))).toBe(true);
    expect(anchors[a]).toMatchObject({ dx: expect.any(Number), dy: expect.any(Number) });
    const [w, h] = size(`accessories/${a}.png`);
    expect(w).toBeLessThanOrEqual(16); expect(h).toBeLessThanOrEqual(16);
  }
});

test("laptop and all-in-one computers have the PC's cell size", () => {
  for (const f of ["LAPTOP_BACK", "MAC_BACK"]) expect(size(`computers/${f}.png`)).toEqual([16, 32]);
  for (const f of ["SODA", "SNACKS"]) expect(size(`breakroom/${f}.png`)).toEqual([16, 32]);
});

test("tops.json names every bundled sheet", () => {
  const tops = JSON.parse(readFileSync(new URL("characters/tops.json", A), "utf8"));
  for (const id of [...Array.from({ length: 8 }, (_, i) => `dm${i}`), ...Array.from({ length: 6 }, (_, i) => `pa${i}`)]) expect(tops[id]?.length, id).toBeGreaterThan(0);
});
