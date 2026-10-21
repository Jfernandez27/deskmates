/**
 * The office floor on a 16 px tile grid, as a value. `ROOM` is today's room: every room is identical and rooms sit side
 * by side. Columns 1-17 hold the 8 desks; columns 18-22 are a lounge with the meeting table.
 */
export const TILE = 16;

export type Tile = { c: number; r: number };
export type Desk = { room: number; seat: Tile; desk: Tile; pc: Tile };

/**
 * One floor: its size, the seat of each desk (the 3x2 desk sits below its seat, the pc on its right), the doorway in the
 * bottom wall, its whole furniture and the seats around its meeting table.
 */
export type Floor = {
  cols: number; rows: number; desksPerRoom: number;
  /** desks reserved per PC; islands = desksPerRoom / islandSize */
  islandSize: number;
  /** seats[i] is the seat of desk i % desksPerRoom */
  seats: Tile[];
  /** where everyone comes in and goes out: the lane of the doorway they walk */
  door: Tile;
  /** columns of the gap in the bottom wall */
  doorGap: number[];
  decor: Decor[];
  meeting: (Tile & { face: "left" | "right" | "up" })[];
};

/** row of the bottom wall, where the door is */
export const bottomOf = (f: Floor) => f.rows - 1;

/** Seat (where the character sits, facing the viewer) and the 3x2 desk below it. */
export function deskAt(f: Floor, index: number): Desk {
  const { c, r } = f.seats[index % f.desksPerRoom];
  const seat = { c, r }; // a fresh tile each call, as before, so no caller can move a seat by mutating it
  return { room: Math.floor(index / f.desksPerRoom), seat, desk: { c: c - 1, r: r + 1 }, pc: { c: c + 1, r: r + 1 } };
}

export function isWall(f: Floor, c: number, r: number): boolean {
  const bottom = bottomOf(f);
  if (r === 1) return c >= 0 && c < f.cols;
  if (r < 1 || r > bottom || c < 0 || c >= f.cols) return false;
  if (c === 0 || c === f.cols - 1) return true;
  return r === bottom && !f.doorGap.includes(c);
}

/** Wall autotile mask: N=1, E=2, S=4, W=8 (Pixel Agents' wall sheet order). */
export function wallMask(f: Floor, c: number, r: number): number {
  return (isWall(f, c, r - 1) ? 1 : 0) | (isWall(f, c + 1, r) ? 2 : 0) | (isWall(f, c, r + 1) ? 4 : 0) | (isWall(f, c - 1, r) ? 8 : 0);
}

/**
 * A sprite placed in the room by its bottom-left tile. `w`×`h` tiles are blocked for walking when `blocks`.
 * `src` is a path under /assets/. Wall pieces hang on the top wall and block nothing.
 */
export type Decor = { src: string; c: number; r: number; w?: number; h?: number; blocks: boolean; role?: "machine" | "clock" | "meeting" | "screen"; frames?: string[]; spots?: BreakSpot[] };

/** What an agent does on a break: a drink at the machines (and a chat), a coffee, the sofa, or a game on the TV. */
export type Activity = "drink" | "coffee" | "sofa" | "game";
/**
 * Where an agent on a break goes, which way it faces there and what it does. Furniture brings its own spots, so every
 * theme brings its own break room. Sofa and game spots are seats: nobody walks across them, like the desk chairs.
 */
export type BreakSpot = Tile & { face: "up" | "down" | "left" | "right"; act: Activity };
export const SITTING: ReadonlySet<Activity> = new Set(["sofa", "game"]);
/** The break spots of a room's furniture, in the order the furniture is listed. */
export const breakSpots = (decor: Decor[]): BreakSpot[] => decor.flatMap((d) => d.spots ?? []);

export const PA = (p: string) => `pixel-agents/furniture/${p}.png`;
export const BASE_DECOR: Decor[] = [
  // the break room: drinks and coffee by the door wall, snacks apart at the head of the aisle, a TV and a sofa in the lounge
  { src: "breakroom/SODA.png", c: 1, r: 2, blocks: true, role: "machine",
    spots: [{ c: 1, r: 3, face: "up", act: "drink" }, { c: 1, r: 4, face: "up", act: "drink" }, { c: 1, r: 5, face: "up", act: "drink" }] },
  { src: "themes/cafe/ESPRESSO.png", c: 2, r: 2, blocks: true, role: "machine", spots: [{ c: 2, r: 3, face: "down", act: "coffee" }] },
  { src: "breakroom/SNACKS.png", c: 17, r: 2, blocks: true, role: "machine", spots: [{ c: 17, r: 3, face: "up", act: "drink" }] },
  { src: "breakroom/TV_1.png", c: 19, r: 1, w: 2, blocks: false, role: "screen", frames: ["breakroom/TV_1.png", "breakroom/TV_2.png", "breakroom/TV_3.png"] },
  { src: PA("SOFA/SOFA_BACK"), c: 19, r: 3, w: 2, blocks: false,
    spots: [{ c: 19, r: 3, face: "up", act: "sofa" }, { c: 20, r: 3, face: "up", act: "game" }] },
  { src: PA("BOOKSHELF/BOOKSHELF"), c: 3, r: 1, blocks: false },
  { src: PA("WHITEBOARD/WHITEBOARD"), c: 8, r: 1, blocks: false },
  { src: PA("CLOCK/CLOCK"), c: 14, r: 1, blocks: false, role: "clock" },
  { src: PA("PLANT/PLANT"), c: 1, r: 8, blocks: true },
  { src: PA("PLANT/PLANT"), c: 22, r: 3, blocks: true },
  { src: PA("TABLE_FRONT/TABLE_FRONT"), c: 19, r: 8, w: 3, h: 4, blocks: true, role: "meeting" },
  { src: PA("LARGE_PLANT/LARGE_PLANT"), c: 21, r: 11, w: 2, h: 1, blocks: true },
];

/** Today's room. */
export const ROOM: Floor = {
  cols: 24, rows: 14, desksPerRoom: 8, islandSize: 4,
  // four desks a row; the top row leaves a free strip under the wall for the vending machines, the bottom row keeps a wide aisle
  seats: Array.from({ length: 8 }, (_, i) => ({ c: 3 + (i % 4) * 4, r: i < 4 ? 4 : 9 })),
  // the right lane of the doorway, which lines up with the aisle between desks
  door: { c: 9, r: 13 }, doorGap: [8, 9],
  decor: BASE_DECOR,
  // seats around the meeting table, in the order they fill (both ends, then the front, then the rest)
  meeting: [
    { c: 18, r: 6, face: "right" }, { c: 22, r: 6, face: "left" },
    { c: 20, r: 9, face: "up" },
    { c: 18, r: 7, face: "right" }, { c: 22, r: 7, face: "left" },
    { c: 19, r: 9, face: "up" }, { c: 21, r: 9, face: "up" },
  ],
};

/** Rooms the page draws for the desks in use, by its own floor: up to the room of the highest desk, at least one. */
export function roomsNeeded(chars: readonly { desk: number | null }[], desksPerRoom: number): number {
  let max = -1;
  for (const c of chars) if (c.desk !== null) max = Math.max(max, c.desk);
  return Math.max(1, Math.floor(max / desksPerRoom) + 1);
}

export function walkable(f: Floor, decor: Decor[] = f.decor): boolean[][] {
  const bottom = bottomOf(f);
  const g = Array.from({ length: f.rows }, (_, r) => Array.from({ length: f.cols }, (_, c) => r >= 2 && !isWall(f, c, r)));
  const block = (c: number, r: number) => { if (r >= 0 && r < f.rows && c >= 0 && c < f.cols) g[r][c] = false; };
  for (let i = 0; i < f.desksPerRoom; i++) {
    const { desk } = deskAt(f, i);
    for (let dc = 0; dc < 3; dc++) for (let dr = 0; dr < 2; dr++) block(desk.c + dc, desk.r + dr);
  }
  for (const d of decor) if (d.blocks) for (let dc = 0; dc < (d.w ?? 1); dc++) for (let dr = 0; dr < (d.h ?? 1); dr++) block(d.c + dc, d.r - dr);
  // the bottom wall is drawn two tiles tall, so its row and the one above it are wall to walkers too; the doorway is
  // two tiles wide but walked through in one lane, straight in and out
  for (let c = 0; c < f.cols; c++) { g[bottom][c] = c === f.door.c; g[bottom - 1][c] = c === f.door.c; }
  return g;
}
