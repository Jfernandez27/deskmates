import type { AgentEvent } from "../types/events.ts";

export const DEDUP_WINDOW_MS = 2_000;

/**
 * When the same fact arrives by hook and by transcript, keep the hook version (spec §4).
 * Only cross-transport echoes are dropped: two hook events of the same kind are both real.
 */
export class Dedup {
  private seen = new Map<string, { transport: AgentEvent["transport"]; t: number }>();

  keep(e: AgentEvent): boolean {
    if (e.kind === "usage") return true;
    const k = `${e.owner ?? ""}:${e.source}/${e.profile ?? ""}/${e.session}/${e.kind}`;
    const t = Date.parse(e.ts);
    const prev = this.seen.get(k);
    if (prev && prev.transport !== e.transport && Math.abs(t - prev.t) < DEDUP_WINDOW_MS && prev.transport === "hook") return false;
    this.seen.set(k, { transport: e.transport, t });
    if (this.seen.size > 5_000) this.seen.delete(this.seen.keys().next().value!);
    return true;
  }
}
