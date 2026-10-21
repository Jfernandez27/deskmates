import { test, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer, isCharacterSheet, type Running } from "../../src/server/server.ts";

const SHEET = new URL("../../assets/characters/char_0.png", import.meta.url).pathname;
const PET = new URL("../../assets/pixel-agents/pets/gitcat/pet.png", import.meta.url).pathname;
let srv: Running | undefined;
afterEach(async () => { await srv?.close(); srv = undefined; });

test("only a 112x96 PNG is a character sheet", async () => {
  const { readFileSync } = await import("node:fs");
  expect(isCharacterSheet(readFileSync(SHEET))).toBe(true);
  expect(isCharacterSheet(readFileSync(PET))).toBe(false); // 96x96
  expect(isCharacterSheet(Buffer.from("not a png at all, just text"))).toBe(false);
});

test("serves your own sheets from the characters folder, and nothing else", async () => {
  const web = mkdtempSync(join(tmpdir(), "dm-w-"));
  writeFileSync(join(web, "index.html"), "x");
  const dir = mkdtempSync(join(tmpdir(), "dm-chars-"));
  copyFileSync(SHEET, join(dir, "mine.png"));
  copyFileSync(PET, join(dir, "wrong-size.png"));
  writeFileSync(join(tmpdir(), "secret.png"), "x");
  srv = await startServer({ port: 0, webDir: web, charactersDir: dir });
  const get = (p: string) => fetch(`http://127.0.0.1:${srv!.port}${p}`);
  const ok = await get("/v1/characters/mine.png");
  expect(ok.status).toBe(200);
  expect(ok.headers.get("content-type")).toBe("image/png");
  expect((await get("/v1/characters/wrong-size.png")).status).toBe(422);
  expect((await get("/v1/characters/missing.png")).status).toBe(404);
  for (const p of ["/v1/characters/..%2Fsecret.png", "/v1/characters/Mine.png", "/v1/characters/mine.jpg", "/v1/characters/a/b.png"]) expect((await get(p)).status, p).toBe(404);
  expect((await fetch(`http://127.0.0.1:${srv.port}/v1/characters/mine.png`, { method: "POST" })).status).toBe(405);
});
