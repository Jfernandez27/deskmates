import { test, expect } from "vitest";

test("you can always step off a blocked tile, but never walk onto one", async () => {
  const { findPath } = await import("../../web/path.ts");
  const g = [[false, true, true], [true, true, false]];
  expect(findPath(g, { c: 0, r: 0 }, { c: 2, r: 0 })).toEqual([{ c: 0, r: 0 }, { c: 1, r: 0 }, { c: 2, r: 0 }]);
  expect(findPath(g, { c: 1, r: 0 }, { c: 2, r: 1 })).toEqual([]);
});
