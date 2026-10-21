import { homedir } from "node:os";
import { join, basename, dirname } from "node:path";
import type { AgentEvent } from "../../types/events.ts";
import type { TranscriptAdapter, FileCtx } from "../transcript.ts";
import { detailOf } from "../detail.ts";

/**
 * Cursor agent (editor and cursor-agent CLI): ~/.cursor/projects/<project>/agent-transcripts/<id>/<id>.jsonl.
 * Lines carry no timestamp, so the file's modification time stands in for it.
 */
export const cursor: TranscriptAdapter = {
  source: "cursor",
  patterns: () => [join(homedir(), ".cursor", "projects", "*", "agent-transcripts", "*", "*.jsonl")],
  decode(line: unknown, ctx: FileCtx): AgentEvent[] {
    const d = line as { role?: string; message?: { content?: any[] } };
    const ts = new Date(ctx.mtime).toISOString();
    const project = basename(dirname(dirname(dirname(ctx.path))));
    const base = (kind: AgentEvent["kind"]): AgentEvent => ({ source: "cursor", session: basename(ctx.path, ".jsonl"), cwd: project, kind, ts, transport: "transcript" });
    const out: AgentEvent[] = [];
    if (!ctx.state.started) { ctx.state.started = true; out.push(base("start")); }
    if (d?.role === "user") out.push(base("tool"));
    else if (d?.role === "assistant") {
      const uses = (d.message?.content ?? []).filter((c) => c?.type === "tool_use");
      if (uses.length) for (const u of uses) out.push({ ...base("tool"), tool: String(u.name), detail: detailOf(String(u.name), u.input) });
      else out.push(base("idle"));
    }
    return out;
  },
};
