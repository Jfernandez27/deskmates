import { test, expect } from "vitest";
import { checkFloorSpec } from "../../src/core/floor-spec.ts";

test("a valid spec passes and the bad ones name their field", () => {
  const ok = { cols: 48, rows: 28, seats: [{ c: 3, r: 5 }, { c: 7, r: 5 }], door: { c: 23, r: 27 }, doorGap: [23, 24], meeting: [] };
  expect(checkFloorSpec({ ...ok, seats: [1, 2, 3, 4, 5].map((i) => ({ c: 4 * i, r: 5 })) }).islandSize).toBe(4);   // the default
  expect(() => checkFloorSpec({ ...ok, seats: [{ c: 3, r: 5 }, { c: 4, r: 5 }] })).toThrow(/floor\.seats\[1\]/);   // desks overlap
  expect(() => checkFloorSpec({ ...ok, seats: [{ c: 0, r: 5 }] })).toThrow(/floor\.seats\[0\]/);                   // in the wall
  expect(() => checkFloorSpec({ ...ok, door: { c: 23, r: 20 } })).toThrow(/floor\.door/);
  expect(() => checkFloorSpec({ ...ok, doorGap: [1, 2] })).toThrow(/floor\.doorGap/);
  expect(() => checkFloorSpec({ ...ok, cols: 8 })).toThrow(/floor\.cols/);
});

test("the rest of the block is checked too", () => {
  const ok = { cols: 48, rows: 28, seats: [{ c: 3, r: 5 }], door: { c: 23, r: 27 }, doorGap: [23, 24], meeting: [{ c: 40, r: 12, face: "up" }] };
  expect(checkFloorSpec({ ...ok, islandSize: 2 }).islandSize).toBe(1);   // one seat, an island of one
  expect(() => checkFloorSpec(null)).toThrow(/floor/);
  expect(() => checkFloorSpec({ ...ok, rows: 70 })).toThrow(/floor\.rows/);
  expect(() => checkFloorSpec({ ...ok, seats: [] })).toThrow(/floor\.seats/);
  expect(() => checkFloorSpec({ ...ok, seats: [{ c: 3, r: 24 }] })).toThrow(/floor\.seats\[0\]/);              // desk in the bottom wall
  expect(() => checkFloorSpec({ ...ok, seats: [{ c: 3, r: 5 }, { c: 3, r: 7 }] })).toThrow(/floor\.seats\[1\]/);  // seat on the desk above
  expect(() => checkFloorSpec({ ...ok, seats: [{ c: 3, r: 7 }, { c: 3, r: 5 }] })).toThrow(/floor\.seats\[1\]/);  // desk under a seat
  expect(checkFloorSpec({ ...ok, seats: [{ c: 3, r: 5 }, { c: 3, r: 8 }] }).seats).toHaveLength(2);
  expect(() => checkFloorSpec({ ...ok, islandSize: 0 })).toThrow(/floor\.islandSize/);
  expect(() => checkFloorSpec({ ...ok, doorGap: [23, 25] })).toThrow(/floor\.doorGap/);
  expect(() => checkFloorSpec({ ...ok, meeting: [{ c: 48, r: 12, face: "up" }] })).toThrow(/floor\.meeting\[0\]/);
  expect(() => checkFloorSpec({ ...ok, meeting: [{ c: 40, r: 12, face: "down" }] })).toThrow(/floor\.meeting\[0\]/);
});

test("an island bigger than the floor is the whole floor", () => {
  const ok = { cols: 48, rows: 28, seats: [{ c: 3, r: 5 }, { c: 7, r: 5 }], door: { c: 23, r: 27 }, doorGap: [23, 24], meeting: [] };
  expect(checkFloorSpec({ ...ok, islandSize: 6 }).islandSize).toBe(2);
  expect(checkFloorSpec({ ...ok, islandSize: 2 }).islandSize).toBe(2);
});
