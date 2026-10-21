import { test, expect } from "vitest";
import { deskAt, walkable, wallMask, isWall, breakSpots, BASE_DECOR, ROOM, bottomOf, type Floor } from "../../web/layout.ts";
import { findPath } from "../../web/path.ts";
import { frameFor, paperTier, fmtTokens, fmtElapsed, dirBetween } from "../../web/anim.ts";

const DOOR = ROOM.door;

test("eight desks per room, seats free, desks distinct", () => {
  const g = walkable(ROOM);
  const seats = new Set<string>();
  for (let i = 0; i < 8; i++) {
    const d = deskAt(ROOM, i);
    expect(d.room).toBe(0);
    expect(g[d.seat.r][d.seat.c]).toBe(true);
    expect(g[d.desk.r][d.desk.c]).toBe(false);
    seats.add(`${d.seat.c},${d.seat.r}`);
  }
  expect(seats.size).toBe(8);
  expect(deskAt(ROOM, 9)).toMatchObject({ room: 1, seat: deskAt(ROOM, 1).seat });
});

test("every seat is reachable from the door and back", () => {
  const g = walkable(ROOM);
  for (let i = 0; i < 8; i++) {
    const p = findPath(g, DOOR, deskAt(ROOM, i).seat);
    expect(p.length).toBeGreaterThan(1);
    for (let k = 1; k < p.length; k++) expect(Math.abs(p[k].c - p[k - 1].c) + Math.abs(p[k].r - p[k - 1].r)).toBe(1);
    expect(findPath(g, deskAt(ROOM, i).seat, DOOR).length).toBe(p.length);
  }
});

test("blocked targets give no path", () => {
  expect(findPath(walkable(ROOM), DOOR, deskAt(ROOM, 0).desk)).toEqual([]);
});

test("walls close the room except the door", () => {
  for (let c = 0; c < ROOM.cols; c++) expect(isWall(ROOM, c, 1)).toBe(true);
  expect(isWall(ROOM, DOOR.c, DOOR.r)).toBe(false);
  expect(isWall(ROOM, 0, 6) && isWall(ROOM, ROOM.cols - 1, 6)).toBe(true);
  expect(wallMask(ROOM, 5, 1)).toBe(2 | 8);
  expect(wallMask(ROOM, 0, 6)).toBe(1 | 4);
  expect(ROOM.rows).toBe(14);
  for (const d of BASE_DECOR.filter((x) => x.blocks)) expect(walkable(ROOM)[d.r][d.c]).toBe(false);
});

test("frames per pose and direction", () => {
  expect(frameFor("walk", "left", 0)).toEqual({ row: 2, frame: 0, mirror: true });
  expect(frameFor("walk", "up", 150).frame).toBe(1);
  // standing at the machines or the table: feet together from every side, never mid-stride
  for (const dir of ["down", "up", "right", "left"] as const) expect(frameFor("break", dir, 0).frame).toBe(1);
  expect(frameFor("typing", "down", 0).frame).toBe(3);
  expect(frameFor("typing", "down", 250).frame).toBe(4);
  expect(frameFor("reading", "down", 600).frame).toBe(6);
  expect(dirBetween({ c: 1, r: 1 }, { c: 1, r: 0 })).toBe("up");
});

test("tokens and time formatting", () => {
  expect(paperTier(undefined)).toBe(0);
  expect(paperTier({ input: 6, output: 386, cacheWrite: 41717 })).toBe(1);
  expect(paperTier({ input: 0, output: 0, cacheWrite: 2_000_000 })).toBe(3);
  expect(fmtTokens(234049)).toBe("234k");
  expect(fmtTokens(2_500_000)).toBe("2.5M");
  expect(fmtElapsed(3_725_000)).toBe("1h 2m");
  expect(fmtElapsed(65_000)).toBe("1m 5s");
});

test("from the door, every seat, break spot and meeting seat is reachable with the base furniture", async () => {
  const g = walkable(ROOM);
  for (const t of [...Array.from({ length: 8 }, (_, i) => deskAt(ROOM, i).seat), ...breakSpots(ROOM.decor), ...ROOM.meeting])
    expect(findPath(g, DOOR, t).length, `${t.c},${t.r}`).toBeGreaterThan(0);
});

test("ROOM is today's room", () => {
  expect([ROOM.cols, ROOM.rows, ROOM.desksPerRoom, ROOM.islandSize]).toEqual([24, 14, 8, 4]);
  expect(ROOM.seats).toHaveLength(8);
  expect(deskAt(ROOM, 9)).toEqual({ room: 1, seat: ROOM.seats[1], desk: { c: ROOM.seats[1].c - 1, r: ROOM.seats[1].r + 1 }, pc: { c: ROOM.seats[1].c + 1, r: ROOM.seats[1].r + 1 } });
  expect(isWall(ROOM, 0, 5)).toBe(true);
  expect(isWall(ROOM, ROOM.door.c, bottomOf(ROOM))).toBe(false);
});

test("walkable works on a floor of another size", () => {
  const big: Floor = { ...ROOM, cols: 48, rows: 28, desksPerRoom: 1, seats: [{ c: 10, r: 10 }], door: { c: 23, r: 27 }, doorGap: [23, 24], decor: [], meeting: [] };
  const g = walkable(big);
  expect(g).toHaveLength(28); expect(g[0]).toHaveLength(48);
  expect(g[11][9]).toBe(false);   // the desk under the seat
  expect(g[27][23]).toBe(true);   // the door lane
  expect(g[27][22]).toBe(false);
});
