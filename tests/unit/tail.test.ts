import { test, expect } from "vitest";
import { mkdtempSync, writeFileSync, appendFileSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LineTail } from "../../src/adapters/tail.ts";

const file = () => join(mkdtempSync(join(tmpdir(), "dm-tail-")), "s.jsonl");

test("a character split across two writes is read whole, not as two broken halves", async () => {
  const f = file();
  const line = Buffer.from('{"detail":"diseño ñandú"}\n');
  const cut = line.indexOf(Buffer.from("ñ")) + 1; // inside the two bytes of ñ
  writeFileSync(f, line.subarray(0, cut));
  const t = new LineTail(f);
  expect((await t.read()).lines).toEqual([]);
  appendFileSync(f, line.subarray(cut));
  expect((await t.read()).lines).toEqual(['{"detail":"diseño ñandú"}']);
});

test("a file replaced by another of the same size or larger starts over", async () => {
  const f = file();
  writeFileSync(f, "a\nb\n");
  const t = new LineTail(f);
  expect((await t.read()).lines).toEqual(["a", "b"]);
  const other = `${f}.new`;
  writeFileSync(other, "c\nd\ne\n");
  renameSync(other, f);
  expect(await t.read()).toEqual({ lines: ["c", "d", "e"], reset: true });
});

test("growth and truncation as before", async () => {
  const f = file();
  writeFileSync(f, "a\npart");
  const t = new LineTail(f);
  expect((await t.read()).lines).toEqual(["a"]);
  appendFileSync(f, "ial\n");
  expect((await t.read()).lines).toEqual(["partial"]);
  writeFileSync(f, "x\n");
  expect(await t.read()).toEqual({ lines: ["x"], reset: true });
});
