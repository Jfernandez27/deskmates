/**
 * The `layout` block of a theme.json: a floor of its own (size, desk seats, doorway, meeting seats). Pure, no DOM and no
 * Node, so the page and the server check it the same way. A desk is 3x2 tiles below its seat (seat.c-1..seat.c+1,
 * seat.r+1..seat.r+2); the outer columns, the two-tile top wall and the two-tile bottom wall are walls.
 */
export type FloorTile = { c: number; r: number };
export type MeetingSeat = FloorTile & { face: "left" | "right" | "up" };
export type FloorSpec = {
  cols: number; rows: number;
  /** desks reserved per PC; 4 when left out, and never more than the seats */
  islandSize?: number;
  seats: FloorTile[];
  door: FloorTile;
  doorGap: number[];
  meeting: MeetingSeat[];
};

const int = (v: unknown, lo: number, hi: number): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
const tile = (v: any, cols: number, rows: number) => !!v && int(v.c, 0, cols - 1) && int(v.r, 0, rows - 1);

/** Returns the spec with `islandSize` filled in (at most the number of seats); throws `floor.<field> …` naming the first thing that is wrong. */
export function checkFloorSpec(f: unknown): FloorSpec {
  const bad = (field: string, why: string): never => { throw new Error(`floor${field ? `.${field}` : ""} ${why}`); };
  if (!f || typeof f !== "object") bad("", "must be an object");
  const s = f as any;
  if (!int(s.cols, 16, 96)) bad("cols", "must be a whole number from 16 to 96");
  if (!int(s.rows, 10, 64)) bad("rows", "must be a whole number from 10 to 64");
  const { cols, rows } = s as { cols: number; rows: number };
  const islandSize = s.islandSize ?? 4;
  if (!int(islandSize, 1, 96)) bad("islandSize", "must be a whole number from 1");
  if (!Array.isArray(s.seats) || !s.seats.length) bad("seats", "must list at least one seat");
  const desks: FloorTile[] = [];
  for (const [i, seat] of (s.seats as any[]).entries()) {
    // the seat and its desk inside the walls: columns 1..cols-2, rows 2..rows-3
    if (!seat || !int(seat.c, 2, cols - 3) || !int(seat.r, 2, rows - 5)) bad(`seats[${i}]`, "puts its desk or seat in a wall");
    const desk = { c: seat.c - 1, r: seat.r + 1 };
    if (desks.some((d) => Math.abs(d.c - desk.c) < 3 && Math.abs(d.r - desk.r) < 2)) bad(`seats[${i}]`, "puts its desk on another desk");
    // a seat on another desk, either way round
    const on = (t: FloorTile, d: FloorTile) => t.c >= d.c && t.c <= d.c + 2 && t.r >= d.r && t.r <= d.r + 1;
    if (desks.some((d, j) => on(seat, d) || on(s.seats[j], desk))) bad(`seats[${i}]`, "puts a seat on a desk");
    desks.push(desk);
  }
  if (!s.door || !int(s.door.c, 1, cols - 2) || s.door.r !== rows - 1) bad("door", "must be a tile of the bottom row");
  const gap = s.doorGap;
  if (!Array.isArray(gap) || gap.length !== 2 || !gap.every((c: unknown) => int(c, 1, cols - 2)) || gap[1] !== gap[0] + 1 || !gap.includes(s.door.c)) {
    bad("doorGap", "must be two adjacent columns that contain door.c");
  }
  if (!Array.isArray(s.meeting)) bad("meeting", "must be a list");
  for (const [i, m] of (s.meeting as any[]).entries()) {
    if (!tile(m, cols, rows) || !["left", "right", "up"].includes(m.face)) bad(`meeting[${i}]`, "must be a tile of the floor facing left, right or up");
  }
  // an island never holds more desks than the floor has
  return { cols, rows, islandSize: Math.min(islandSize, s.seats.length), seats: s.seats, door: s.door, doorGap: gap, meeting: s.meeting };
}
