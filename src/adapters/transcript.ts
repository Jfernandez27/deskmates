import { glob, stat } from "node:fs/promises";
import type { AgentEvent } from "../types/events.ts";
import { LineTail, firstLine } from "./tail.ts";

/** Per-file context an adapter can use: transcripts often put the session id only on their first line. */
export type FileCtx = { path: string; mtime: number; state: Record<string, unknown> };

export type TranscriptAdapter = {
  source: string;
  /** glob patterns of transcript files on this machine */
  patterns(): string[];
  decode(line: unknown, ctx: FileCtx): AgentEvent[];
};

type Watched = { adapter: TranscriptAdapter; tail: LineTail; ctx: FileCtx };

/**
 * Polls transcript files of tools that have no usable hooks. Files that were already quiet when
 * deskmates started are skipped to their end, so old sessions do not walk in; anything active or new is replayed.
 * A skipped file's first line is still decoded, silently: it is where codex and gemini name the session, so one resumed later shows up.
 */
export class TranscriptWatcher {
  private files = new Map<string, Watched>();
  private timer?: NodeJS.Timeout;
  private first = true;
  private busy = false;
  private readonly adapters: TranscriptAdapter[];
  private readonly emit: (events: AgentEvent[]) => void;
  private readonly opts: { intervalMs?: number; recentMs?: number; now?: () => number };
  constructor(adapters: TranscriptAdapter[], emit: (events: AgentEvent[]) => void, opts: { intervalMs?: number; recentMs?: number; now?: () => number } = {}) {
    this.adapters = adapters; this.emit = emit; this.opts = opts;
  }

  start() {
    void this.scan();
    this.timer = setInterval(() => void this.scan(), this.opts.intervalMs ?? 1000);
    this.timer.unref();
  }
  stop() { clearInterval(this.timer); }

  async scan() {
    if (this.busy) return;
    this.busy = true;
    try {
      const now = (this.opts.now ?? Date.now)();
      for (const adapter of this.adapters) for (const pattern of adapter.patterns()) {
        let paths: string[] = [];
        try { for await (const p of glob(pattern)) paths.push(p); } catch { paths = []; }
        for (const path of paths) await this.follow(adapter, path, now);
      }
      this.first = false;
    } finally {
      this.busy = false;
    }
  }

  private async follow(adapter: TranscriptAdapter, path: string, now: number) {
    let w = this.files.get(path);
    let info;
    try { info = await stat(path); } catch { return; }
    if (!w) {
      const stale = this.first && now - info.mtimeMs > (this.opts.recentMs ?? 30 * 60_000);
      w = { adapter, tail: new LineTail(path, stale ? info.size : 0), ctx: { path, mtime: info.mtimeMs, state: {} } };
      this.files.set(path, w);
      if (stale) {
        const head = await firstLine(path);
        try { if (head) adapter.decode(JSON.parse(head), w.ctx); } catch { /* a bad header only means the session stays unnamed */ }
      }
    }
    // most files are old and still: one stat each round, no second one in the tail
    if (info.mtimeMs === w.ctx.mtime && info.size === w.tail.offset) return;
    w.ctx.mtime = info.mtimeMs;
    const { lines, reset } = await w.tail.read();
    if (reset) w.ctx.state = {};
    const events: AgentEvent[] = [];
    for (const l of lines) {
      let d: unknown;
      try { d = JSON.parse(l); } catch { continue; }
      try { events.push(...adapter.decode(d, w.ctx)); } catch { /* one bad line never stops the watcher */ }
    }
    if (events.length) this.emit(events);
  }
}
