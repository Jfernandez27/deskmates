import { homedir } from "node:os";
import { join, basename, dirname } from "node:path";
import type { AgentEvent } from "../../types/events.ts";
import type { TranscriptAdapter, FileCtx } from "../transcript.ts";
import { detailOf } from "../detail.ts";

/**
 * Gemini CLI chat recordings: <home>/.gemini/tmp/<project>/chats/session-*.jsonl ($GEMINI_CLI_HOME replaces <home>).
 * Format from the 0.59.0 sources (chatRecordingTypes): a header line, then message records; the same message id
 * can be appended several times as it fills in, so tokens are kept per id, last copy wins.
 */
export const gemini: TranscriptAdapter = {
  source: "gemini",
  patterns: () => [join(process.env.GEMINI_CLI_HOME ?? homedir(), ".gemini", "tmp", "*", "chats", "session-*.jsonl")],
  decode(line: unknown, ctx: FileCtx): AgentEvent[] {
    const d = line as Record<string, any>;
    const project = basename(dirname(dirname(ctx.path)));
    const tokens = (ctx.state.tokens ??= {}) as Record<string, { input: number; output: number; cached: number }>;
    const ts = typeof d?.timestamp === "string" ? d.timestamp : typeof d?.startTime === "string" ? d.startTime : new Date(ctx.mtime).toISOString();
    const base = (kind: AgentEvent["kind"]): AgentEvent => ({ source: "gemini", session: String(ctx.state.session), cwd: project, kind, ts, transport: "transcript" });

    if (typeof d?.sessionId === "string" && d.type === undefined) {
      ctx.state.session = d.sessionId;
      return [base("start")];
    }
    if (!ctx.state.session || typeof d?.type !== "string") return [];
    if (d.type === "user") return [base("tool")];
    if (d.type !== "gemini") return [];

    const out: AgentEvent[] = [];
    const calls = Array.isArray(d.toolCalls) ? d.toolCalls : [];
    const last = calls.at(-1);
    if (last) out.push({ ...base("tool"), tool: String(last.name), detail: detailOf(String(last.name), last.args) });
    if (d.tokens && typeof d.id === "string") {
      tokens[d.id] = { input: num(d.tokens.input), output: num(d.tokens.output), cached: num(d.tokens.cached) };
      const sum = Object.values(tokens).reduce((a, t) => ({ input: a.input + t.input - t.cached, output: a.output + t.output, cacheRead: a.cacheRead + t.cached }), { input: 0, output: 0, cacheRead: 0 });
      out.push({ ...base("usage"), tokens: sum });
    }
    if (!calls.length || calls.every((c: any) => c.status === "success" || c.status === "error" || c.status === "cancelled")) {
      if (!calls.length) out.push(base("idle"));
    }
    return out;
  },
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
