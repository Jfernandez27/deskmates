import { homedir } from "node:os";
import { join, basename, dirname } from "node:path";
import type { AgentEvent } from "../../types/events.ts";
import type { TranscriptAdapter, FileCtx } from "../transcript.ts";
import { detailOf } from "../detail.ts";

/** GitHub Copilot CLI: ~/.copilot/session-state/<session>/events.jsonl ($COPILOT_HOME overrides ~/.copilot). */
export const copilot: TranscriptAdapter = {
  source: "copilot",
  patterns: () => [join(process.env.COPILOT_HOME ?? join(homedir(), ".copilot"), "session-state", "*", "events.jsonl")],
  decode(line: unknown, ctx: FileCtx): AgentEvent[] {
    const d = line as { type?: string; timestamp?: string; data?: Record<string, any> };
    const data = d?.data ?? {};
    const ts = typeof d?.timestamp === "string" ? d.timestamp : new Date(ctx.mtime).toISOString();
    const session = basename(dirname(ctx.path));
    // replies and tool results name the model; the events after them carry it to the card
    if (typeof data.model === "string" && data.model) ctx.state.model = data.model;
    const base = (kind: AgentEvent["kind"]): AgentEvent => {
      const e: AgentEvent = { source: "copilot", session, kind, ts, transport: "transcript" };
      if (typeof ctx.state.cwd === "string") e.cwd = ctx.state.cwd;
      if (typeof ctx.state.model === "string") e.model = ctx.state.model;
      return e;
    };
    switch (d?.type) {
      case "session.start":
      case "session.resume":
        if (typeof data.context?.cwd === "string") ctx.state.cwd = data.context.cwd;
        return [base("start")];
      case "user.message":
      case "assistant.turn_start":
        return [base("tool")];
      case "tool.execution_start": {
        const tool = typeof data.toolName === "string" ? data.toolName : undefined;
        return [{ ...base("tool"), tool, detail: detailOf(tool, data.arguments) }];
      }
      case "session.idle":
      case "session.usage_checkpoint":
        return [base("idle")];
      case "session.shutdown": {
        const t = data.tokenDetails ?? {};
        const n = (k: string) => (typeof t[k]?.tokenCount === "number" ? t[k].tokenCount : 0);
        return [{ ...base("usage"), tokens: { input: n("input"), output: n("output"), cacheRead: n("cache_read"), cacheWrite: n("cache_write") } }, base("end")];
      }
      default:
        return [];
    }
  },
};
