import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fromHook, profileFromTranscript } from "../../src/adapters/claude/hook.ts";
import { reduce, emptyState } from "../../src/core/reducer.ts";

const load = (name: string) =>
  readFileSync(new URL(`../fixtures/claude/${name}.jsonl`, import.meta.url), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const NOW = "2026-10-14T12:00:00.000Z";
const short = (s: string) => s.slice(0, 4);

test("profile comes from the config dir in transcript_path", () => {
  expect(profileFromTranscript("/home/user/.claude-work/projects/-tmp/x.jsonl")).toBe("claude-work");
  expect(profileFromTranscript("/home/user/.claude/projects/-tmp/x.jsonl")).toBe("claude");
  expect(profileFromTranscript("/srv/agents/team-a/projects/p/x.jsonl")).toBe("team-a");
  expect(profileFromTranscript(undefined)).toBeUndefined();
});

test("session with a subagent maps to the expected events", () => {
  const evs = load("session-with-subagent").flatMap((p) => fromHook(p, NOW));
  const sub = "aaea";
  expect(evs.map((e) => [short(e.session), e.kind, e.tool ?? "", e.detail ?? "", e.parent ? short(e.parent) : ""])).toEqual([
    ["1155", "start", "", "", ""],
    ["1155", "tool", "", "", ""],
    ["1155", "tool", "Read", "hostname", ""],
    ["1155", "tool", "", "", ""],
    ["1155", "tool", "Agent", "List /tmp/claude-1000 names", ""],
    [sub, "start", "", "", "1155"],
    [sub, "tool", "Bash", "ls -A /tmp/claude-1000", "1155"],
    [sub, "tool", "", "", "1155"],
    [sub, "end", "", "", "1155"],
    ["1155", "tool", "", "", ""],
    ["1155", "idle", "", "", ""],
    ["1155", "end", "", "", ""],
  ]);
  for (const e of evs) expect(e).toMatchObject({ source: "claude", profile: "claude-work", cwd: "/tmp", ts: NOW, transport: "hook" });
  expect(evs[5].agent).toBe("Explore");
});

test("a --agent session carries its agent name and gets the right label", () => {
  const evs = load("named-agent").flatMap((p) => fromHook(p, NOW));
  expect(evs.map((e) => e.kind)).toEqual(["start", "tool", "idle", "end"]);
  for (const e of evs) expect(e.agent).toBe("id3a:designer");
  const s = reduce(emptyState(), evs[0]);
  expect(Object.values(s.characters)[0].label).toBe("claude-work · id3a:designer");
});

test("permission requests and notifications mean waiting", () => {
  const base = { session_id: "s", transcript_path: "/h/.claude/projects/p/s.jsonl", cwd: "/p" };
  expect(fromHook({ ...base, hook_event_name: "PermissionRequest", tool_name: "Bash" }, NOW)[0].kind).toBe("waiting");
  expect(fromHook({ ...base, hook_event_name: "Notification" }, NOW)[0].kind).toBe("waiting");
});

test("only notifications that ask for an answer mean waiting; an agent idle at its prompt stays done", () => {
  const base = { session_id: "s", transcript_path: "/h/.claude/projects/p/s.jsonl", cwd: "/p", hook_event_name: "Notification" };
  expect(fromHook({ ...base, notification_type: "permission_prompt" }, NOW)[0].kind).toBe("waiting");
  expect(fromHook({ ...base, notification_type: "elicitation_dialog" }, NOW)[0].kind).toBe("waiting");
  expect(fromHook({ ...base, notification_type: "idle_prompt", message: "Claude is waiting for your input" }, NOW)).toEqual([]);
  expect(fromHook({ ...base, notification_type: "auth_success" }, NOW)).toEqual([]);
});

test("never leaks prompts or tool contents, and details are short", () => {
  const secret = "SECRET-" + "x".repeat(300);
  const base = { session_id: "s", transcript_path: "/h/.claude/projects/p/s.jsonl", cwd: "/p" };
  const evs = [
    fromHook({ ...base, hook_event_name: "UserPromptSubmit", prompt: secret }, NOW),
    fromHook({ ...base, hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: "/a/b/notes.md", content: secret } }, NOW),
    fromHook({ ...base, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: secret } }, NOW),
    fromHook({ ...base, hook_event_name: "PreToolUse", tool_name: "Agent", tool_input: { prompt: secret } }, NOW),
    fromHook({ ...base, hook_event_name: "Stop", last_assistant_message: secret }, NOW),
  ].flat();
  for (const e of evs) {
    expect(e.detail?.length ?? 0).toBeLessThanOrEqual(120);
    expect(JSON.stringify({ ...e, detail: undefined })).not.toContain("SECRET");
  }
  expect(evs[1].detail).toBe("notes.md");
  expect(evs[3].detail).toBeUndefined();
});

test("unknown events and garbage payloads produce nothing", () => {
  expect(fromHook({ hook_event_name: "PreCompact", session_id: "s" }, NOW)).toEqual([]);
  expect(fromHook({ hook_event_name: "Stop" }, NOW)).toEqual([]);
  expect(fromHook(null, NOW)).toEqual([]);
  expect(fromHook("x", NOW)).toEqual([]);
});
