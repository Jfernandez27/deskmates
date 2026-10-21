import type { AgentEvent, EventKind } from "../../types/events.ts";
import { detailOf } from "../detail.ts";

/** "~/.claude-work/projects/…" → "claude-work". The profile is the config dir that holds `projects/`. */
export function profileFromTranscript(path: unknown): string | undefined {
  if (typeof path !== "string") return undefined;
  const parts = path.split("/");
  const i = parts.lastIndexOf("projects");
  if (i < 1) return undefined;
  return parts[i - 1].replace(/^\./, "") || undefined;
}

const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : undefined);

const KIND: Record<string, EventKind> = {
  SessionStart: "start",
  UserPromptSubmit: "tool",
  PreToolUse: "tool",
  PostToolUse: "tool",
  PostToolUseFailure: "tool",
  PermissionRequest: "waiting",
  Notification: "waiting",
  Stop: "idle",
  SessionEnd: "end",
  SubagentStart: "start",
  SubagentStop: "end",
};

/** Translates one Claude Code hook payload into normalized events. `now` stamps them: hooks carry no time. */
export function fromHook(payload: unknown, now: string): AgentEvent[] {
  if (!payload || typeof payload !== "object") return [];
  const p = payload as Record<string, unknown>;
  const name = str(p.hook_event_name);
  const sessionId = str(p.session_id);
  if (!name || !sessionId || !(name in KIND)) return [];

  const agentId = str(p.agent_id);
  const agentType = str(p.agent_type);
  const ev: AgentEvent = {
    source: "claude",
    profile: profileFromTranscript(p.transcript_path),
    session: agentId ?? sessionId,
    parent: agentId ? sessionId : undefined,
    agent: agentType,
    cwd: str(p.cwd),
    kind: KIND[name],
    ts: now,
    transport: "hook",
  };
  if (name === "PreToolUse") {
    const tool = str(p.tool_name);
    ev.tool = tool;
    ev.detail = detailOf(tool, p.tool_input);
  }
  for (const k of Object.keys(ev) as (keyof AgentEvent)[]) if (ev[k] === undefined) delete ev[k];
  return [ev];
}
