import { test, expect } from "vitest";
import { qrText } from "../../src/cli/qr-text.ts";

test("two module rows per line, dark modules as blocks, light as space", () => {
  const m = [[true, false], [false, true]];
  expect(qrText(m, 0)).toBe("▀▄");
});

test("an odd number of rows pads the last line with a light row", () => {
  expect(qrText([[true]], 0)).toBe("▀");
  expect(qrText([[true], [true], [true]], 0).split("\n")).toEqual(["█", "▀"]);
});

test("the quiet zone surrounds the code", () => {
  const lines = qrText([[true]], 2).split("\n");
  expect(lines.length).toBe(3);                          // 2 + 1 + 2 rows = 5 → 3 lines
  expect(lines.every((l) => [...l].length === 5)).toBe(true);
  expect(lines[1]).toBe("  ▀  ");
});
