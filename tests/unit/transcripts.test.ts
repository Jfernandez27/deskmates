import { test, expect } from "vitest";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, utimesSync, appendFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { codex } from "../../src/adapters/codex/transcript.ts";
import { copilot } from "../../src/adapters/copilot/transcript.ts";
import { cursor } from "../../src/adapters/cursor/transcript.ts";
import { gemini } from "../../src/adapters/gemini/transcript.ts";
import { TranscriptWatcher, type TranscriptAdapter, type FileCtx } from "../../src/adapters/transcript.ts";
import type { AgentEvent } from "../../src/types/events.ts";

const lines = (p: string) => readFileSync(new URL(`../fixtures/${p}`, import.meta.url), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const replay = (a: TranscriptAdapter, fixture: string, path: string) => {
  const ctx: FileCtx = { path, mtime: Date.parse("2026-10-14T12:00:00Z"), state: {} };
  return lines(fixture).flatMap((l) => a.decode(l, ctx));
};
const kinds = (evs: AgentEvent[]) => evs.map((e) => e.kind + (e.tool ? `:${e.tool}` : ""));

test("codex: start, work, tools, tokens, idle per task", () => {
  const evs = replay(codex, "codex/rollout.jsonl", "/h/.codex/sessions/2026/09/21/rollout-x.jsonl");
  expect(evs[0]).toMatchObject({ source: "codex", kind: "start", transport: "transcript" });
  expect(evs[0].cwd).toMatch(/^\/home\/user\//);
  expect(kinds(evs).slice(0, 4)).toEqual(["start", "tool", "tool:exec", "usage"]);
  expect(evs.filter((e) => e.kind === "idle")).toHaveLength(7);
  const lastUsage = evs.filter((e) => e.kind === "usage").at(-1)!;
  expect(lastUsage.tokens!.input).toBeGreaterThan(0);
  expect(lastUsage.tokens!.cacheRead).toBeGreaterThan(0);
  expect(new Set(evs.map((e) => e.session)).size).toBe(1);
});

test("codex: lines before session_meta are ignored", () => {
  const ctx: FileCtx = { path: "/x", mtime: 0, state: {} };
  expect(codex.decode({ type: "event_msg", payload: { type: "task_started" } }, ctx)).toEqual([]);
});

test("copilot: the model it reports rides on the events that follow", () => {
  const evs = replay(copilot, "copilot/events.jsonl", "/h/.copilot/session-state/91c5cfa9/events.jsonl");
  expect(evs[0].model).toBeUndefined();
  expect(evs.at(-1)!.model).toBe("claude-sonnet-5");
});

test("copilot: start, tool with detail, idle, tokens and end", () => {
  const evs = replay(copilot, "copilot/events.jsonl", "/h/.copilot/session-state/91c5cfa9/events.jsonl");
  expect(evs[0]).toMatchObject({ source: "copilot", session: "91c5cfa9", kind: "start" });
  expect(evs.find((e) => e.tool)).toMatchObject({ tool: "bash", detail: "cat note.txt" });
  expect(kinds(evs).slice(-3)).toEqual(["idle", "usage", "end"]);
  expect(evs.find((e) => e.kind === "usage")!.tokens).toEqual({ input: 4, output: 235, cacheRead: 25952, cacheWrite: 26207 });
});

test("cursor: tools from tool_use blocks, project as folder, file time as timestamp", () => {
  const evs = replay(cursor, "cursor/transcript.jsonl", "/h/.cursor/projects/home-user-project/agent-transcripts/bdbe/bdbe.jsonl");
  expect(kinds(evs)).toEqual(["start", "tool", "tool:GetDynamicTools", "tool:Glob", "tool:Shell"]);
  expect(evs[3]).toMatchObject({ detail: "**/*.ts", cwd: "home-user-project", session: "bdbe", ts: "2026-10-14T12:00:00.000Z" });
  expect(evs[4].detail).toBe("npm test");
});

test("gemini: header starts, tool calls, tokens per message id (last copy wins), final answer idles", () => {
  const evs = replay(gemini, "gemini/session.jsonl", "/h/.gemini/tmp/myproj/chats/session-2026-10-14T03-15-7f3c2a9e.jsonl");
  expect(kinds(evs)).toEqual(["start", "tool", "tool:read_file", "usage", "tool:run_shell_command", "usage", "usage", "idle"]);
  expect(evs[2].detail).toBe("app.ts");
  expect(evs[4].detail).toBe("npm test");
  expect(evs.filter((e) => e.kind === "usage").at(-1)!.tokens).toEqual({ input: 1300 + 300, output: 150, cacheRead: 1700 });
  expect(evs[0]).toMatchObject({ source: "gemini", cwd: "myproj", session: "7f3c2a9e-0000-4000-8000-000000000001" });
});

test("watcher: a session that was quiet at startup and resumes later shows up (its header line is still read)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dm-watch-"));
  const old = join(dir, "rollout.jsonl");
  writeFileSync(old, JSON.stringify({ k: "meta", id: "s-1" }) + "\n" + JSON.stringify({ k: "idle" }) + "\n");
  const hourAgo = (Date.now() - 3_600_000) / 1000;
  utimesSync(old, hourAgo, hourAgo);
  // like codex and gemini: the session id is only on the first line, and lines before it decode to nothing
  const fake: TranscriptAdapter = {
    source: "fake",
    patterns: () => [join(dir, "*.jsonl")],
    decode: (l: any, ctx) => {
      if (l.k === "meta") { ctx.state.session = l.id; return [{ source: "fake", session: l.id, kind: "start", ts: new Date().toISOString(), transport: "transcript" }]; }
      if (!ctx.state.session) return [];
      return [{ source: "fake", session: String(ctx.state.session), kind: l.k, ts: new Date().toISOString(), transport: "transcript" }];
    },
  };
  const got: AgentEvent[] = [];
  const w = new TranscriptWatcher([fake], (e) => got.push(...e));
  await w.scan();
  expect(got).toEqual([]);
  appendFileSync(old, JSON.stringify({ k: "tool" }) + "\n");
  await w.scan();
  expect(got.map((e) => `${e.session}:${e.kind}`)).toEqual(["s-1:tool"]);
});

test.skipIf(process.getuid?.() === 0)("watcher: a file it cannot open is skipped for now, not fatal, and read once it can", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dm-watch-"));
  const locked = join(dir, "locked.jsonl"), live = join(dir, "live.jsonl");
  writeFileSync(locked, JSON.stringify({ k: "start" }) + "\n");
  writeFileSync(live, JSON.stringify({ k: "start" }) + "\n");
  chmodSync(locked, 0o000);
  const fake: TranscriptAdapter = {
    source: "fake",
    patterns: () => [join(dir, "*.jsonl")],
    decode: (l: any, ctx) => [{ source: "fake", session: ctx.path, kind: l.k, ts: new Date().toISOString(), transport: "transcript" }],
  };
  const got: AgentEvent[] = [];
  const w = new TranscriptWatcher([fake], (e) => got.push(...e));
  await w.scan();
  expect(got.map((e) => e.session)).toEqual([live]);
  chmodSync(locked, 0o600);
  await w.scan();
  expect(got.map((e) => e.session)).toEqual([live, locked]);
});

test("watcher: replays active files, skips files that were quiet at startup, follows growth", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dm-watch-"));
  mkdirSync(join(dir, "s"));
  const old = join(dir, "s", "old.jsonl"), live = join(dir, "s", "live.jsonl");
  writeFileSync(old, JSON.stringify({ k: "start" }) + "\n");
  writeFileSync(live, JSON.stringify({ k: "start" }) + "\n");
  const hourAgo = (Date.now() - 3_600_000) / 1000;
  utimesSync(old, hourAgo, hourAgo);
  const fake: TranscriptAdapter = {
    source: "fake",
    patterns: () => [join(dir, "s", "*.jsonl")],
    decode: (l: any, ctx) => [{ source: "fake", session: ctx.path, kind: l.k, ts: new Date().toISOString(), transport: "transcript" }],
  };
  const got: AgentEvent[] = [];
  const w = new TranscriptWatcher([fake], (e) => got.push(...e));
  await w.scan();
  expect(got.map((e) => e.session)).toEqual([live]);
  appendFileSync(old, JSON.stringify({ k: "idle" }) + "\nnot json\n");
  appendFileSync(live, JSON.stringify({ k: "idle" }) + "\n");
  await w.scan();
  const seen = got.map((e) => `${e.session === live ? "live" : "old"}:${e.kind}`);
  expect(seen[0]).toBe("live:start");
  expect(seen.slice(1).sort()).toEqual(["live:idle", "old:idle"]);
});

test("gemini: a message written again as its tool call finishes does not run the tool twice", () => {
  const ctx: FileCtx = { path: "/h/.gemini/tmp/proj/chats/session-1.jsonl", mtime: 0, state: {} };
  const msg = (status: string) => ({ id: "m2", timestamp: "2026-10-14T03:15:06.000Z", type: "gemini", toolCalls: [{ id: "c1", name: "read_file", args: { file_path: "a.ts" }, status }] });
  gemini.decode({ sessionId: "s" }, ctx);
  const tools = [msg("executing"), msg("success")].flatMap((m) => gemini.decode(m, ctx)).filter((e) => e.kind === "tool");
  expect(tools).toHaveLength(1);
  const next = gemini.decode({ ...msg("executing"), toolCalls: [{ id: "c1", name: "read_file", status: "success" }, { id: "c2", name: "run_shell_command", args: { command: "npm test" }, status: "executing" }] }, ctx);
  expect(next.filter((e) => e.kind === "tool").map((e) => e.tool)).toEqual(["run_shell_command"]);
});
