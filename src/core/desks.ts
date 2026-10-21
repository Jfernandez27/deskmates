import type { OfficeState } from "../types/events.ts";

function taken(state: OfficeState): Set<number> {
  const s = new Set<number>();
  for (const c of Object.values(state.characters)) if (c.desk !== null) s.add(c.desk);
  return s;
}

/** The island an owner's agents sit on: owners in order of arrival, wrapping round the islands of one room. */
export function islandOf(state: OfficeState, owner: string): number {
  const i = state.owners.indexOf(owner);
  if (i < 0) return -1;
  const { desksPerRoom, islandSize } = state.floor;
  return i % Math.max(1, Math.floor(desksPerRoom / islandSize));
}

/** The free desk of `desks` closest to `near` (ties go to the higher index), or the lowest without `near`. */
function pick(desks: number[], used: Set<number>, near?: number): number | undefined {
  let best: number | undefined;
  for (const d of desks) {
    if (used.has(d)) continue;
    if (best === undefined) { best = d; continue; }
    if (near === undefined) continue;
    const a = Math.abs(d - near), b = Math.abs(best - near);
    if (a < b || (a === b && d > best)) best = d;
  }
  return best;
}

/** Desks of the given island indexes in the given rooms. */
function islandDesks(state: OfficeState, rooms: number[], islands: number[]): number[] {
  const { desksPerRoom, islandSize } = state.floor;
  const out: number[] = [];
  for (const r of rooms) for (const i of islands) for (let k = 0; k < islandSize; k++) out.push(r * desksPerRoom + i * islandSize + k);
  return out;
}

/**
 * Unowned (no `island`): the free desk closest to `near` in the same room (ties go to the higher index), else the
 * first free desk. Owned (`island` ≥ 0), so one PC's agents never spill onto another known PC's island: first a free
 * desk of its own island (closest to `near` for a subagent, in the parent's room; else the first, in the rooms open
 * now), then one of an island no known owner holds, then the unowned rule.
 */
export function assignDesk(state: OfficeState, near?: number, island?: number): number {
  const { desksPerRoom, islandSize } = state.floor;
  const used = taken(state);
  if (island !== undefined && island >= 0) {
    const islandCount = Math.max(1, Math.floor(desksPerRoom / islandSize));
    const rooms = near !== undefined ? [Math.floor(near / desksPerRoom)] : [...Array(roomsFor(state)).keys()];
    const unheld: number[] = [];
    for (let i = Math.min(state.owners.length, islandCount); i < islandCount; i++) unheld.push(i);
    const d = pick(islandDesks(state, rooms, [island]), used, near) ?? pick(islandDesks(state, rooms, unheld), used, near);
    if (d !== undefined) return d;
  }
  if (near !== undefined) {
    const start = near - (near % desksPerRoom);
    for (let off = 1; off < desksPerRoom; off++) {
      for (const d of [near + off, near - off]) if (d >= start && d < start + desksPerRoom && !used.has(d)) return d;
    }
  }
  let d = 0;
  while (used.has(d)) d++;
  return d;
}

export function roomsFor(state: OfficeState): number {
  let max = -1;
  for (const c of Object.values(state.characters)) if (c.desk !== null) max = Math.max(max, c.desk);
  return Math.max(1, Math.floor(max / state.floor.desksPerRoom) + 1);
}

/**
 * Moves whoever sits in a room that is no longer needed to a free desk of a lower room, so empty rooms close. An
 * owned character only moves to a free desk of its own island, else it stays and keeps its room open; others take the
 * first free desk.
 */
export function compact(state: OfficeState): OfficeState {
  const { desksPerRoom, islandSize } = state.floor;
  const seated = Object.values(state.characters).filter((c) => c.desk !== null).length;
  const limit = Math.max(1, Math.ceil(seated / desksPerRoom)) * desksPerRoom;
  const out = Object.entries(state.characters).filter(([, c]) => c.desk !== null && c.desk >= limit).sort(([, a], [, b]) => a.desk! - b.desk!);
  if (!out.length) return state;
  const used = taken(state);
  const characters = { ...state.characters };
  let changed = false;
  for (const [k, c] of out) {
    const island = c.owner ? islandOf(state, c.owner) : -1;
    let to: number | undefined;
    if (island >= 0) {
      const room = Math.floor(c.desk! / desksPerRoom);
      for (let r = 0; r < room && to === undefined; r++) {
        const first = r * desksPerRoom + island * islandSize;
        for (let d = first; d < first + islandSize; d++) if (!used.has(d)) { to = d; break; }
      }
    } else {
      to = 0;
      while (used.has(to)) to++;
      if (to >= c.desk!) to = undefined;
    }
    if (to === undefined) continue;
    used.delete(c.desk!);
    used.add(to);
    characters[k] = { ...c, desk: to };
    changed = true;
  }
  return changed ? { ...state, characters } : state;
}
