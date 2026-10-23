import { dirname, join } from "node:path";
import type { Tokens } from "../../types/events.ts";
import { LineTail } from "../tail.ts";

/** Where the transcript of the session (or subagent) behind a hook payload lives. */
export function transcriptPathFor(p: Record<string, unknown>): string | undefined {
  const t = typeof p.transcript_path === "string" ? p.transcript_path : undefined;
  if (!t) return undefined;
  const agent = typeof p.agent_id === "string" ? p.agent_id : undefined;
  const session = typeof p.session_id === "string" ? p.session_id : undefined;
  return agent && session ? join(dirname(t), session, "subagents", `agent-${agent}.jsonl`) : t;
}

type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number };
type Track = { tail: LineTail; byRequest: Map<string, Usage>; last?: string; model?: string; sentModel?: string };

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * Follows Claude transcripts incrementally and keeps cumulative token totals per session.
 * Streaming writes several lines per API request; the last usage seen for a request id wins.
 */
export class UsageTracker {
  private tracks = new Map<string, Track>();

  /** Reads what was appended since last time. Returns the totals only when they changed. */
  async update(key: string, path: string): Promise<Tokens | undefined> {
    let t = this.tracks.get(key);
    if (!t || t.tail.path !== path) {
      t = { tail: new LineTail(path), byRequest: new Map() };
      this.tracks.set(key, t);
    }
    const { lines, reset } = await t.tail.read();
    if (reset) t.byRequest.clear();
    for (const l of lines) this.ingest(t, l);

    const total: Tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    for (const u of t.byRequest.values()) {
      total.input += u.input; total.output += u.output;
      total.cacheRead! += u.cacheRead; total.cacheWrite! += u.cacheWrite;
    }
    if (t.byRequest.size === 0) return undefined;
    const sig = JSON.stringify(total);
    if (sig === t.last) return undefined;
    t.last = sig;
    return total;
  }

  /** The model of the latest reply read, only when it changed since the last call. */
  takeModel(key: string): string | undefined {
    const t = this.tracks.get(key);
    if (!t?.model || t.model === t.sentModel) return undefined;
    t.sentModel = t.model;
    return t.model;
  }

  forget(key: string) { this.tracks.delete(key); }

  /** Keeps only the sessions `keep` accepts: a session killed without SessionEnd never sends the end that forgets it. */
  prune(keep: (key: string) => boolean) { for (const k of this.tracks.keys()) if (!keep(k)) this.tracks.delete(k); }

  get size(): number { return this.tracks.size; }

  private ingest(t: Track, line: string) {
    if (!line.includes('"usage"')) return;
    let d: any;
    try { d = JSON.parse(line); } catch { return; }
    const u = d?.message?.usage;
    if (d?.type !== "assistant" || !u) return;
    const model = d.message?.model;
    // Claude Code writes "<synthetic>" for replies it made up itself (an interrupted turn): not a model
    if (typeof model === "string" && model && !model.startsWith("<")) t.model = model;
    const id = String(d.requestId ?? d.message?.id ?? t.byRequest.size);
    t.byRequest.set(id, {
      input: n(u.input_tokens), output: n(u.output_tokens),
      cacheRead: n(u.cache_read_input_tokens), cacheWrite: n(u.cache_creation_input_tokens),
    });
  }
}
