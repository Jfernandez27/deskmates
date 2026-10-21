import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { encode, MAX_BYTES, TooLongError } from "../../src/core/qr.ts";

const LINK = "http://192.168.1.99:47821/?token=AbCdEfGhIjKlMnOpQrStUvWxYz012345";
const fixture = () => readFileSync(new URL("../fixtures/qr/link-v5m.txt", import.meta.url), "utf8")
  .split("\n").filter((l) => l && !l.startsWith("# ")).map((l) => [...l].map((c) => c === "#"));

test("the LAN link encodes to the reference matrix (version 5, level M)", () => {
  expect(encode(LINK)).toEqual(fixture());
});

test("version grows with the text: 1 for a word, 10 for the longest allowed", () => {
  expect(encode("deskmates").length).toBe(21);
  expect(encode("x".repeat(MAX_BYTES)).length).toBe(57);
});

test("the three finder patterns are where the standard puts them", () => {
  const m = encode("deskmates"), n = m.length;
  const finder = (r: number, c: number) => [0, 6].every((d) => m[r + d]![c] && m[r][c + d] && m[r + 6]![c + d] && m[r + d]![c + 6]) && m[r + 3]![c + 3];
  expect(finder(0, 0) && finder(0, n - 7) && finder(n - 7, 0)).toBe(true);
});

test("the timing pattern alternates along row and column 6", () => {
  const m = encode("deskmates");
  for (let i = 8; i < m.length - 8; i++) { expect(m[6]![i]).toBe(i % 2 === 0); expect(m[i]![6]).toBe(i % 2 === 0); }
});

test("one byte over the limit is refused with a clear error", () => {
  expect(() => encode("x".repeat(MAX_BYTES + 1))).toThrow(TooLongError);
});

test("UTF-8 is counted in bytes, not characters", () => {
  expect(() => encode("ñ".repeat(107))).toThrow(TooLongError);     // 214 bytes
  expect(encode("ñ".repeat(106)).length).toBe(57);                  // 212 bytes fits version 10 (version 9 holds 180)
});
