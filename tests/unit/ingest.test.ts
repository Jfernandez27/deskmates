import { test, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer, type Running } from "../../src/server/server.ts";
import { parseBody, validate, RateLimit, RateLimits, RATE_PER_MINUTE } from "../../src/server/ingest.ts";
import type { TranscriptAdapter } from "../../src/adapters/transcript.ts";

let srv: Running | undefined;
afterEach(async () => { await srv?.close(); srv = undefined; });
const TOKEN = "t".repeat(32);
async function boot(extra: object = {}) {
  const web = mkdtempSync(join(tmpdir(), "dm-web-"));
  writeFileSync(join(web, "index.html"), "x");
  srv = await startServer({ port: 0, webDir: web, token: TOKEN, ...extra });
  return `http://127.0.0.1:${srv.port}/v1/events`;
}
const send = (url: string, body: unknown, token = TOKEN) =>
  fetch(url, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });

test("accepts a single event or a batch and puts the agent in the office", async () => {
  const url = await boot();
  const r = await send(url, { source: "my-bot", session: "42", kind: "start", agent: "reviewer", cwd: "/work/api" });
  expect(r.status).toBe(202);
  expect(await r.json()).toEqual({ accepted: 1 });
  expect((await send(url, [{ source: "my-bot", session: "42", kind: "tool", tool: "lint", detail: "src/" }, { source: "my-bot", session: "42", kind: "usage", tokens: { input: 10, output: 2 } }])).status).toBe(202);
  expect(Object.values(srv!.state().characters)[0]).toMatchObject({ label: "my-bot · reviewer", tool: "lint", tokens: { input: 10, output: 2 } });
});

test("rejects missing or wrong tokens", async () => {
  const url = await boot();
  expect((await send(url, { source: "a", session: "1", kind: "start" }, "nope")).status).toBe(401);
  expect((await fetch(url, { method: "POST", body: "{}" })).status).toBe(401);
});

test("the API is off when no token is configured", async () => {
  const web = mkdtempSync(join(tmpdir(), "dm-web-"));
  writeFileSync(join(web, "index.html"), "x");
  srv = await startServer({ port: 0, webDir: web });
  expect((await send(`http://127.0.0.1:${srv.port}/v1/events`, { source: "a", session: "1", kind: "start" })).status).toBe(404);
});

test("names the field that failed", async () => {
  const url = await boot();
  const bad = async (body: unknown) => { const r = await send(url, body); return [r.status, (await r.json()).error]; };
  expect(await bad({ source: "Bad Name", session: "1", kind: "start" })).toEqual([400, expect.stringContaining("events[0].source")]);
  expect(await bad({ source: "a", session: "1", kind: "dance" })).toEqual([400, expect.stringContaining("events[0].kind")]);
  expect(await bad([{ source: "a", session: "1", kind: "start" }, { source: "a", session: "1", kind: "usage", tokens: { input: -1, output: 0 } }])).toEqual([400, expect.stringContaining("events[1].tokens")]);
  expect(await bad({ source: "a", session: "1", kind: "start", detail: "x".repeat(121) })).toEqual([400, expect.stringContaining("events[0].detail")]);
  expect(await bad({ source: "a", session: "1", kind: "start", ts: "yesterday" })).toEqual([400, expect.stringContaining("events[0].ts")]);
  expect((await send(url, Array.from({ length: 101 }, () => ({ source: "a", session: "1", kind: "start" })))).status).toBe(413);
  expect(Object.keys(srv!.state().characters)).toHaveLength(0);
});

test("events are always marked as API events and future timestamps are clamped", () => {
  const now = new Date("2026-10-14T12:00:00Z");
  const [e] = parseBody({ source: "a", session: "1", kind: "start", transport: "hook", ts: "2030-01-01T00:00:00Z" }, now);
  expect(e).toMatchObject({ transport: "api", ts: now.toISOString() });
});

test("rate limit: 600 events per minute", () => {
  const r = new RateLimit();
  expect(r.take(RATE_PER_MINUTE, 0)).toBe(true);
  expect(r.take(1, 59_999)).toBe(false);
  expect(r.take(1, 60_000)).toBe(true);
});

test("the server follows transcript adapters", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dm-tr-"));
  mkdirSync(join(dir, "s"));
  const f = join(dir, "s", "one.jsonl");
  writeFileSync(f, JSON.stringify({ k: "start" }) + "\n");
  const fake: TranscriptAdapter = {
    source: "fake", patterns: () => [join(dir, "s", "*.jsonl")],
    decode: (l: any) => [{ source: "fake", session: "one", kind: l.k, ts: new Date().toISOString(), transport: "transcript" }],
  };
  await boot({ transcripts: [fake], transcriptIntervalMs: 20 });
  await new Promise((r) => setTimeout(r, 100));
  expect(Object.values(srv!.state().characters)[0]).toMatchObject({ source: "fake", status: "working" });
  appendFileSync(f, JSON.stringify({ k: "idle" }) + "\n");
  await new Promise((r) => setTimeout(r, 100));
  expect(Object.values(srv!.state().characters)[0].status).toBe("idle");
});

test("a name is accepted up to 40 characters", () => {
  const base = { source: "my-bot", session: "s", kind: "start" };
  expect(parseBody({ ...base, name: "Ada" })[0].name).toBe("Ada");
  expect(() => parseBody({ ...base, name: "x".repeat(41) })).toThrow(/name/);
});

test("owner fields are accepted and validated", () => {
  const ev = validate({ source: "claude", session: "s", kind: "tool", owner: "ab12cd34", ownerName: "Jesús", ownerHost: "id3a-linux" }, 0, new Date());
  expect([ev.owner, ev.ownerName, ev.ownerHost]).toEqual(["ab12cd34", "Jesús", "id3a-linux"]);
  expect(() => validate({ source: "claude", session: "s", kind: "tool", owner: "Has Space" }, 0, new Date())).toThrow(/events\[0\]\.owner/);
  expect(() => validate({ source: "claude", session: "s", kind: "tool", ownerHost: "a/b" }, 0, new Date())).toThrow(/events\[0\]\.ownerHost/);
  expect(() => validate({ source: "claude", session: "s", kind: "tool", ownerName: "x".repeat(41) }, 0, new Date())).toThrow(/events\[0\]\.ownerName/);
});

test("rate limits are per bucket", () => {
  const r = new RateLimits();
  expect(r.take("a", 600, 0)).toBe(true);
  expect(r.take("a", 1, 0)).toBe(false);
  expect(r.take("b", 600, 0)).toBe(true);
  expect(r.take("a", 1, 60_000)).toBe(true);
});
