import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentEvent } from "../../types/events.ts";
import type { TranscriptAdapter, FileCtx } from "../transcript.ts";
import { detailOf } from "../detail.ts";

/** Codex CLI and Codex Desktop: ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl ($CODEX_HOME overrides ~/.codex). */
export const codex: TranscriptAdapter = {
  source: "codex",
  patterns: () => [join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "sessions", "**", "rollout-*.jsonl")],
  decode(line: unknown, ctx: FileCtx): AgentEvent[] {
    const d = line as { timestamp?: string; type?: string; payload?: Record<string, any> };
    const p = d?.payload ?? {};
    const ts = typeof d?.timestamp === "string" ? d.timestamp : new Date(ctx.mtime).toISOString();
    if (d?.type === "session_meta") {
      ctx.state.session = p.id ?? p.session_id;
      ctx.state.cwd = p.cwd;
      return ctx.state.session ? [ev(ctx, "start", ts)] : [];
    }
    if (!ctx.state.session) return [];
    if (d?.type === "event_msg") {
      if (p.type === "task_started" || p.type === "user_message") return [ev(ctx, "tool", ts)];
      if (p.type === "task_complete" || p.type === "turn_aborted") return [ev(ctx, "idle", ts)];
      if (p.type === "token_count" && p.info?.total_token_usage) {
        const u = p.info.total_token_usage;
        const cached = num(u.cached_input_tokens);
        return [{ ...ev(ctx, "usage", ts), tokens: { input: Math.max(0, num(u.input_tokens) - cached), output: num(u.output_tokens), cacheRead: cached, cacheWrite: num(u.cache_write_input_tokens) } }];
      }
      return [];
    }
    if (d?.type === "response_item" && (p.type === "function_call" || p.type === "custom_tool_call" || p.type === "local_shell_call")) {
      const tool = String(p.name ?? "shell");
      return [{ ...ev(ctx, "tool", ts), tool, detail: p.type === "function_call" ? detailOf(tool, p.arguments) : undefined }];
    }
    return [];
  },
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
function ev(ctx: FileCtx, kind: AgentEvent["kind"], ts: string): AgentEvent {
  const e: AgentEvent = { source: "codex", session: String(ctx.state.session), kind, ts, transport: "transcript" };
  if (typeof ctx.state.cwd === "string") e.cwd = ctx.state.cwd;
  return e;
}
