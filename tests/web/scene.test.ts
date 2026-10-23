import { test, expect } from "vitest";
import { Scene, PET_NAMES, VISIT_AFTER_MS, BREAK_AFTER_MS, TALK_MS } from "../../web/scene.ts";
import { ROOM, deskAt, roomsNeeded, type Floor } from "../../web/layout.ts";
import type { ViewCharacter } from "../../src/server/server.ts";

const DOOR = ROOM.door;

const ch = (p: Partial<ViewCharacter>): ViewCharacter => ({
  key: "k", source: "claude", session: "s", label: "l", status: "working", activity: "typing",
  startedAt: "2026-10-14T12:00:00Z", lastEventAt: 0, desk: 0, ...p,
});

test("arrives at the door and walks to its seat", () => {
  const s = new Scene();
  s.update([ch({})]);
  const a = s.actors.get("k")!;
  expect([a.x, a.y]).toEqual([DOOR.c, DOOR.r]);
  expect(s.pose(a)).toBe("walk");
  s.step(10_000);
  expect([a.x, a.y]).toEqual([deskAt(ROOM, 0).seat.c, deskAt(ROOM, 0).seat.r]);
  expect(s.pose(a)).toBe("typing");
  expect(a.dir).toBe("down");
});

test("walks only along the grid, one tile at a time", () => {
  const s = new Scene();
  s.update([ch({ desk: 5 })]);
  const a = s.actors.get("k")!;
  let prev = [a.x, a.y];
  for (let i = 0; i < 200; i++) {
    s.step(16);
    expect(Math.abs(a.x - prev[0]) + Math.abs(a.y - prev[1])).toBeLessThanOrEqual(5 * 0.016 + 1e-9);
    prev = [a.x, a.y];
  }
});

test("status drives the pose once seated", () => {
  const s = new Scene(true);
  s.update([ch({ status: "waiting" })]);
  expect(s.pose(s.actors.get("k")!)).toBe("waiting");
  s.update([ch({ status: "working", activity: "reading" })]);
  expect(s.pose(s.actors.get("k")!)).toBe("reading");
  s.update([ch({ status: "sleeping" })]);
  expect(s.pose(s.actors.get("k")!)).toBe("sleeping");
});

test("leaving walks to the door and then disappears, also when the server already dropped it", () => {
  const s = new Scene();
  s.update([ch({})]); s.step(10_000);
  s.update([ch({ desk: null, status: "leaving" })]);
  expect(s.pose(s.actors.get("k")!)).toBe("walk");
  s.step(10_000);
  expect(s.actors.has("k")).toBe(false);
  s.update([ch({ key: "j" })]); s.step(10_000);
  s.update([]);
  expect(s.actors.get("j")!.leaving).toBe(true);
  s.step(10_000);
  expect(s.actors.size).toBe(0);
});

test("an agent missing from one message (the server restarted) and back at the same desk sits down again instead of walking out", () => {
  const s = new Scene();
  s.update([ch({})]); s.step(10_000);
  s.update([]);
  expect(s.actors.get("k")!.leaving).toBe(true);
  s.update([ch({})]);
  const a = s.actors.get("k")!;
  expect(a.leaving).toBe(false);
  s.step(10_000);
  expect(s.actors.has("k")).toBe(true);
  expect([a.x, a.y]).toEqual([deskAt(ROOM, 0).seat.c, deskAt(ROOM, 0).seat.r]);
});

test("desks in the second room put the actor in room 1", () => {
  const s = new Scene(true);
  s.update([ch({ desk: 9 })]);
  expect(s.actors.get("k")).toMatchObject({ room: 1, x: deskAt(ROOM, 1).seat.c, y: deskAt(ROOM, 1).seat.r });
});

test("the desk shows the arriving character's computer before they sit", async () => {
  const { computerFor } = await import("../../web/render.ts");
  const s = new Scene();
  s.update([ch({ desk: 1, outfit: { role: "designer", computer: "mac" } })]);
  const a = s.actors.get("k")!;
  expect(a.path.length).toBeGreaterThan(0);
  expect(computerFor(a, 1)).toBe("mac");
});

test("after a while idle or waiting, agents walk to the break room and come back to work", async () => {
  const { BREAK_AFTER_MS } = await import("../../web/scene.ts");
  const { breakSpots } = await import("../../web/layout.ts"); const BREAK_SPOTS = breakSpots(ROOM.decor);
  const s = new Scene();
  s.update([ch({ key: "a", desk: 0 }), ch({ key: "b", desk: 1 })]);
  s.step(10_000);
  s.update([ch({ key: "a", desk: 0, status: "idle" }), ch({ key: "b", desk: 1, status: "waiting" })]);
  s.step(BREAK_AFTER_MS - 100);
  expect(s.actors.get("a")!.onBreak).toBeNull();
  s.step(200);
  s.step(10_000);
  const a = s.actors.get("a")!, b = s.actors.get("b")!;
  for (const x of [a, b]) {
    expect(BREAK_SPOTS).toContainEqual(x.onBreak);
    expect([x.x, x.y]).toEqual([x.onBreak!.c, x.onBreak!.r]);
    expect(["break", "coffee", "lounge", "game"]).toContain(s.pose(x));
  }
  expect(a.onBreak).not.toEqual(b.onBreak);
  s.update([ch({ key: "a", desk: 0, status: "working" }), ch({ key: "b", desk: 1, status: "waiting" })]);
  s.step(10_000);
  expect([a.x, a.y]).toEqual([deskAt(ROOM, 0).seat.c, deskAt(ROOM, 0).seat.r]);
  expect(s.pose(a)).toBe("typing");
  expect(b.onBreak).not.toBeNull();
});

test("working agents never go on a break", async () => {
  const s = new Scene();
  s.update([ch({})]);
  s.step(120_000);
  expect(s.actors.get("k")!.onBreak).toBeNull();
});

test("a label is the chosen name, else the role, else the character's name, and only then the folder", async () => {
  const { shortLabel } = await import("../../web/render.ts");
  const s = new Scene(true);
  s.update([
    ch({ key: "a", name: "Ada", agent: "id3a:designer" }),
    ch({ key: "b", agent: "id3a:designer", desk: 1 }),
    ch({ key: "c", label: "claude · Documents", desk: 2 }),
    ch({ key: "d", source: "codex", label: "codex · Documents", desk: 3 }),
  ]);
  const at = (k: string) => s.actors.get(k)!;
  expect(shortLabel(at("a"), "Theo")).toBe("Ada");
  expect(shortLabel(at("b"), "Theo")).toBe("designer");
  expect(shortLabel(at("c"), "Theo")).toBe("Theo");
  expect(shortLabel(at("d"), "Theo")).toBe("codex: Theo");
  expect(shortLabel(at("c")), "a character without a name falls back to the folder").toBe("Documents");
});

test("an agent without a name or role gets one from the bank of its character; its own sheet keeps the folder", async () => {
  const { poolFor } = await import("../../web/assets.ts");
  const { characterName } = await import("../../web/render.ts");
  const { NameBook, NAMES } = await import("../../web/names.ts");
  const s = new Scene(true);
  s.update([ch({ key: "a", desk: 0 }), ch({ key: "b", desk: 1, outfit: { role: "x", character: "mine" } as any })]);
  const book = new NameBook();
  const assets = { pool: poolFor("deskmates"), deal: 2 } as any; // desk 0 + 2: dm2, the engineer
  expect(NAMES.f).toContain(characterName(assets, s.actors.get("a")!, book));
  expect(characterName(assets, s.actors.get("b")!, book)).toBeUndefined();
});

test("canvas labels name the tool for anything that is not Claude", async () => {
  const { shortLabel } = await import("../../web/render.ts");
  const s = new Scene(true);
  s.update([ch({ key: "a", agent: "id3a:designer" }), ch({ key: "b", source: "codex", label: "codex · atlas", desk: 1 }), ch({ key: "c", label: "claude-work · a-very-long-project-name", desk: 2 })]);
  expect(shortLabel(s.actors.get("a")!)).toBe("designer");
  expect(shortLabel(s.actors.get("b")!)).toBe("codex: atlas");
  expect(shortLabel(s.actors.get("c")!)).toBe("a-very-long-proje…");
});

test("laptops sit centred in front of the agent; towers stay at the side", async () => {
  const { computerSpot } = await import("../../web/render.ts");
  const k = deskAt(ROOM, 0);
  expect(computerSpot(k, "laptop").x).toBe(k.seat.c * 16);
  expect(computerSpot(k, "mac").x).toBe(k.seat.c * 16);
  expect(computerSpot(k, "pc").x).toBeGreaterThan(k.seat.c * 16);
  expect(computerSpot(k, "laptop").y).toBeGreaterThan(computerSpot(k, "pc").y);
});

// ---- social life: meetings, chats, handovers, greetings and pets ----

const settle = (s: Scene, ms: number) => { for (let t = 0; t < ms; t += 50) s.step(50); };
const at = (a: { x: number; y: number }) => [a.x, a.y];

test("idle agents sharing a folder meet at the table, facing their spot; the others go to the machines", async () => {
  const { BREAK_AFTER_MS } = await import("../../web/scene.ts");
  const { breakSpots } = await import("../../web/layout.ts"); const MEETING_SPOTS = ROOM.meeting, BREAK_SPOTS = breakSpots(ROOM.decor);
  const s = new Scene();
  const idle = [ch({ key: "a", desk: 0, cwd: "/p/apex", status: "idle" }), ch({ key: "b", desk: 1, cwd: "/p/apex", status: "idle" }), ch({ key: "c", desk: 2, cwd: "/p/solo", status: "idle" })];
  s.update(idle);
  settle(s, BREAK_AFTER_MS + 10_000);
  const [a, b, c] = ["a", "b", "c"].map((k) => s.actors.get(k)!);
  expect(at(a)).toEqual([MEETING_SPOTS[0].c, MEETING_SPOTS[0].r]);
  expect(at(b)).toEqual([MEETING_SPOTS[1].c, MEETING_SPOTS[1].r]);
  expect([s.pose(a), a.dir, b.dir]).toEqual(["meeting", "right", "left"]);
  expect(c.meeting).toBeNull();
  expect(BREAK_SPOTS).toContainEqual(c.onBreak);
  expect(at(c)).toEqual([c.onBreak!.c, c.onBreak!.r]);
  // the bubble alternates between "…" and the little chart
  const seen = new Set<string | null>();
  for (let i = 0; i < 6; i++) { seen.add(s.bubble(a)); s.step(500); }
  expect(seen).toEqual(new Set(["talk", "chart"]));
});

test("a shared folder with someone in another room, or someone leaving, is not a meeting", async () => {
  const { BREAK_AFTER_MS } = await import("../../web/scene.ts");
  const s = new Scene();
  s.update([ch({ key: "a", desk: 0, cwd: "/p", status: "idle" }), ch({ key: "b", desk: 9, cwd: "/p", status: "idle" })]);
  settle(s, BREAK_AFTER_MS + 10_000);
  expect(s.actors.get("a")!.meeting).toBeNull();
  expect(s.actors.get("a")!.onBreak).not.toBeNull();
});

test("when the meeting table is full the next one takes a break at the machines", async () => {
  const { BREAK_AFTER_MS } = await import("../../web/scene.ts");
  const MEETING_SPOTS = ROOM.meeting;
  const s = new Scene();
  const n = MEETING_SPOTS.length + 1;
  s.update(Array.from({ length: n }, (_, i) => ch({ key: `m${i}`, desk: i, cwd: "/p", status: "idle" })));
  settle(s, BREAK_AFTER_MS + 15_000);
  const all = [...s.actors.values()];
  expect(all.filter((a) => a.meeting).length).toBe(MEETING_SPOTS.length);
  expect(all.filter((a) => a.onBreak).length).toBe(1);
  expect(new Set(all.filter((a) => a.meeting).map((a) => `${a.x},${a.y}`)).size).toBe(MEETING_SPOTS.length);
});

test("back to work, a meeting ends and the agent returns to its desk", async () => {
  const { BREAK_AFTER_MS } = await import("../../web/scene.ts");
  const s = new Scene();
  s.update([ch({ key: "a", desk: 0, cwd: "/p", status: "idle" }), ch({ key: "b", desk: 1, cwd: "/p", status: "idle" })]);
  settle(s, BREAK_AFTER_MS + 10_000);
  expect(s.actors.get("a")!.meeting).not.toBeNull();
  s.update([ch({ key: "a", desk: 0, cwd: "/p", status: "working" }), ch({ key: "b", desk: 1, cwd: "/p", status: "idle" })]);
  settle(s, 10_000);
  const a = s.actors.get("a")!;
  expect(a.meeting).toBeNull();
  expect(at(a)).toEqual([deskAt(ROOM, 0).seat.c, deskAt(ROOM, 0).seat.r]);
  expect([s.pose(a), a.dir, s.bubble(a)]).toEqual(["typing", "down", null]);
});

test("two agents at the vending machines face each other and take turns talking", async () => {
  const { BREAK_AFTER_MS, TALK_MS } = await import("../../web/scene.ts");
  const s = new Scene();
  // a break room of two machine spots side by side, so both go for a drink
  s.setDecor([{ src: "breakroom/SODA.png", c: 1, r: 2, blocks: true, role: "machine",
    spots: [{ c: 1, r: 3, face: "up", act: "drink" }, { c: 2, r: 3, face: "up", act: "drink" }] }]);
  s.update([ch({ key: "a", desk: 0, status: "idle" }), ch({ key: "b", desk: 1, status: "idle" })]);
  settle(s, BREAK_AFTER_MS + 10_000);
  const a = s.actors.get("a")!, b = s.actors.get("b")!;
  expect([a.dir, b.dir]).toEqual(["right", "left"]);
  const turns: string[] = [];
  for (let i = 0; i < 4; i++) {
    turns.push(`${s.bubble(a) ?? "-"}/${s.bubble(b) ?? "-"}`);
    s.step(TALK_MS);
  }
  expect(new Set(turns)).toEqual(new Set(["talk/-", "-/talk"]));
  // someone alone at the machines just looks at them
  s.update([ch({ key: "a", desk: 0, status: "idle" })]);
  settle(s, 10_000);
  expect([a.dir, s.bubble(a)]).toEqual(["up", null]);
});

test("the ? of a waiting agent wins over any other bubble", async () => {
  const { BREAK_AFTER_MS } = await import("../../web/scene.ts");
  const s = new Scene();
  s.update([ch({ key: "a", desk: 0, cwd: "/p", status: "waiting" }), ch({ key: "b", desk: 1, cwd: "/p", status: "idle" })]);
  settle(s, BREAK_AFTER_MS + 10_000);
  const a = s.actors.get("a")!;
  expect(a.meeting).not.toBeNull();
  for (let i = 0; i < 6; i++) { expect(s.bubble(a)).toBe("ask"); s.step(500); }
});

test("agents walk around other people's chairs, not across them", () => {
  // the subagent sits bottom left and its parent top right; the row of chairs is as short a way as the aisle
  const s = new Scene();
  const parent = ch({ key: "p", desk: 3 });
  s.update([parent, ch({ key: "sub", parent: "p", desk: 4 })]);
  settle(s, 15_000);
  s.update([parent, ch({ key: "sub", parent: "p", desk: null, status: "leaving" })]);
  const sub = s.actors.get("sub")!;
  const own = deskAt(ROOM, 4).seat;
  const seats = Array.from({ length: 8 }, (_, i) => deskAt(ROOM, i).seat).filter((t) => !(t.c === own.c && t.r === own.r));
  for (let i = 0; i < 1_000 && s.actors.has("sub"); i++) {
    s.step(16);
    for (const c of [Math.floor(sub.x), Math.ceil(sub.x)]) for (const r of [Math.floor(sub.y), Math.ceil(sub.y)])
      expect(seats.some((t) => t.c === c && t.r === r), `on someone's chair at ${c},${r}`).toBe(false);
  }
  expect(s.actors.has("sub"), "it delivered and walked out").toBe(false);
});

test("a finished subagent hands its work to the parent, then walks out", async () => {
  const { HANDOVER_MS } = await import("../../web/scene.ts");
  const s = new Scene();
  const parent = ch({ key: "p", desk: 0 });
  s.update([parent, ch({ key: "sub", parent: "p", desk: 1 })]);
  settle(s, 10_000);
  s.update([parent, ch({ key: "sub", parent: "p", desk: null, status: "leaving" })]);
  const sub = s.actors.get("sub")!;
  const seat = deskAt(ROOM, 0).seat;
  expect(sub.handover?.to).toEqual({ c: seat.c - 1, r: seat.r });
  settle(s, 1_600); // seven tiles at five tiles a second: around the parent's chair, not across it
  expect(at(sub)).toEqual([seat.c - 1, seat.r]);
  expect([s.pose(sub), s.bubble(sub), sub.dir]).toEqual(["handover", "doc", "right"]);
  settle(s, HANDOVER_MS);
  expect(sub.handover).toBeNull();
  expect(s.pose(sub)).toBe("walk");
  settle(s, 10_000);
  expect(s.actors.has("sub")).toBe(false);
});

test("a subagent whose parent is gone leaves straight away", () => {
  const s = new Scene();
  s.update([ch({ key: "sub", parent: "nobody", desk: 1 })]);
  settle(s, 10_000);
  s.update([ch({ key: "sub", parent: "nobody", desk: null, status: "leaving" })]);
  expect(s.actors.get("sub")!.handover).toBeNull();
  settle(s, 10_000);
  expect(s.actors.size).toBe(0);
});

test("two agents walking past each other wave, once per pair until the cooldown passes", async () => {
  const { GREET_COOLDOWN_MS, WAVE_MS } = await import("../../web/scene.ts");
  const s = new Scene();
  s.update([ch({ key: "a", desk: 0 }), ch({ key: "b", desk: 3 })]);
  s.step(50); // both come in through the door side by side
  const a = s.actors.get("a")!, b = s.actors.get("b")!;
  expect([s.bubble(a), s.bubble(b)]).toEqual(["wave", "wave"]);
  settle(s, WAVE_MS + 5_000);
  expect(s.bubble(a)).toBeNull();
  // they swap desks and cross in the aisle soon after: no second wave
  const cross = (da: number, db: number) => {
    s.update([ch({ key: "a", desk: da }), ch({ key: "b", desk: db })]);
    let both = false, any = false;
    for (let i = 0; i < 80; i++) { s.step(50); any ||= s.bubble(a) === "wave" || s.bubble(b) === "wave"; both ||= s.bubble(a) === "wave" && s.bubble(b) === "wave"; }
    return { any, both };
  };
  expect(cross(3, 0).any).toBe(false);
  // after the cooldown, crossing again is worth a wave
  settle(s, GREET_COOLDOWN_MS);
  expect(cross(0, 3).both).toBe(true);
});

test("two pets per open room: each pair moves in with its room, and they all roam every open room, only on walkable tiles", async () => {
  const { walkable, ROOM } = await import("../../web/layout.ts");
  const g = walkable(ROOM);
  const s = new Scene();
  expect(s.pets.map((p) => [p.name, p.room])).toEqual([["claudio", 0], ["gitcat", 0]]);
  s.setRooms(3);
  expect(s.pets.map((p) => [p.name, p.room])).toEqual([["claudio", 0], ["gitcat", 0], ["pascal", 1], ["biscuit", 1], ["nova", 2], ["pip", 2]]);
  const tiles = new Set<string>(), rooms = new Map<string, Set<number>>();
  for (let i = 0; i < 30_000; i++) {
    s.step(50);
    for (const p of s.pets) {
      expect(g[Math.floor(p.y)][Math.floor(p.x)] && g[Math.ceil(p.y)][Math.ceil(p.x)]).toBe(true);
      tiles.add(`${p.room}:${Math.round(p.x)},${Math.round(p.y)}`);
      (rooms.get(p.name) ?? rooms.set(p.name, new Set()).get(p.name)!).add(p.room);
    }
  }
  expect(tiles.size).toBeGreaterThan(6); // they wander
  for (const name of PET_NAMES) expect(rooms.get(name)!.size, name).toBe(3); // and visit every room
  // back to one room: the first two stay (moved into it), the others walk out the door and are gone
  s.setRooms(1);
  expect(s.pets.filter((p) => !p.leaving).map((p) => [p.name, p.room])).toEqual([["claudio", 0], ["gitcat", 0]]);
  const out = s.pets.filter((p) => p.leaving);
  for (let i = 0; i < 400 && s.pets.length > 2; i++) {
    s.step(50);
    for (const p of out) if (s.pets.includes(p)) expect(p.owner ?? p.play ?? p.travel).toBeNull();
  }
  expect(s.pets.map((p) => p.name)).toEqual(["claudio", "gitcat"]);
});

test("with every pet in one room, they play tag in pairs and never overlap", () => {
  const s = new Scene();
  s.setPets("all");
  expect(s.pets.map((p) => p.name)).toEqual(PET_NAMES);
  let games = 0, both = 0;
  for (let i = 0; i < 20_000; i++) {
    s.step(50);
    const playing = s.pets.filter((p) => p.play);
    for (const p of playing) {
      expect(p.play!.with.play?.with, `${p.name} plays alone`).toBe(p);
      expect(p.play!.chasing).not.toBe(p.play!.with.play!.chasing);
    }
    games += playing.length ? 1 : 0;
    if (playing.length >= 4) both++;
    for (const [k, a] of s.pets.entries()) for (const b of s.pets.slice(k + 1))
      expect(Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1, `step ${i}: ${a.name} ${a.x},${a.y} and ${b.name} ${b.x},${b.y}`).toBe(false);
  }
  expect(games).toBeGreaterThan(0);
  expect(both).toBeGreaterThan(0); // two games at once
});

test("two pets in the same room play tag now and then: whoever is it chases, a catch swaps roles", () => {
  const s = new Scene();
  let games = 0, swaps = 0, wasChasing: boolean | null = null;
  for (let i = 0; i < 12_000; i++) {
    s.step(50);
    const [a, b] = s.pets;
    if (a.play) {
      expect(b.play?.with).toBe(a);
      expect(a.play.chasing).not.toBe(b.play!.chasing);
      if (wasChasing === null) games++;
      else if (wasChasing !== a.play.chasing) swaps++;
      wasChasing = a.play.chasing;
    } else wasChasing = null;
  }
  expect(games).toBeGreaterThan(1);
  expect(swaps).toBeGreaterThan(0);
});

test("a pet never keeps the same agent company as another pet: one pet per agent", () => {
  for (const pets of ["auto", "all"] as const) {
    const s = new Scene();
    s.setPets(pets);
    s.update([ch({ key: "e", desk: 5 }), ch({ key: "f", desk: 1 })]);
    settle(s, 10_000);
    s.update([ch({ key: "e", desk: 5, status: "idle" }), ch({ key: "f", desk: 1, status: "sleeping" })]);
    settle(s, 5_000);
    expect(s.pets.filter((p) => p.owner === "e").length, pets).toBe(1);
    expect(s.pets.filter((p) => p.owner === "f").length, pets).toBe(1);
    expect(s.pets.filter((p) => p.owner).length, pets).toBe(2);
  }
});

test("pets wander the same way every run", () => {
  const run = () => { const s = new Scene(); s.setRooms(2); settle(s, 60_000); return s.pets.map((p) => [p.room, p.x, p.y]); };
  expect(run()).toEqual(run());
});

test("a pet goes to sit next to an idle agent's seat, and leaves when the agent works again", async () => {
  const { walkable, ROOM } = await import("../../web/layout.ts");
  const s = new Scene();
  s.update([ch({ key: "a", desk: 0 }), ch({ key: "e", desk: 5 })]);
  settle(s, 10_000);
  s.update([ch({ key: "a", desk: 0 }), ch({ key: "e", desk: 5, status: "idle" })]);
  settle(s, 12_000); // still before the break
  const p = s.pets[0], seat = deskAt(ROOM, 5).seat;
  expect(p.owner).toBe("e");
  expect(p.path.length).toBe(0);
  expect(Math.abs(p.x - seat.c) + Math.abs(p.y - seat.r)).toBeLessThanOrEqual(2);
  expect(walkable(ROOM)[p.y][p.x]).toBe(true);
  expect([p.x, p.y]).not.toEqual([seat.c, seat.r]);
  s.update([ch({ key: "a", desk: 0 }), ch({ key: "e", desk: 5 })]);
  s.step(50);
  expect(p.owner).toBeNull();
});

test("a pet keeps a sleeping agent company, and snaps there on static pages", () => {
  const s = new Scene(true);
  s.update([ch({ key: "d", desk: 4, status: "sleeping" })]);
  s.step(0);
  const p = s.pets[0], seat = deskAt(ROOM, 4).seat;
  expect(p.owner).toBe("d");
  expect([p.x, p.y]).toEqual([seat.c + 2, seat.r]);
});

test("nobody meets alone: an agent with only its own subagent around goes to the machines", async () => {
  const { BREAK_AFTER_MS } = await import("../../web/scene.ts");
  const s = new Scene();
  s.update([ch({ key: "p", desk: 0, cwd: "/w/x" }), ch({ key: "sub", desk: 1, cwd: "/w/x", parent: "p" })]);
  s.step(10_000);
  s.update([ch({ key: "p", desk: 0, cwd: "/w/x", status: "idle" }), ch({ key: "sub", desk: 1, cwd: "/w/x", parent: "p" })]);
  s.step(BREAK_AFTER_MS + 100); s.step(10_000);
  expect(s.actors.get("p")!.meeting).toBeNull();
  expect(s.actors.get("p")!.onBreak).not.toBeNull();
});

test("a colleague still working does not pull an idle agent into a meeting", async () => {
  const { BREAK_AFTER_MS } = await import("../../web/scene.ts");
  const s = new Scene();
  s.update([ch({ key: "a", desk: 0, cwd: "/w/x" }), ch({ key: "b", desk: 1, cwd: "/w/x" })]);
  s.step(10_000);
  s.update([ch({ key: "a", desk: 0, cwd: "/w/x", status: "idle" }), ch({ key: "b", desk: 1, cwd: "/w/x" })]);
  s.step(BREAK_AFTER_MS + 100); s.step(10_000);
  expect(s.actors.get("a")!.meeting).toBeNull();
});

test("pets can be switched off, narrowed to one pet, or all brought in at once", async () => {
  const s = new Scene(true);
  expect(s.pets.map((p) => p.name)).toEqual(["claudio", "gitcat"]);
  s.setRooms(2);
  expect(s.pets.map((p) => p.name)).toEqual(["claudio", "gitcat", "pascal", "biscuit"]);
  s.setPets("nova");
  expect(s.pets.map((p) => [p.name, p.room])).toEqual([["nova", 1]]); // the pair it belongs to lives in the second room
  s.setPets("all");
  expect(s.pets.map((p) => [p.name, p.room])).toEqual([["claudio", 0], ["gitcat", 0], ["pascal", 1], ["biscuit", 1], ["nova", 1], ["pip", 1]]);
  s.setPets("off");
  expect(s.pets).toEqual([]);
  s.setRooms(3);
  expect(s.pets).toEqual([]);
  s.setPets("bogus" as any);
  expect(s.petChoice).toBe("auto");
  expect(s.pets.map((p) => p.name)).toEqual(PET_NAMES);
  // on a static page a pet whose room closes is gone at once
  s.setRooms(1);
  expect(s.pets.map((p) => p.name)).toEqual(["claudio", "gitcat"]);
  expect(Scene.petsFor("auto", 9)).toEqual(PET_NAMES);
});

test("pets and agents never step on blocked tiles, and pets never on a chair, even while their targets keep changing", async () => {
  const { walkable, ROOM } = await import("../../web/layout.ts");
  const g = walkable(ROOM);
  const ok = (x: number, y: number) => [Math.floor(x), Math.ceil(x)].every((c) => [Math.floor(y), Math.ceil(y)].every((r) => g[r]?.[c]));
  const seats = new Set(Array.from({ length: 8 }, (_, i) => `${deskAt(ROOM, i).seat.c},${deskAt(ROOM, i).seat.r}`));
  const s = new Scene();
  s.setRooms(2);
  const statuses = ["working", "idle", "sleeping", "waiting"] as const;
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let step = 0; step < 4000; step++) {
    if (step % 37 === 0) s.update(Array.from({ length: 6 }, (_, i) => ch({ key: `a${i}`, desk: i, cwd: `/w/${i % 2}`, status: statuses[Math.floor(rnd() * 4)] })));
    s.step(50 + Math.floor(rnd() * 200));
    for (const p of s.pets) {
      expect(ok(p.x, p.y), `pet at ${p.x},${p.y} step ${step}`).toBe(true);
      for (const c of [Math.floor(p.x), Math.ceil(p.x)]) for (const r of [Math.floor(p.y), Math.ceil(p.y)])
        expect(seats.has(`${c},${r}`), `${p.name} on the chair at ${c},${r} step ${step}`).toBe(false);
    }
    for (const a of s.actors.values()) if (!a.leaving) expect(ok(a.x, a.y), `${a.key} at ${a.x},${a.y} step ${step}`).toBe(true);
  }
});

test("agents come in and go out straight through the door, never walking along the bottom wall", async () => {
  const { bottomOf } = await import("../../web/layout.ts"); const BOTTOM = bottomOf(ROOM);
  const s = new Scene();
  for (let k = 0; k < 16; k++) {
    s.update([ch({ key: `a${k}`, desk: k % 8 })]);
    for (let i = 0; i < 200; i++) {
      s.step(50);
      for (const a of s.actors.values()) if (a.y > BOTTOM - 2) expect(a.x, `${a.key} at ${a.x},${a.y}`).toBe(DOOR.c);
    }
    s.update([]);
    for (let i = 0; i < 200; i++) {
      s.step(50);
      for (const a of s.actors.values()) if (a.y > BOTTOM - 2) expect(a.x, `${a.key} leaving at ${a.x},${a.y}`).toBe(DOOR.c);
    }
  }
});

test("pets bump into each other instead of walking through: they never overlap", () => {
  for (const [rooms, pets] of [[1, "auto"], [2, "auto"], [1, "all"], [3, "all"]] as const) {
    const s = new Scene();
    s.setPets(pets);
    s.setRooms(rooms);
    const statuses = ["working", "idle", "sleeping"] as const;
    let bumps = 0;
    for (let step = 0; step < 20_000; step++) {
      if (step % 300 === 0) s.update(Array.from({ length: 5 }, (_, i) => ch({ key: `a${i}`, desk: i, status: statuses[(i + step / 300) % 3] })));
      s.step(50);
      if (s.pets.some((p) => p.waitUntil)) bumps++;
      for (const [k, a] of s.pets.entries()) for (const b of s.pets.slice(k + 1))
        if (a.room === b.room) expect(Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1, `${pets} rooms ${rooms} step ${step}: ${a.name} ${a.x},${a.y} and ${b.name} ${b.x},${b.y}`).toBe(false);
    }
    expect(bumps, `${pets} rooms ${rooms}`).toBeGreaterThan(0);
  }
}, 30_000); // four scenes of pets walking: about 2 s here, past the 5 s default on a busy CI runner

test("an agent done for now shows a check at its desk; working or asleep it does not", () => {
  const s = new Scene(true);
  s.update([ch({ status: "idle" })]);
  const a = s.actors.get("k")!;
  expect(s.bubble(a)).toBe("done");
  s.update([ch({ status: "working" })]);
  expect(s.bubble(a)).toBeNull();
  s.update([ch({ status: "sleeping" })]);
  expect(s.bubble(a)).toBeNull();
});

for (const [act, pose, dir] of [["sofa", "lounge", "up"], ["game", "game", "up"], ["coffee", "coffee", "down"]] as const) {
  test(`a break at a ${act} spot: the agent ${pose === "coffee" ? "stands with a coffee" : "sits"} facing ${dir}`, async () => {
    const { BREAK_AFTER_MS } = await import("../../web/scene.ts");
    const s = new Scene();
    s.setDecor([{ src: "x.png", c: 19, r: 3, w: 2, blocks: false, spots: [{ c: 19, r: 3, face: dir, act }] }]);
    s.update([ch({ key: "a", desk: 0, status: "idle" })]);
    settle(s, BREAK_AFTER_MS + 10_000);
    const a = s.actors.get("a")!;
    expect(at(a)).toEqual([19, 3]);
    expect([s.pose(a), a.dir, s.bubble(a)]).toEqual([pose, dir, null]);
  });
}

test("a sofa seat is a seat: nobody walks across it on the way somewhere else", async () => {
  const { BREAK_AFTER_MS } = await import("../../web/scene.ts");
  const s = new Scene();
  // the only way from the right of the sofa row to the left of it would be across the sofa, were it open
  s.setDecor([{ src: "x.png", c: 19, r: 3, w: 2, blocks: false, spots: [{ c: 19, r: 3, face: "up", act: "sofa" }, { c: 20, r: 3, face: "up", act: "game" }] }]);
  s.update([ch({ key: "a", desk: 3, status: "working" })]);
  settle(s, 10_000);
  s.update([ch({ key: "a", desk: 3, status: "idle" })]);
  const a = s.actors.get("a")!;
  for (let t = 0; t < BREAK_AFTER_MS + 10_000 && !(a.onBreak && !a.path.length); t += 50) {
    s.step(50);
    const here = { c: Math.round(a.x), r: Math.round(a.y) };
    if (a.onBreak && (here.c !== a.onBreak.c || here.r !== a.onBreak.r)) expect([19, 20].includes(here.c) && here.r === 3, `crossed a sofa seat at ${here.c},${here.r}`).toBe(false);
  }
  expect(a.onBreak).not.toBeNull();
});

test("agents having a drink at opposite ends of the room do not chat", async () => {
  const { BREAK_AFTER_MS, TALK_MS } = await import("../../web/scene.ts");
  const s = new Scene();
  s.setDecor([{ src: "a.png", c: 1, r: 2, blocks: true, role: "machine", spots: [{ c: 1, r: 3, face: "up", act: "drink" }] },
    { src: "b.png", c: 17, r: 2, blocks: true, role: "machine", spots: [{ c: 17, r: 3, face: "up", act: "drink" }] }]);
  s.update([ch({ key: "a", desk: 0, status: "idle" }), ch({ key: "b", desk: 3, status: "idle" })]);
  settle(s, BREAK_AFTER_MS + 15_000);
  const [a, b] = ["a", "b"].map((k) => s.actors.get(k)!);
  expect(a.onBreak && b.onBreak).toBeTruthy();
  for (let i = 0; i < 4; i++) { expect([s.bubble(a), s.bubble(b)]).toEqual([null, null]); s.step(TALK_MS); }
});

test("two waiting agents of different PCs meet at a break spot after a few seconds", () => {
  const s = new Scene();
  s.update([ch({ key: "a", owner: "aaaaaaaa", status: "waiting", desk: 0 }), ch({ key: "b", owner: "bbbbbbbb", status: "waiting", desk: 4 })]);
  s.step(10_000); // walk in and sit
  expect(s.actors.get("a")!.onBreak).toBeNull();
  s.step(VISIT_AFTER_MS + 100);
  expect(s.actors.get("a")!.onBreak).not.toBeNull();
  expect(s.actors.get("b")!.onBreak).not.toBeNull();
});

test("one PC waiting alone keeps today's break delay", () => {
  const s = new Scene();
  s.update([ch({ key: "a", owner: "aaaaaaaa", status: "waiting", desk: 0 }), ch({ key: "b", owner: "aaaaaaaa", status: "waiting", desk: 1 })]);
  s.step(10_000);
  s.step(VISIT_AFTER_MS + 100);
  expect(s.actors.get("a")!.onBreak).toBeNull();
  s.step(BREAK_AFTER_MS);
  expect(s.actors.get("a")!.onBreak).not.toBeNull();
});

test("agents without an owner are untouched by the visiting rule", () => {
  const s = new Scene();
  s.update([ch({ key: "a", status: "waiting", desk: 0 }), ch({ key: "b", status: "waiting", desk: 4 })]);
  s.step(10_000); s.step(VISIT_AFTER_MS + 100);
  expect(s.actors.get("a")!.onBreak).toBeNull();
});

test("back to the desk when the permission arrives", () => {
  const s = new Scene();
  s.update([ch({ key: "a", owner: "aaaaaaaa", status: "waiting", desk: 0 }), ch({ key: "b", owner: "bbbbbbbb", status: "waiting", desk: 4 })]);
  s.step(10_000); s.step(VISIT_AFTER_MS + 100);
  s.update([ch({ key: "a", owner: "aaaaaaaa", status: "working", desk: 0 }), ch({ key: "b", owner: "bbbbbbbb", status: "waiting", desk: 4 })]);
  expect(s.actors.get("a")!.onBreak).toBeNull();
  s.step(10_000);
  expect([s.actors.get("a")!.x, s.actors.get("a")!.y]).toEqual([deskAt(ROOM, 0).seat.c, deskAt(ROOM, 0).seat.r]);
});

const pairAtMachines = (ownerA?: string, ownerB?: string) => {
  const s = new Scene();
  s.update([ch({ key: "a", owner: ownerA, status: "waiting", desk: 0 }), ch({ key: "b", owner: ownerB, status: "waiting", desk: 4 })]);
  s.step(10_000); s.step(VISIT_AFTER_MS + 100);
  s.step(10_000); // walk to the break spots
  return s;
};

test("two visitors of different PCs end up within two tiles of each other", () => {
  const s = pairAtMachines("aaaaaaaa", "bbbbbbbb");
  const [a, b] = [s.actors.get("a")!, s.actors.get("b")!];
  expect(a.onBreak && b.onBreak).toBeTruthy();
  expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBeLessThanOrEqual(2);
});

test("visitors of different PCs chat: at least one shows talk over a few turns", () => {
  const s = pairAtMachines("aaaaaaaa", "bbbbbbbb");
  const seen = new Set<string | null>();
  for (let i = 0; i < 6; i++) { for (const k of ["a", "b"]) seen.add(s.bubble(s.actors.get(k)!)); s.step(TALK_MS); }
  expect(seen.has("talk")).toBe(true);
});

test("a waiting agent without an owner next to a drinker keeps its question mark", () => {
  const s = new Scene();
  s.update([ch({ key: "a", status: "waiting", desk: 0 }), ch({ key: "b", status: "idle", desk: 4 })]);
  s.step(10_000);
  const a = s.actors.get("a")!, b = s.actors.get("b")!;
  a.onBreak = { c: 1, r: 3, face: "up", act: "drink" }; a.x = 1; a.y = 3; a.path = [];
  b.onBreak = { c: 1, r: 4, face: "up", act: "drink" }; b.x = 1; b.y = 4; b.path = [];
  for (let i = 0; i < 6; i++) { expect(s.bubble(a)).toBe("ask"); s.step(TALK_MS); }
});

test("setFloor moves the office to another floor and re-seats everyone", () => {
  const s = new Scene(true);
  s.update([ch({ desk: 0 })]);
  const big: Floor = { ...ROOM, cols: 48, rows: 28, desksPerRoom: 24, seats: Array.from({ length: 24 }, (_, i) => ({ c: 3 + (i % 12) * 4, r: i < 12 ? 5 : 19 })), door: { c: 23, r: 27 }, doorGap: [23, 24], decor: [], meeting: [] };
  s.setFloor(big);
  const a = s.actors.get("k")!;
  expect([a.x, a.y]).toEqual([deskAt(big, 0).seat.c, deskAt(big, 0).seat.r]);
});

const BIG: Floor = { ...ROOM, cols: 48, rows: 28, desksPerRoom: 24, seats: Array.from({ length: 24 }, (_, i) => ({ c: 3 + (i % 12) * 4, r: i < 12 ? 5 : 19 })), door: { c: 23, r: 27 }, doorGap: [23, 24], decor: [], meeting: [] };
const onBreakIn = (s: Scene) => {
  s.update([ch({ key: "a", desk: 0 })]);
  s.step(10_000);
  s.update([ch({ key: "a", desk: 0, status: "idle" })]);
  s.step(BREAK_AFTER_MS + 100);
  s.step(10_000);
  const a = s.actors.get("a")!;
  expect(a.onBreak).not.toBeNull();
  return a;
};

test("setFloor with its furniture takes an agent off its break and walks it to its seat on the new floor", () => {
  const s = new Scene();
  const a = onBreakIn(s);
  s.update([ch({ key: "a", desk: 0, status: "idle" }), ch({ key: "b", desk: 1 })]);
  s.step(100); // b is still walking in
  const b = s.actors.get("b")!;
  expect(b.path.length).toBeGreaterThan(0);
  s.setFloor(BIG, []);
  for (const [x, desk] of [[a, 0], [b, 1]] as const) {
    expect(x.onBreak).toBeNull();
    expect(x.meeting).toBeNull();
    const seat = deskAt(BIG, desk).seat;
    expect(x.path.at(-1)).toEqual(seat);
  }
  s.step(30_000);
  expect([a.x, a.y]).toEqual([deskAt(BIG, 0).seat.c, deskAt(BIG, 0).seat.r]);
  expect([b.x, b.y]).toEqual([deskAt(BIG, 1).seat.c, deskAt(BIG, 1).seat.r]);
});

test("setFloor ends a meeting under way and walks each agent to its seat on the new floor", () => {
  const s = new Scene();
  s.update([ch({ key: "a", desk: 0, cwd: "/p", status: "idle" }), ch({ key: "b", desk: 1, cwd: "/p", status: "idle" })]);
  settle(s, BREAK_AFTER_MS + 10_000);
  const [a, b] = ["a", "b"].map((k) => s.actors.get(k)!);
  expect(a.meeting).not.toBeNull();
  expect(b.meeting).not.toBeNull();
  s.setFloor(BIG, []);
  for (const [x, desk] of [[a, 0], [b, 1]] as const) {
    expect(x.meeting).toBeNull();
    expect(x.path.at(-1)).toEqual(deskAt(BIG, desk).seat);
  }
  settle(s, 30_000);
  expect([a.x, a.y]).toEqual([deskAt(BIG, 0).seat.c, deskAt(BIG, 0).seat.r]);
  expect([b.x, b.y]).toEqual([deskAt(BIG, 1).seat.c, deskAt(BIG, 1).seat.r]);
  expect([a.meeting, b.meeting]).toEqual([null, null]);
});

test("setFloor with furniture on an agent's tile, or walling it in, starts it again at the door", () => {
  for (const around of [[[0, 0]], [[1, 0], [-1, 0], [0, 1], [0, -1]]]) {
    const s = new Scene();
    const a = onBreakIn(s);
    const decor = around.map(([dc, dr]) => ({ src: "x.png", c: a.x + dc, r: a.y + dr, blocks: true }));
    s.setFloor(BIG, decor);
    expect([a.x, a.y]).toEqual([BIG.door.c, BIG.door.r]);
    expect(a.path.at(-1)).toEqual(deskAt(BIG, 0).seat);
    s.step(30_000);
    expect([a.x, a.y]).toEqual([deskAt(BIG, 0).seat.c, deskAt(BIG, 0).seat.r]);
  }
});

test("the page opens as many rooms as its own floor needs for the desks in use", () => {
  expect(roomsNeeded([ch({ desk: 20 })], ROOM.desksPerRoom)).toBe(3);
  expect(roomsNeeded([ch({ desk: 20 })], 24)).toBe(1);
  expect(roomsNeeded([], ROOM.desksPerRoom)).toBe(1);
  expect(roomsNeeded([ch({ desk: null, status: "leaving" }), ch({ key: "b", desk: 7 })], ROOM.desksPerRoom)).toBe(1);
  expect(roomsNeeded([ch({ desk: 8 })], ROOM.desksPerRoom)).toBe(2);
});

test("a session that has done nothing yet rests at its desk without the check of a finished job", () => {
  const s = new Scene(true);
  s.update([ch({ status: "idle", workedMs: 0 })]);
  expect(s.bubble(s.actors.get("k")!)).not.toBe("done");
  s.update([ch({ status: "idle", workedMs: 90_000 })]);
  expect(s.bubble(s.actors.get("k")!)).toBe("done");
});
