import { test, expect } from "vitest";
import { NameBook, NAMES, BANK_OF } from "../../web/names.ts";

test("twenty names in each bank, none repeated, and every bundled character has a bank", () => {
  expect(NAMES.f).toHaveLength(20);
  expect(NAMES.m).toHaveLength(20);
  expect(new Set([...NAMES.f, ...NAMES.m]).size).toBe(40);
  expect(Object.keys(BANK_OF).sort()).toEqual([...Array.from({ length: 8 }, (_, i) => `dm${i}`), ...Array.from({ length: 6 }, (_, i) => `pa${i}`)].sort());
});

test("an agent keeps its name, and no two agents in the office share one", () => {
  const book = new NameBook();
  const given = Array.from({ length: 20 }, (_, i) => book.nameFor(`k${i}`, "same-session-seed", "f"));
  expect(new Set(given).size).toBe(20);
  expect(book.nameFor("k3", "same-session-seed", "f")).toBe(given[3]);
});

test("past the whole bank a number follows; leaving frees the name", () => {
  const book = new NameBook();
  for (let i = 0; i < 20; i++) book.nameFor(`k${i}`, `s${i}`, "m");
  expect(book.nameFor("k20", "s20", "m")).toMatch(/ 2$/);
  const freed = book.nameFor("k0", "s0", "m");
  book.keep(Array.from({ length: 20 }, (_, i) => `k${i + 1}`));
  expect(book.nameFor("new", "s0", "m")).toBe(freed);
});

test("a character from the other bank gets a name from that bank", () => {
  const book = new NameBook();
  expect(NAMES.m).toContain(book.nameFor("k", "s", "m"));
  expect(NAMES.f).toContain(book.nameFor("k", "s", "f"));
});
