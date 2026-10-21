import type { Tile } from "./layout.ts";

/** Shortest 4-neighbour path on an unweighted grid (BFS). Includes both ends; [] if unreachable or the goal is blocked. */
export function findPath(grid: boolean[][], from: Tile, to: Tile): Tile[] {
  const rows = grid.length, cols = grid[0].length;
  const inside = (t: Tile) => t.r >= 0 && t.r < rows && t.c >= 0 && t.c < cols;
  const ok = (t: Tile) => inside(t) && grid[t.r][t.c];
  // the start may be blocked (furniture of a new theme landed there): you can always step off where you stand
  if (!inside(from) || !ok(to)) return [];
  const id = (t: Tile) => t.r * cols + t.c;
  const prev = new Map<number, Tile | null>([[id(from), null]]);
  const queue: Tile[] = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur.c === to.c && cur.r === to.r) {
      const out: Tile[] = [];
      for (let t: Tile | null = cur; t; t = prev.get(id(t))!) out.unshift(t);
      return out;
    }
    for (const [dc, dr] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      const n = { c: cur.c + dc, r: cur.r + dr };
      if (ok(n) && !prev.has(id(n))) { prev.set(id(n), cur); queue.push(n); }
    }
  }
  return [];
}
