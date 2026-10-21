import { test, expect, beforeEach } from "vitest";
import { mkdtempSync, copyFileSync, appendFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UsageTracker, transcriptPathFor } from "../../src/adapters/claude/usage.ts";

const FIXTURE = new URL("../fixtures/claude/transcript-usage.jsonl", import.meta.url);
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "dm-usage-")); });

const line = (requestId: string, usage: object) =>
  JSON.stringify({ type: "assistant", requestId, message: { role: "assistant", usage } }) + "\n";

test("sums usage once per request id", async () => {
  const f = join(dir, "t.jsonl");
  copyFileSync(FIXTURE, f);
  const t = new UsageTracker();
  expect(await t.update("k", f)).toEqual({ input: 6, output: 386, cacheRead: 234049, cacheWrite: 41717 });
  expect(await t.update("k", f)).toBeUndefined(); // unchanged
});

test("a partial last line is held until it completes, and growth is picked up", async () => {
  const f = join(dir, "t.jsonl");
  writeFileSync(f, line("r1", { input_tokens: 10, output_tokens: 5 }));
  const t = new UsageTracker();
  expect(await t.update("k", f)).toMatchObject({ input: 10, output: 5 });
  const next = line("r2", { input_tokens: 1, output_tokens: 2 });
  appendFileSync(f, next.slice(0, 20));
  expect(await t.update("k", f)).toBeUndefined();
  appendFileSync(f, next.slice(20));
  expect(await t.update("k", f)).toMatchObject({ input: 11, output: 7 });
});

test("a later line for the same request replaces, not adds", async () => {
  const f = join(dir, "t.jsonl");
  writeFileSync(f, line("r1", { input_tokens: 10, output_tokens: 5 }) + line("r1", { input_tokens: 10, output_tokens: 40 }));
  expect(await new UsageTracker().update("k", f)).toMatchObject({ input: 10, output: 40 });
});

test("missing files and junk lines do not throw", async () => {
  const t = new UsageTracker();
  expect(await t.update("k", join(dir, "nope.jsonl"))).toBeUndefined();
  const f = join(dir, "junk.jsonl");
  writeFileSync(f, "not json\n{}\n" + line("r1", { input_tokens: 1, output_tokens: 1 }));
  expect(await t.update("k2", f)).toMatchObject({ input: 1, output: 1 });
});

test("subagent transcripts live next to the parent's", () => {
  expect(transcriptPathFor({ transcript_path: "/h/.claude-work/projects/-tmp/S.jsonl", session_id: "S", agent_id: "A" }))
    .toBe("/h/.claude-work/projects/-tmp/S/subagents/agent-A.jsonl");
  expect(transcriptPathFor({ transcript_path: "/h/.claude/projects/p/S.jsonl", session_id: "S" })).toBe("/h/.claude/projects/p/S.jsonl");
  expect(transcriptPathFor({})).toBeUndefined();
});

test("the model of the latest reply is taken once per change; synthetic replies are not a model", async () => {
  const f = join(dir, "t.jsonl");
  const reply = (requestId: string, model: string) =>
    JSON.stringify({ type: "assistant", requestId, message: { role: "assistant", model, usage: { input_tokens: 1, output_tokens: 1 } } }) + "\n";
  writeFileSync(f, reply("r1", "claude-sonnet-5-5") + reply("r2", "claude-opus-5-5"));
  const t = new UsageTracker();
  await t.update("k", f);
  expect(t.takeModel("k")).toBe("claude-opus-5-5");
  expect(t.takeModel("k"), "unchanged: nothing to send").toBeUndefined();
  appendFileSync(f, reply("r3", "<synthetic>"));
  await t.update("k", f);
  expect(t.takeModel("k")).toBeUndefined();
});
