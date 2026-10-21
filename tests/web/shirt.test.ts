import { test, expect } from "vitest";
import { shirtRamp } from "../../web/shirt.ts";

test("the ramp keeps order: the darkest top colour maps to the darkest shade", () => {
  const m = shirtRamp(["#1164a9", "#114978", "#0f406a"], "#d85a3b");
  const lum = (c: [number, number, number]) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  const by = (h: string) => m.get(parseInt(h.slice(1), 16))!;
  expect(lum(by("#1164a9"))).toBeGreaterThan(lum(by("#114978")));
  expect(lum(by("#114978"))).toBeGreaterThan(lum(by("#0f406a")));
  expect(m.size).toBe(3);
});

test("a single top colour lands mid-ramp", () => {
  const m = shirtRamp(["#bdbdbd"], "#3b78d8");
  expect(m.get(0xbdbdbd)).toBeDefined();
});
