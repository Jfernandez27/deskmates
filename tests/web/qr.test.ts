import { test, expect } from "vitest";
import { moduleSize } from "../../web/qr.ts";

test("module size fills the box but stays a whole number of at least 4", () => {
  expect(moduleSize(33, 360)).toBe(8);     // (33 + 8) * 8 = 328 ≤ 360; 9 would be 369
  expect(moduleSize(57, 200)).toBe(4);     // floor would be 3
});
