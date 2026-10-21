/**
 * Long randomized runs of the whole pipeline: events → reducer (desks, rooms that open and close) → scene (walking,
 * breaks, meetings, handovers, pets), under every theme and season. Every step checks where everyone is.
 */
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { Scene, SPEED, PET_RUN, type Actor, type PetChoice } from "../../web/scene.ts";
import { bottomOf, deskAt, walkable, type Decor } from "../../web/layout.ts";
import { reduce, tick, emptyState } from "../../src/core/reducer.ts";
import type { AgentEvent, OfficeState } from "../../src/types/events.ts";
import { floorOf, type Theme, type Season } from "../../web/theme.ts";

const A = new URL("../../assets/", import.meta.url);
const json = (p: string) => JSON.parse(readFileSync(new URL(p, A), "utf8"));
const all: Theme[] = (json("themes/index.json").themes as string[]).map((id) => json(`themes/${id}/theme.json`));
// the room runs switch among the themes drawn on the room; a theme with a floor of its own is covered by the
// headquarters case at the end, which stays on its floor
const themes = all.filter((t) => !t.layout);
const headquarters = all.find((t) => t.id === "headquarters")!;
const seasons: Season[] = json("themes/seasons.json").seasons;
// seasons are not applied to a floor of its own
const decorFor = (t: Theme, s?: Season): Decor[] => [...floorOf(t).decor, ...(t.layout ? [] : s?.decor ?? [])];

function rng(seed: number) {
  return () => ((seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff);
}

const cells = (o: { x: number; y: number }) => {
  const out = new Set<string>();
  for (const c of [Math.floor(o.x), Math.ceil(o.x)]) for (const r of [Math.floor(o.y), Math.ceil(o.y)]) out.add(`${c},${r}`);
  return [...out].map((k) => k.split(",").map(Number) as [number, number]);
};
const settled = (s: Scene, a: Actor) => !a.leaving && !a.path.length;

type Run = { seed: number; theme: Theme; season?: Season; maxAgents: number; steps: number; pets: PetChoice };

/** Returns the most rooms (copies of the floor) that were open at once. */
function run({ seed, theme, season, maxAgents, steps, pets }: Run): number {
  const r = rng(seed);
  const floor = floorOf(theme), BOTTOM = bottomOf(floor), DOOR = floor.door;
  const SEATS = new Set(floor.seats.map((t) => `${t.c},${t.r}`));
  // a theme with a floor of its own stays on it; the room ones switch among themselves
  const pool = theme.layout ? [theme] : themes;
  const T0 = Date.parse("2026-10-14T12:00:00Z");
  let now = T0;
  let state: OfficeState = emptyState([], { desksPerRoom: floor.desksPerRoom, islandSize: floor.islandSize });
  const s = new Scene();
  s.setPets(pets);
  let decor = decorFor(theme, season);
  if (theme.layout) s.setFloor(floor, decor); else s.setDecor(decor);
  let grid = walkable(floor, decor);
  const live = new Set<string>();
  let n = 0, maxRooms = 1;
  const ev = (p: Partial<AgentEvent> & Pick<AgentEvent, "kind" | "session">): AgentEvent =>
    ({ source: "claude", profile: "stress", ts: new Date(now).toISOString(), transport: "hook", ...p });
  const prev = new Map<string, { x: number; y: number; room: number }>();
  const prevPet = new Map<string, { x: number; y: number; room: number }>();
  const where = (step: number) => `seed ${seed} theme ${theme.id} season ${season?.id ?? "none"} pets ${pets} step ${step}`;

  for (let step = 0; step < steps; step++) {
    // ---- events, as the service would apply them
    const roll = r();
    const sessions = [...live];
    if (roll < 0.04 && live.size < maxAgents) {
      const session = `s${n++}`;
      const parent = sessions.length && r() < 0.25 ? sessions[Math.floor(r() * sessions.length)] : undefined;
      state = reduce(state, ev({ kind: "start", session, parent, cwd: `/w/p${Math.floor(r() * 3)}` }));
      live.add(session);
    } else if (roll < 0.07 && sessions.length) {
      const session = sessions[Math.floor(r() * sessions.length)];
      state = reduce(state, ev({ kind: "end", session }));
      live.delete(session);
    } else if (roll < 0.2 && sessions.length) {
      const session = sessions[Math.floor(r() * sessions.length)];
      const k = r();
      state = reduce(state, k < 0.4 ? ev({ kind: "tool", session, tool: r() < 0.5 ? "Edit" : "Read" })
        : k < 0.6 ? ev({ kind: "waiting", session }) : ev({ kind: "idle", session }));
    }
    if (step % 2000 === 1999) {
      // the theme changes under everyone's feet
      const t = pool[Math.floor(r() * pool.length)], se = r() < 0.5 ? seasons[Math.floor(r() * seasons.length)] : undefined;
      decor = decorFor(t, se); s.setDecor(decor); grid = walkable(floor, decor);
    }
    const dt = 16 + Math.floor(r() * 120);
    now += dt;
    state = tick(state, now);
    maxRooms = Math.max(maxRooms, state.rooms);
    s.setRooms(state.rooms);
    s.update(Object.values(state.characters) as any);
    const roomsNow = Math.max(state.rooms, ...[...s.actors.values()].map((o) => o.room + 1));
    s.step(dt);

    // ---- agents
    const still = new Map<string, string>();
    for (const a of s.actors.values()) {
      const p = prev.get(a.key);
      const roomChanged = p && p.room !== a.room;
      if (p && !roomChanged) {
        const moved = Math.abs(a.x - p.x) + Math.abs(a.y - p.y);
        expect(moved, `${where(step)}: ${a.key} jumped ${moved} tiles`).toBeLessThanOrEqual((SPEED * dt) / 1000 + 1e-6);
      }
      if (roomChanged) expect(Math.abs(a.x - DOOR.c) + Math.abs(a.y - DOOR.r), `${where(step)}: ${a.key} changed room away from the door`).toBeLessThanOrEqual((SPEED * dt) / 1000 + 1e-6);
      prev.set(a.key, { x: a.x, y: a.y, room: a.room });
      for (const [c, rr] of cells(a)) {
        if (rr >= BOTTOM - 1) expect(c, `${where(step)}: ${a.key} on the bottom wall at ${a.x},${a.y}`).toBe(DOOR.c);
      }
      // furniture may land on someone when the theme changes; nobody may walk into it afterwards
      if (a.path.length) for (const [c, rr] of cells(a)) {
        const next = a.path[0];
        // the tile it stands on or is stepping off may have just been covered by new furniture: leaving it is fine
        const from = p ? cells(p) : [];
        if (!(c === Math.round(a.x) && rr === Math.round(a.y)) && !from.some(([fc, fr]) => fc === c && fr === rr))
          expect(grid[rr]?.[c] || (next.c === c && next.r === rr), `${where(step)}: ${a.key} walking through furniture at ${c},${rr}`).toBe(true);
      }
      expect(a.room, `${where(step)}: ${a.key} in a closed room`).toBeLessThan(Math.max(state.rooms, ...[...s.actors.values()].map((o) => o.room + 1)));
      if (a.ch.desk !== null && !a.leaving) expect(a.room, `${where(step)}: ${a.key} in the wrong room`).toBe(deskAt(floor, a.ch.desk).room);
      if (settled(s, a)) {
        const k = `${a.room}:${Math.round(a.x)},${Math.round(a.y)}`;
        expect(still.get(k), `${where(step)}: ${a.key} and ${still.get(k)} stand on the same tile ${k}`).toBeUndefined();
        still.set(k, a.key);
      }
    }
    for (const k of prev.keys()) if (!s.actors.has(k)) prev.delete(k);

    // ---- pets
    for (const p of s.pets) {
      const q = prevPet.get(p.name);
      if (q && q.room === p.room) {
        const moved = Math.abs(p.x - q.x) + Math.abs(p.y - q.y);
        // a theme change may make it hop off new furniture, one tile
        expect(moved, `${where(step)}: ${p.name} jumped ${moved}`).toBeLessThanOrEqual(Math.max((PET_RUN * dt) / 1000 + 1e-6, step % 2000 === 1999 ? 30 : 0));
      }
      for (const [c, rr] of cells(p)) {
        expect(SEATS.has(`${c},${rr}`), `${where(step)}: ${p.name} on a chair at ${c},${rr}`).toBe(false);
        // furniture may land on the tile it is stepping off when the theme changes; it never steps onto one
        const leavingIt = p.path.length > 0 && !(p.path[0].c === c && p.path[0].r === rr);
        expect(grid[rr]?.[c] || leavingIt, `${where(step)}: ${p.name} on furniture or a wall at ${c},${rr}`).toBe(true);
        if (rr >= BOTTOM - 1) expect(c, `${where(step)}: ${p.name} on the bottom wall`).toBe(DOOR.c);
      }
      if (!p.path.length) {
        const k = `${p.room}:${Math.round(p.x)},${Math.round(p.y)}`;
        expect(still.get(k), `${where(step)}: ${p.name} sitting on ${still.get(k)} at ${k} owner=${p.owner} sitAt=${JSON.stringify(p.sitAt)} play=${!!p.play} wait=${p.waitUntil}`).toBeUndefined();
      }
    }
    // no two pets ever overlap in a room, however many there are
    const info = (p: any) => JSON.stringify({ n: p.name, room: p.room, x: p.x, y: p.y, path: p.path.slice(0, 3), travel: p.travel, play: p.play ? { chasing: p.play.chasing } : null, owner: p.owner, sitAt: p.sitAt, wait: p.waitUntil, leaving: p.leaving, prev: prevPet.get(p.name) });
    for (const [i, a] of s.pets.entries()) for (const b of s.pets.slice(i + 1)) {
      if (a.room === b.room) expect(Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1, `${where(step)}: pets overlap ${info(a)} ${info(b)}`).toBe(false);
    }
    expect(s.pets.filter((p) => !p.leaving).map((p) => p.name), `${where(step)}: the pets`).toEqual(Scene.petsFor(pets, roomsNow));
    // a pet that left the office may come back with its room, somewhere else
    for (const k of prevPet.keys()) if (!s.pets.some((p) => p.name === k)) prevPet.delete(k);
    for (const p of s.pets) prevPet.set(p.name, { x: p.x, y: p.y, room: p.room });
  }

  // ---- liveness: once things calm down, everyone working gets to their seat
  for (const session of live) state = reduce(state, ev({ kind: "tool", session, tool: "Edit" }));
  s.setRooms(state.rooms);
  s.update(Object.values(state.characters) as any);
  for (let i = 0; i < 1200; i++) s.step(50);
  for (const a of s.actors.values()) {
    if (a.leaving || a.ch.desk === null) continue;
    const seat = deskAt(floor, a.ch.desk).seat;
    expect([a.x, a.y, a.room], `seed ${seed} theme ${theme.id}: ${a.key} never reached its seat`).toEqual([seat.c, seat.r, deskAt(floor, a.ch.desk).room]);
  }
  return maxRooms;
}

for (const theme of themes) {
  test(`stress: ${theme.id}, crowds of up to 30 agents with subagents, rooms opening and closing`, () => {
    // two pets per open room (the default), and all six at once
    for (const seed of [1, 2, 3]) run({ seed: seed * 7919 + theme.id.length, theme, maxAgents: 30, steps: 6000, pets: seed === 3 ? "all" : "auto" });
  }, 120_000);
}
for (const season of seasons) {
  test(`stress: day theme with ${season.id}`, () => {
    run({ seed: season.id.length * 31, theme: themes[0], season, maxAgents: 14, steps: 4000, pets: "all" });
  }, 120_000);
}
test("stress: the headquarters floor, crowds of up to 40 agents with subagents, a second floor opening", () => {
  // 48x28 tiles: the walker's way-finding on four times the room, within the same budget
  for (const seed of [1, 2, 3]) {
    const rooms = run({ seed: seed * 104729, theme: headquarters, maxAgents: 40, steps: 6000, pets: seed === 3 ? "all" : "auto" });
    expect(rooms, `seed ${seed}: more than 24 agents open a second floor`).toBeGreaterThanOrEqual(2);
  }
}, 120_000);
