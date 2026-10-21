import type { Character } from "../types/events.ts";

/** One hue per PC, far from the status colours (yellow waiting, green done) and from each other. */
export const OWNER_COLORS: readonly string[] = ["#3b78d8", "#d85a3b", "#8b4fd6", "#1fa89a", "#d94f8c", "#7a8c2e", "#c98a1f", "#5a6ad9"];

/** Colour by order of arrival; wraps after eight PCs. */
export function ownerColor(owners: string[], owner: string): string | undefined {
  const i = owners.indexOf(owner);
  return i < 0 ? undefined : OWNER_COLORS[i % OWNER_COLORS.length];
}

/**
 * Owner id → display label. The name (latest seen per owner); PCs sharing a name get ` (<host>)`,
 * and PCs sharing both get ` (2)`, ` (3)` by first appearance. A PC without a name shows its host, then its id.
 */
export function ownerLabels(characters: Character[]): Map<string, string> {
  const seen = new Map<string, { name: string; host?: string }>();
  for (const c of characters) {
    if (!c.owner) continue;
    const prev = seen.get(c.owner);
    seen.set(c.owner, { name: c.ownerName ?? prev?.name ?? c.ownerHost ?? prev?.host ?? c.owner, host: c.ownerHost ?? prev?.host });
  }
  const count = (f: (v: { name: string; host?: string }) => string, key: string) => [...seen.values()].filter((v) => f(v) === key).length;
  const labels = new Map<string, string>();
  const used = new Map<string, number>();
  for (const [owner, v] of seen) {
    let label = v.name;
    if (count((x) => x.name, v.name) > 1 && v.host) label += ` (${v.host})`;
    const n = (used.get(label) ?? 0) + 1;
    used.set(label, n);
    labels.set(owner, n > 1 ? `${label} (${n})` : label);
  }
  return labels;
}
