import type { ViewCharacter } from "../src/server/server.ts";
import { ROOM, deskAt, walkable, bottomOf, breakSpots, SITTING, type Floor, type Tile, type Decor, type BreakSpot } from "./layout.ts";
import { findPath } from "./path.ts";
import { dirBetween, type Dir, type Pose } from "./anim.ts";

export const SPEED = 5; // tiles per second
/** idle or waiting this long, an agent walks over to the vending machines (or to a meeting) */
export const BREAK_AFTER_MS = 15_000;
/** waiting for permission this long, an agent of another PC goes to chat with another PC's waiting agent at a break spot */
export const VISIT_AFTER_MS = 3_000;
/** how long a subagent stands by its parent's seat handing over its work */
export const HANDOVER_MS = 1_500;
/** how long a wave between two passing agents lasts, and how often the same pair may wave again */
export const WAVE_MS = 1_000;
export const GREET_COOLDOWN_MS = 30_000;
/** how long each speaker holds the floor at the vending machines; meeting bubbles switch at the same pace */
export const TALK_MS = 1_500;
/** pets stroll slowly and trot when they head to an agent (tiles per second) */
export const PET_SPEED = 1.5;
export const PET_RUN = 3;
/**
 * The office pets, in the order they move in: Claudio and Gitcat come from Pixel Agents, the others are drawn from
 * them by scripts/draw-pets.py. `sheet` is under /assets/.
 */
export const PETS = [
  { id: "claudio", name: "Claudio", sheet: "pixel-agents/pets/claudio/pet.png" },
  { id: "gitcat", name: "Gitcat", sheet: "pixel-agents/pets/gitcat/pet.png" },
  { id: "pascal", name: "Pascal", sheet: "pets/pascal/pet.png" },
  { id: "biscuit", name: "Biscuit", sheet: "pets/biscuit/pet.png" },
  { id: "nova", name: "Nova", sheet: "pets/nova/pet.png" },
  { id: "pip", name: "Pip", sheet: "pets/pip/pet.png" },
] as const;
export const PET_NAMES: string[] = PETS.map((p) => p.id);
/** how many pets live in the office per open room by default */
export const PETS_PER_ROOM = 2;
/**
 * "auto": two pets per open room, in PETS order (one room: Claudio and Gitcat); "all": every pet; a pet name: only that
 * one; "off": no pets. They roam all the open rooms.
 */
export type PetChoice = "auto" | "all" | "off" | (typeof PETS)[number]["id"];
export const PET_CHOICES: PetChoice[] = ["auto", "all", ...PETS.map((p) => p.id), "off"];
/** chance that a pet done resting heads to another room (when there is one), or starts a game with a pet in its room */
export const PET_TRAVEL_CHANCE = 0.3;
export const PET_PLAY_CHANCE = 0.35;
/** how long a game of tag lasts, and how long before the same pets play again */
export const PET_PLAY_MS = 6_000;
export const PET_PLAY_COOLDOWN_MS = 20_000;
/** a pet that runs into another one stops and looks at it this long, then walks around it */
export const PET_BUMP_MS = 500;
/** a pet that cannot get past for this long gives up where it was going */
export const PET_GIVE_UP_MS = 4_000;

export type MeetingSpot = Floor["meeting"][number];
/** What floats over an agent's head, in priority order: the "?" always wins. */
export type Bubble = "ask" | "doc" | "wave" | "talk" | "chart" | "done";

export type Actor = {
  key: string;
  ch: ViewCharacter;
  room: number;
  x: number; y: number; // tile coordinates (float), feet on the tile
  path: Tile[];
  dir: Dir;
  leaving: boolean;
  /** scene clock (ms) when the current status began */
  statusSince: number;
  /** where it spends its break, and doing what */
  onBreak: BreakSpot | null;
  /** seat at the meeting table while meeting colleagues who work in the same folder */
  meeting: MeetingSpot | null;
  /** a finished subagent reporting to its parent before it walks out; `until` is set once it got there */
  handover: { to: Tile; parent: string; until: number | null } | null;
  /** scene clock until which the agent waves */
  waveUntil: number;
  /** which character it is: the desk it first sat at, so a full room shows every character of the set */
  deal: number;
};

export type Pet = {
  name: string;
  room: number;
  x: number; y: number;
  path: Tile[];
  dir: Dir;
  /** key of the agent it keeps company, and the tile it sits on next to that agent's seat */
  owner: string | null;
  sitAt: Tile | null;
  wandering: boolean;
  restUntil: number;
  /** the room it is walking to: it goes out the door and comes in through the other room's door */
  travel: number | null;
  /** a game of tag with another pet: who it plays with, whether it is "it", and when the game ends */
  play: { with: Pet; chasing: boolean; until: number } | null;
  /** scene clock before which it does not start another game */
  playAgainAt: number;
  /** when it bumped into another pet: it waits until then before walking around (0: not blocked) */
  waitUntil: number;
  /** since when it has been blocked by other pets (0: it is not) */
  blockedSince: number;
  /** its room closed (with two pets per room): it walks out the door and is gone */
  leaving: boolean;
  /** mulberry32 state, seeded by room so every run looks the same */
  rng: number;
};

const tileOf = (a: { x: number; y: number }): Tile => ({ c: Math.round(a.x), r: Math.round(a.y) });
const same = (a: Tile | null, b: Tile | null) => !!a && !!b && a.c === b.c && a.r === b.r;
/** The seats of a floor's desks. */
const seatsOf = (f: Floor) => Array.from({ length: f.desksPerRoom }, (_, i) => deskAt(f, i).seat);
/** FNV-1a of a key: where an agent starts looking for a break spot, and its team colour. */
export function seedOf(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

function rand(p: Pet): number {
  let t = (p.rng = (p.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Moves along the path by `budget` tiles, one grid step at a time, turning to face where it goes. */
function move(e: { x: number; y: number; path: Tile[]; dir: Dir }, budget: number) {
  while (budget > 0 && e.path.length) {
    const next = e.path[0];
    const dx = next.c - e.x, dy = next.r - e.y;
    const dist = Math.abs(dx) + Math.abs(dy);
    if (dist <= budget + 1e-9) { e.x = next.c; e.y = next.r; budget = Math.max(0, budget - dist); e.path.shift(); } // no float drift past a tile
    else if (dx !== 0) { e.x += Math.sign(dx) * Math.min(budget, Math.abs(dx)); budget = 0; } // one axis at a time
    else { e.y += Math.sign(dy) * budget; budget = 0; }
    if (dist > 0) e.dir = dirBetween({ c: e.x - dx, r: e.y - dy }, next);
  }
}

/** Keeps one actor per character and walks them between the door and their desk; also the office pets. */
export class Scene {
  actors = new Map<string, Actor>();
  pets: Pet[] = [];
  /** ms of animation time; advances only in step(), so tests control it */
  clock = 0;
  private snap: boolean;
  private rooms = 1;
  /** the floor every room is built on; see setFloor */
  private _floor: Floor = ROOM;
  get floor(): Floor { return this._floor; }
  private seats: Tile[] = seatsOf(this._floor);
  private isSeat(t: Tile) { return this.seats.some((s) => same(s, t)); }
  /** the furniture in place; the theme brings it */
  private decor: Decor[] = this._floor.decor;
  private grid = walkable(this._floor, this.decor);
  /** the break spots of the furniture in place */
  private spots: BreakSpot[] = breakSpots(this.decor);
  /** nobody walks across a chair (or a sofa seat): the walkable grid without them. Pets use it as is; agents open the seat they go to */
  private petGrid = this.withoutSeats(this.grid);
  private withoutSeats(g: boolean[][]) { return g.map((row, r) => row.map((ok, c) => ok && !this.seatLike({ c, r }))); }
  /** A desk chair or a sofa seat of a break spot. */
  private seatLike(t: Tile) { return this.isSeat(t) || this.spots.some((s) => SITTING.has(s.act) && same(s, t)); }
  /** last time (scene clock) each pair of agents waved at each other */
  private greeted = new Map<string, number>();
  /** The theme's furniture decides where agents can walk. */
  setDecor(decor: Decor[]) {
    this.decor = decor;
    this.grid = walkable(this._floor, decor);
    this.spots = breakSpots(decor);
    this.petGrid = this.withoutSeats(this.grid);
    // whoever is on the way somewhere finds a new way around the new furniture
    for (const a of this.actors.values()) if (a.path.length) this.reroute(a, a.path[a.path.length - 1]);
    for (const p of this.pets) {
      if (!p.path.length) continue;
      const goal = p.path[p.path.length - 1], head = p.path[0];
      // furniture landed on the tile it was stepping onto: it steps back first
      if (!this.petGrid[head.r]?.[head.c] && (p.x !== Math.round(p.x) || p.y !== Math.round(p.y))) {
        const back = this.covers(p).find((t) => !same(t, head));
        if (back) p.path = [back];
      }
      this.routePet(p, goal);
    }
  }
  /**
   * Moves the office to another floor with its furniture (the current one when `decor` is left out): every agent goes
   * back to its seat on the new floor (from where it stands when that tile is still floor, otherwise from the door, as
   * on a desk change) and the pets settle in again.
   */
  setFloor(f: Floor, decor: Decor[] = this.decor) {
    if (f === this._floor && decor === this.decor) return;
    this._floor = f;
    this.decor = decor;
    this.seats = seatsOf(f);
    this.grid = walkable(f, decor);
    this.spots = breakSpots(decor);
    this.petGrid = this.withoutSeats(this.grid);
    for (const a of this.actors.values()) {
      a.onBreak = null; a.meeting = null; a.handover = null; a.path = [];
      const here = tileOf(a), room = a.leaving || a.ch.desk === null ? a.room : deskAt(f, a.ch.desk).room;
      // a step under way ends on its tile; a tile that is no longer floor, or a desk in another room, starts at the door
      if (room !== a.room || !this.grid[here.r]?.[here.c]) { a.x = f.door.c; a.y = f.door.r; } else { a.x = here.c; a.y = here.r; }
      a.room = room;
      this.reroute(a, a.leaving || a.ch.desk === null ? f.door : deskAt(f, a.ch.desk).seat);
    }
    this.pets = [];
    this.syncPets();
  }
  /** Rooms currently open; pets roam all of them. */
  setRooms(n: number) { this.rooms = Math.max(1, n); this.syncPets(); }
  /** which pets live in the office (see setPets) */
  petChoice: PetChoice = "auto";
  /** Which pets live in the office. Changing it rebuilds them. */
  setPets(choice: PetChoice) {
    if (!PET_CHOICES.includes(choice)) choice = "auto";
    if (choice === this.petChoice) return;
    this.petChoice = choice;
    this.pets = [];
    this.syncPets();
  }
  constructor(snap = false) { this.snap = snap; this.syncPets(); }

  update(chars: ViewCharacter[]) {
    const seen = new Set<string>();
    for (const ch of chars) {
      seen.add(ch.key);
      let a = this.actors.get(ch.key);
      if (!a) {
        if (ch.desk === null) continue; // left before we ever saw it
        const room = deskAt(this._floor, ch.desk).room;
        const seat = deskAt(this._floor, ch.desk).seat;
        const start = this.snap ? seat : this._floor.door;
        a = { key: ch.key, ch, room, x: start.c, y: start.r, path: [], dir: "up", leaving: false, statusSince: this.clock, onBreak: null, meeting: null, handover: null, waveUntil: 0, deal: ch.desk };
        this.actors.set(ch.key, a);
        this.route(a, seat);
        continue;
      }
      const prevDesk = a.ch.desk;
      if (ch.status !== a.ch.status) a.statusSince = this.clock;
      a.ch = ch;
      if ((a.onBreak || a.meeting) && (ch.status === "working" || ch.status === "sleeping") && ch.desk !== null) {
        a.onBreak = null; a.meeting = null;
        this.route(a, deskAt(this._floor, ch.desk).seat);
      }
      if (ch.desk === null && !a.leaving) this.leave(a);
      else if (ch.desk !== null && (ch.desk !== prevDesk || a.leaving)) {
        a.leaving = false; a.handover = null; a.onBreak = null; a.meeting = null;
        if (deskAt(this._floor, ch.desk).room !== a.room) { a.room = deskAt(this._floor, ch.desk).room; a.x = this._floor.door.c; a.y = this._floor.door.r; }
        this.route(a, deskAt(this._floor, ch.desk).seat);
      }
    }
    for (const a of this.actors.values()) if (!seen.has(a.key) && !a.leaving) this.leave(a);
    this.syncPets();
  }

  step(dtMs: number) {
    this.clock += dtMs;
    this.syncPets();
    this.takeBreaks();
    for (const a of [...this.actors.values()]) {
      move(a, (SPEED * dtMs) / 1000);
      if (a.handover && !a.path.length) {
        if (a.handover.until === null) {
          a.handover.until = this.clock + HANDOVER_MS;
          const p = this.actors.get(a.handover.parent);
          if (p && p.ch.desk !== null) a.dir = dirBetween(a.handover.to, deskAt(this._floor, p.ch.desk).seat);
        } else if (this.clock >= a.handover.until) {
          a.handover = null;
          this.route(a, this._floor.door);
        }
        continue;
      }
      if (!a.path.length && !a.leaving) a.dir = this.restDir(a);
      if (a.leaving && !a.path.length) this.actors.delete(a.key);
    }
    this.greet();
    this.stepPets(dtMs);
  }

  pose(a: Actor): Pose {
    if (a.handover && a.handover.until !== null) return "handover";
    if (a.path.length || a.leaving) return "walk";
    if (a.meeting) return "meeting";
    if (a.onBreak) return a.onBreak.act === "sofa" ? "lounge" : a.onBreak.act === "game" ? "game" : a.onBreak.act === "coffee" ? "coffee" : "break";
    switch (a.ch.status) {
      case "working": return a.ch.activity;
      case "waiting": return "waiting";
      case "sleeping": return "sleeping";
      default: return "idle";
    }
  }

  /** The bubble over an agent's head, if any. The "?" of an agent waiting for you always wins. */
  bubble(a: Actor): Bubble | null {
    const group = a.onBreak && !a.meeting ? this.chatters(a) : [];
    // only a visitor chatting with an agent of another PC talks; any other waiting agent keeps asking
    const visiting = !!a.ch.owner && !a.path.length && group.some((o) => !!o.ch.owner && o.ch.owner !== a.ch.owner);
    if (a.ch.status === "waiting" && !a.leaving && !visiting) return "ask";
    if (a.handover && a.handover.until !== null) return "doc";
    if (a.waveUntil > this.clock) return "wave";
    if (a.path.length) return null;
    if (a.meeting) {
      // everyone at the table talks, out of step with each other: "…" and then a little chart
      const i = this._floor.meeting.indexOf(a.meeting);
      return Math.floor((this.clock + i * (TALK_MS / 2)) / TALK_MS) % 2 ? "chart" : "talk";
    }
    if (a.onBreak) {
      if (group.length >= 2 && group[Math.floor(this.clock / TALK_MS) % group.length] === a) return "talk";
    }
    // done for now and back at the desk: a check, so it does not read as still working (asleep shows its z's instead)
    if (a.ch.status === "idle" && !a.onBreak && !a.leaving) return "done";
    return null;
  }

  /** Agents having a drink within two tiles of `a` (a itself included), in a stable order: who can chat with it. */
  private chatters(a: Actor): Actor[] {
    return [...this.actors.values()].filter((o) => o.room === a.room && o.onBreak?.act === "drink" && !o.path.length && !o.leaving
      && Math.abs(o.x - a.x) + Math.abs(o.y - a.y) <= 2).sort((p, q) => (p.key < q.key ? -1 : 1));
  }

  /** Which way an agent faces once it stops: at the desk the viewer, at the table its spot, at the machines whoever else is there. */
  private restDir(a: Actor): Dir {
    if (a.meeting) return a.meeting.face;
    if (a.onBreak && a.onBreak.act !== "drink") return a.onBreak.face;
    if (a.onBreak) {
      let best: Actor | undefined, bd = Infinity;
      for (const o of this.chatters(a)) {
        if (o === a) continue;
        const d = Math.abs(o.x - a.x) + Math.abs(o.y - a.y);
        if (d < bd) { bd = d; best = o; }
      }
      return best ? dirBetween(tileOf(a), tileOf(best)) : "up";
    }
    return "down";
  }

  /** Free for a break: idle or waiting long enough, at its desk, not walking. */
  private available(a: Actor): boolean {
    return !a.leaving && !a.path.length && a.ch.desk !== null && !a.handover
      && (a.ch.status === "idle" || a.ch.status === "waiting") && this.clock - a.statusSince >= BREAK_AFTER_MS;
  }

  private waitedLongEnough(a: Actor): boolean {
    return a.ch.status === "waiting" && !!a.ch.owner && this.clock - a.statusSince >= VISIT_AFTER_MS;
  }

  /** Waiting for permission a few seconds, seated, and an agent of another PC in the room is on a break or waiting too. */
  private visiting(a: Actor): boolean {
    if (a.leaving || a.path.length || a.ch.desk === null || a.handover || !this.waitedLongEnough(a)) return false;
    return [...this.actors.values()].some((o) => o !== a && o.room === a.room && !o.leaving && !!o.ch.owner && o.ch.owner !== a.ch.owner
      && (!!o.onBreak || this.waitedLongEnough(o)));
  }

  /**
   * Idle or waiting long enough: if a colleague in the same room and folder is also free (or already at the table),
   * both meet at the meeting table. An agent and its own subagents are not colleagues: nobody meets alone.
   * Otherwise (or when the table is full) take a break at a free spot of the room's break room. Each agent tries the
   * spots from its own starting point, so breaks spread over the machines, the coffee, the sofa and the TV.
   */
  private takeBreaks() {
    if (this.snap) return;
    for (const a of this.actors.values()) {
      if (a.onBreak || a.meeting || !(this.available(a) || this.visiting(a))) continue;
      const visit = !this.available(a);
      const others = [...this.actors.values()].filter((o) => o !== a && o.room === a.room && !o.leaving);
      const related = (o: Actor) => o.ch.parent === a.key || a.ch.parent === o.key;
      const colleague = (o: Actor) => !!a.ch.cwd && o.ch.cwd === a.ch.cwd && !related(o) && (!!o.meeting || (!o.onBreak && this.available(o)));
      if (!visit && others.some(colleague)) {
        const spot = this._floor.meeting.find((s) => !others.some((o) => o.meeting === s));
        if (spot) { a.meeting = spot; this.route(a, spot); continue; }
      }
      const taken = new Set(others.filter((o) => o.onBreak).map((o) => `${o.onBreak!.c},${o.onBreak!.r}`));
      // a visitor heads for the chat group of a visited agent already on a break, else for the machines
      const host = visit ? others.find((o) => o.onBreak && !!o.ch.owner && o.ch.owner !== a.ch.owner) : undefined;
      const drink = this.spots.findIndex((t) => t.act === "drink");
      const start = visit && drink >= 0 ? drink : seedOf(a.key) % Math.max(1, this.spots.length);
      let order = [...this.spots.slice(start), ...this.spots.slice(0, start)];
      if (host) order = [...order.filter((t) => Math.abs(t.c - host.onBreak!.c) + Math.abs(t.r - host.onBreak!.r) <= 2), ...order];
      const spot = order.find((t) => !taken.has(`${t.c},${t.r}`));
      if (!spot) continue;
      a.onBreak = spot;
      this.route(a, spot);
    }
  }

  /** Two agents walking past each other (within one tile) wave, at most once per pair every GREET_COOLDOWN_MS. */
  private greet() {
    if (this.snap) return;
    for (const [k, at] of this.greeted) if (this.clock - at >= GREET_COOLDOWN_MS) this.greeted.delete(k);
    const walking = [...this.actors.values()].filter((a) => a.path.length > 0);
    for (let i = 0; i < walking.length; i++) for (let j = i + 1; j < walking.length; j++) {
      const a = walking[i], b = walking[j];
      if (a.room !== b.room || Math.hypot(a.x - b.x, a.y - b.y) > 1) continue;
      const k = a.key < b.key ? `${a.key}\n${b.key}` : `${b.key}\n${a.key}`;
      if (this.greeted.has(k)) continue;
      this.greeted.set(k, this.clock);
      a.waveUntil = b.waveUntil = this.clock + WAVE_MS;
    }
  }

  private leave(a: Actor) {
    a.onBreak = null;
    a.meeting = null;
    a.leaving = true;
    if (this.snap) { this.actors.delete(a.key); return; }
    // a subagent reports back first: it stops by its parent's seat with the result, then walks out
    const p = a.ch.parent ? this.actors.get(a.ch.parent) : undefined;
    if (p && p !== a && !p.leaving && p.room === a.room && p.ch.desk !== null && !a.handover) {
      const seat = deskAt(this._floor, p.ch.desk).seat;
      const to = this.free([{ c: seat.c - 1, r: seat.r }, { c: seat.c + 1, r: seat.r }, { c: seat.c, r: seat.r - 1 }], a.room, a);
      if (to) { a.handover = { to, parent: p.key, until: null }; this.route(a, to); return; }
    }
    this.route(a, this._floor.door);
  }

  /** First tile of the list that can be walked on, is not a seat, and nobody else stands on or is heading to. */
  private free(tiles: Tile[], room: number, except?: Actor): Tile | null {
    const busy = [...this.actors.values()].filter((o) => o !== except && o.room === room)
      .flatMap((o) => [tileOf(o), ...(o.path.length ? [o.path[o.path.length - 1]] : [])]);
    return tiles.find((t) => this.grid[t.r]?.[t.c] && !this.seatLike(t) && !busy.some((b) => same(b, t))) ?? null;
  }

  /**
   * Walks along the grid only. Mid-step it first finishes the step it is on (that tile is free by construction),
   * then follows a fresh path. With no path it stops there: never a straight line through furniture or walls.
   * Returns whether the target is reachable.
   */
  private route(a: { x: number; y: number; path: Tile[] }, to: Tile, grid?: boolean[][]): boolean {
    if (this.snap) { a.x = to.c; a.y = to.r; a.path = []; return true; }
    const midStep = a.x !== Math.round(a.x) || a.y !== Math.round(a.y);
    const from = midStep && a.path.length ? a.path[0] : tileOf(a);
    // an agent walks around other people's chairs; only if that leaves no way does it fall back to crossing them
    let p = findPath(grid ?? this.aisles(to), from, to);
    if (!p.length && !grid) p = findPath(this.grid, from, to);
    const head = midStep && a.path.length ? [from] : [];
    a.path = p.length ? [...head, ...p.slice(1)] : head;
    return p.length > 0;
  }

  /**
   * Routes an agent after the room changed under it. One with no way from where it stands starts again at the door
   * when its goal can be reached from there, or when it stands on furniture; it stays at the door if even that has no
   * way. A goal that furniture now covers leaves it where it is, as before.
   */
  private reroute(a: Actor, to: Tile) {
    if (this.route(a, to) || a.leaving) return;
    const door = this._floor.door, here = tileOf(a);
    if (!findPath(this.grid, door, to).length && this.grid[here.r]?.[here.c]) return;
    a.x = door.c; a.y = door.r; a.path = [];
    this.route(a, to);
  }

  /** The chair-free grid, with the destination open when the destination is a seat. The start needs no opening: findPath always lets you step off where you stand. */
  private aisles(to: Tile): boolean[][] {
    if (!this.seatLike(to) || !this.grid[to.r]?.[to.c]) return this.petGrid;
    const g = this.petGrid.map((row) => row.slice());
    g[to.r][to.c] = true;
    return g;
  }

  // ---- pets ----

  private routePet(p: Pet, to: Tile): boolean { return this.route(p, to, this.petGrid); }

  private roomCount(): number {
    let n = this.rooms;
    for (const a of this.actors.values()) n = Math.max(n, a.room + 1);
    return n;
  }

  /** The pets the choice puts in an office of `n` rooms. */
  static petsFor(choice: PetChoice, n: number): string[] {
    if (choice === "off") return [];
    if (choice === "all") return [...PET_NAMES];
    if (choice === "auto") return PET_NAMES.slice(0, Math.min(PET_NAMES.length, PETS_PER_ROOM * n));
    return [choice];
  }

  /**
   * The chosen pets, spread over the open rooms. With "auto", the pets of a room that opens come in with it and walk
   * out the door when it closes; a pet left in a room that closed walks in through the door of the last one.
   */
  private syncPets() {
    const n = this.roomCount();
    const names = Scene.petsFor(this.petChoice, n);
    for (const p of this.pets) {
      const stays = names.includes(p.name);
      if (stays && p.leaving) { p.leaving = false; p.path = p.path.slice(0, 1); p.restUntil = this.clock; }
      if (stays || p.leaving) continue;
      this.endPlay(p);
      p.owner = null; p.sitAt = null; p.travel = null; p.wandering = false; p.leaving = true;
      if (p.room >= n || this.snap || !this.routePet(p, this._floor.door)) p.path = [];
    }
    // gone at once from a room that closed or a static page, or when it cannot get to the door
    this.pets = this.pets.filter((p) => !p.leaving || p.path.length);
    for (const name of names) {
      if (this.pets.some((p) => p.name === name)) continue;
      // each pair has a home room it shows up in: the first two the first room, the next two the second one...
      const i = PET_NAMES.indexOf(name);
      this.pets.push(this.newPet(name, i, Math.min(n - 1, Math.floor(i / PETS_PER_ROOM))));
    }
    this.pets.sort((a, b) => PET_NAMES.indexOf(a.name) - PET_NAMES.indexOf(b.name));
    for (const p of this.pets) {
      if (p.travel !== null && p.travel >= n) { p.travel = null; p.path = p.path.slice(0, 1); }
      if (p.room >= n) {
        // its room closed: it comes in through the door of the last one, or right next to it if other pets are there
        this.endPlay(p);
        p.room = n - 1; p.travel = null; p.path = []; p.owner = null; p.sitAt = null; p.wandering = false; p.restUntil = this.clock;
        const door = this._floor.door;
        const spot = this.petFree(p, [door, ...this.petTiles().sort((a, b) => Math.abs(a.c - door.c) + Math.abs(a.r - door.r) - Math.abs(b.c - door.c) - Math.abs(b.r - door.r))]);
        p.x = spot.c; p.y = spot.r;
      }
    }
  }

  /** Tiles a pet may stand on: walkable, inside the room (not in the doorway) and never a chair. */
  private petTiles(): Tile[] {
    const out: Tile[] = [];
    for (let r = 0; r < bottomOf(this._floor); r++) for (let c = 0; c < this.petGrid[r].length; c++) if (this.petGrid[r][c]) out.push({ c, r });
    return out;
  }

  private newPet(name: string, i: number, room: number): Pet {
    const p: Pet = { name, room, x: 0, y: 0, path: [], dir: "down", owner: null, sitAt: null, wandering: false, restUntil: 0, travel: null, play: null, playAgainAt: 0, waitUntil: 0, blockedSince: 0, leaving: false, rng: (0x9e3779b9 ^ ((i + 1) * 7919)) | 0 };
    // a random tile no other pet or agent stands on or is heading to
    const taken = [...this.pets, ...[...this.actors.values()].filter((a) => !a.leaving)].filter((o) => o.room === room)
      .flatMap((o) => [...this.covers(o), ...(o.path.length ? [o.path[o.path.length - 1]] : [])]);
    const all = this.petTiles(), free = all.filter((t) => !taken.some((o) => same(o, t)));
    const tiles = free.length ? free : all;
    const home = tiles[Math.floor(rand(p) * tiles.length)];
    p.x = home.c; p.y = home.r;
    p.restUntil = 1_000 + Math.floor(rand(p) * 2_000);
    return p;
  }

  /** The agent a pet keeps company: idle at its desk first, then asleep at its desk; the lowest desk breaks ties. */
  private petOwner(p: Pet): { owner: string; tile: Tile } | null {
    const rank = (a: Actor) => (a.ch.status === "idle" ? 0 : 1);
    const cands = [...this.actors.values()].filter((a) => a.room === p.room && !a.leaving && a.ch.desk !== null && !a.path.length
      && !a.onBreak && !a.meeting && !a.handover && (a.ch.status === "idle" || a.ch.status === "sleeping")
      && !this.pets.some((o) => o !== p && o.owner === a.key))
      .sort((x, y) => rank(x) - rank(y) || x.ch.desk! - y.ch.desk!);
    if (!cands.length) return null;
    const cur = cands.find((a) => a.key === p.owner);
    const order = cur && rank(cur) <= rank(cands[0]) ? [cur, ...cands.filter((a) => a !== cur)] : cands;
    for (const a of order) {
      const seat = deskAt(this._floor, a.ch.desk!).seat;
      // two tiles over, so the desk does not hide it; behind the chair as a last resort
      const keep = cur === a && p.sitAt ? [p.sitAt] : [];
      const near = [...keep, { c: seat.c + 2, r: seat.r }, { c: seat.c - 2, r: seat.r }, { c: seat.c + 1, r: seat.r - 1 }, { c: seat.c - 1, r: seat.r - 1 }];
      const otherPets = this.pets.filter((o) => o !== p && o.room === p.room).flatMap((o) => [tileOf(o), ...(o.sitAt ? [o.sitAt] : [])]);
      const tile = this.free(near.filter((t) => !otherPets.some((o) => same(o, t))), p.room);
      if (tile) return { owner: a.key, tile };
    }
    return null;
  }

  private stepPets(dtMs: number) {
    for (const p of this.pets) {
      if (!this.petGrid[Math.round(p.y)]?.[Math.round(p.x)]) {
        // the furniture moved under it (theme change): hop to the nearest free tile
        const d = (t: Tile) => Math.abs(t.c - p.x) + Math.abs(t.r - p.y);
        const tiles = this.petTiles().sort((s, t) => d(s) - d(t));
        if (tiles.length) { const near = this.petFree(p, tiles); p.x = near.c; p.y = near.r; p.path = []; }
      }
      if (p.leaving) { this.stepLeaving(p, dtMs); continue; }
      // keeping an idle or sleeping agent company comes first, but a pet on its way to another room gets there first
      const want = p.travel === null ? this.petOwner(p) : null;
      if (want && (want.owner !== p.owner || !same(want.tile, p.sitAt))) {
        this.endPlay(p);
        p.owner = want.owner; p.sitAt = want.tile; p.wandering = false;
        this.routePet(p, want.tile);
      } else if (!want && p.owner) {
        p.owner = null; p.sitAt = null; p.wandering = false;
        p.restUntil = this.clock + 1_000;
        p.path = p.path.slice(0, 1); // finish the step it is on, then think
      }
      if (this.snap) { p.dir = "down"; continue; }
      if (p.play) this.playTag(p);
      // pets bump into each other instead of walking through: stop, look, then go around
      const blocker = this.blockedBy(p);
      if (blocker) { this.bumped(p, blocker, () => this.giveUp(p)); continue; }
      p.waitUntil = 0; p.blockedSince = 0;
      // one tile at a time, checking each before stepping on it
      for (let budget = ((p.owner || p.play ? PET_RUN : PET_SPEED) * dtMs) / 1000; budget > 1e-9 && p.path.length && !this.blockedBy(p);) {
        const next = p.path[0];
        const use = Math.min(budget, Math.max(Math.abs(next.c - p.x) + Math.abs(next.r - p.y), 1e-9));
        move(p, use);
        budget -= use;
      }
      if (p.path.length) continue;
      if (p.travel !== null) {
        // out the door: come in through the door of the other room and wander in, once nobody else is in that doorway
        const from = p.room, to = p.travel;
        const door = this._floor.door;
        const inWay = this.pets.filter((o) => o !== p && o.room === to && this.covers(o).some((t) => Math.abs(t.c - door.c) + Math.abs(t.r - door.r) <= 1));
        // two pets waiting at each other's door pass each other; otherwise it waits, and gives up after a while
        const swap = inWay.length === 1 && inWay[0].travel === from && !inWay[0].path.length && same(tileOf(inWay[0]), this._floor.door);
        if (inWay.length && !swap) {
          if (!p.blockedSince) p.blockedSince = this.clock;
          if (this.clock - p.blockedSince >= PET_GIVE_UP_MS) this.giveUp(p);
          continue;
        }
        p.blockedSince = 0;
        for (const q of swap ? [p, inWay[0]] : [p]) {
          q.room = q.travel!; q.travel = null; q.x = this._floor.door.c; q.y = this._floor.door.r; q.blockedSince = 0;
          const go = this.wanderTarget(q);
          if (go) { q.wandering = true; this.routePet(q, go); }
        }
        continue;
      }
      if (p.owner) { p.dir = "down"; continue; }
      // resting (or stopped mid-game) where an agent stands or is heading: move out of the way now
      if (this.agentSpots(p.room).some((t) => same(t, tileOf(p)))) {
        const to = this.wanderTarget(p);
        if (to) { p.wandering = !p.play; this.routePet(p, to); continue; }
      }
      if (p.play) continue;
      if (p.wandering) {
        p.wandering = false;
        p.restUntil = this.clock + 2_000 + Math.floor(rand(p) * 4_000);
        p.dir = rand(p) < 0.25 ? "up" : "down";
      } else if (this.clock >= p.restUntil) this.nextPetMove(p);
    }
  }

  /** First tile of the list no other pet in its room covers (the first one if all are taken). */
  private petFree(p: Pet, tiles: Tile[]): Tile {
    const others = this.pets.filter((o) => o !== p && o.room === p.room).flatMap((o) => this.covers(o));
    return tiles.find((t) => !others.some((o) => same(o, t))) ?? tiles[0];
  }

  /** Where agents of a room stand or are heading, and the spots they use at the machines and the table. */
  private agentSpots(room: number): Tile[] {
    return [...this.actors.values()].filter((a) => a.room === room && !a.leaving)
      .flatMap((a) => [tileOf(a), ...(a.path.length ? [a.path[a.path.length - 1]] : [])]).concat(this.spots, this._floor.meeting);
  }

  /** Tiles a pet covers: one, or the two it is between while it steps. */
  private covers(o: { x: number; y: number }): Tile[] {
    const a = { c: Math.floor(o.x), r: Math.floor(o.y) }, b = { c: Math.ceil(o.x), r: Math.ceil(o.y) };
    return same(a, b) ? [a] : [a, b];
  }

  /** The other pet standing on, or stepping into, the tile this pet is about to step onto. */
  private blockedBy(p: Pet): Pet | undefined {
    if (!p.path.length || p.x !== Math.round(p.x) || p.y !== Math.round(p.y)) return undefined; // mid-step: the tile was free
    const next = p.path[0];
    return this.pets.find((o) => o !== p && o.room === p.room && this.covers(o).some((t) => same(t, next)));
  }

  /**
   * Blocked by another pet: it stops and looks at it, then walks around it. When two meet head-on (a narrow aisle, the
   * doorway), only one makes way, stepping aside or turning back: whoever is on its way out of the room goes first.
   * Stuck for too long, it gives up.
   */
  private bumped(p: Pet, o: Pet, giveUp: () => void) {
    p.dir = dirBetween(tileOf(p), p.path[0]);
    if (!p.blockedSince) p.blockedSince = this.clock;
    if (this.clock - p.blockedSince >= PET_GIVE_UP_MS) { giveUp(); return; }
    if (!p.waitUntil) { p.waitUntil = this.clock + PET_BUMP_MS; return; }
    if (this.clock < p.waitUntil) return;
    p.waitUntil = 0;
    const headOn = o.path.length > 0 && same(o.path[0], tileOf(p));
    if (headOn) {
      const out = (q: Pet) => (q.travel !== null || q.leaving ? 1 : 0);
      if (out(p) > out(o) || (out(p) === out(o) && p.name < o.name)) return; // the other one makes way
      if (this.stepAside(p, o)) return;
    }
    this.detour(p, o);
  }

  /** Makes way on a head-on meeting: a free tile beside it, off the other pet's way, then on to where it was going. */
  private stepAside(p: Pet, o: Pet): boolean {
    const here = tileOf(p), goal = p.path[p.path.length - 1];
    const taken = [...this.pets.filter((q) => q !== p && q.room === p.room).flatMap((q) => this.covers(q)), ...o.path.slice(0, 3)];
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) {
      const t = { c: here.c + dc, r: here.r + dr };
      if (t.r >= bottomOf(this._floor) || !this.petGrid[t.r]?.[t.c] || this.isSeat(t) || taken.some((q) => same(q, t))) continue;
      const on = findPath(this.petGrid, t, goal);
      p.path = [t, ...on.slice(1)];
      return true;
    }
    return false;
  }

  /** A way to the same place around the other pet; without one it keeps waiting for the other to move. */
  private detour(p: Pet, o: Pet) {
    const goal = p.path[p.path.length - 1];
    const g = this.petGrid.map((row) => row.slice());
    for (const t of this.covers(o)) if (g[t.r]) g[t.r][t.c] = false;
    if (!g[goal.r]?.[goal.c]) return;
    const path = findPath(g, tileOf(p), goal);
    if (path.length) p.path = path.slice(1);
  }

  /** A pet on its way out: it walks to the door like any other pet, bumping into others, and is gone once there. */
  private stepLeaving(p: Pet, dtMs: number) {
    const blocker = this.blockedBy(p);
    if (blocker) this.bumped(p, blocker, () => { p.path = []; });
    else {
      p.waitUntil = 0; p.blockedSince = 0;
      for (let budget = (PET_SPEED * dtMs) / 1000; budget > 1e-9 && p.path.length && !this.blockedBy(p);) {
        const next = p.path[0];
        const use = Math.min(budget, Math.max(Math.abs(next.c - p.x) + Math.abs(next.r - p.y), 1e-9));
        move(p, use);
        budget -= use;
      }
    }
    if (!p.path.length) this.pets = this.pets.filter((o) => o !== p);
  }

  /**
   * Stuck behind other pets (a crowded aisle, a pet resting in a doorway): it drops what it was doing, the game, the
   * trip or the agent it was heading to, and strolls somewhere else; it may try again later.
   */
  private giveUp(p: Pet) {
    p.waitUntil = 0; p.blockedSince = 0;
    this.endPlay(p);
    p.travel = null; p.owner = null; p.sitAt = null;
    const to = this.wanderTarget(p);
    p.path = [];
    if (to && this.routePet(p, to)) p.wandering = true;
    else { p.wandering = false; p.restUntil = this.clock + 1_000; }
  }

  /** Done resting: play with a pet in the room (pets play in pairs), go to another room, or stroll nearby. */
  private nextPetMove(p: Pet) {
    const mates = this.pets.filter((o) => o !== p && o.room === p.room && !o.owner && !o.play && !o.leaving && o.travel === null && this.clock >= o.playAgainAt);
    const mate = mates.length ? mates[mates.length === 1 ? 0 : Math.floor(rand(p) * mates.length)] : undefined;
    if (mate && this.clock >= p.playAgainAt && rand(p) < PET_PLAY_CHANCE) {
      const until = this.clock + PET_PLAY_MS;
      p.play = { with: mate, chasing: true, until };
      mate.play = { with: p, chasing: false, until };
      mate.wandering = false; mate.path = mate.path.slice(0, 1);
      return;
    }
    const n = this.roomCount();
    if (n > 1 && rand(p) < PET_TRAVEL_CHANCE) {
      let room = Math.floor(rand(p) * (n - 1));
      if (room >= p.room) room++;
      if (this.routePet(p, this._floor.door)) { p.travel = room; p.wandering = false; return; }
    }
    const to = this.wanderTarget(p);
    if (to) { p.wandering = true; this.routePet(p, to); }
    else p.restUntil = this.clock + 2_000;
  }

  /** Tag: "it" runs after the other pet; when it catches up they swap. When time is up both sit and look at each other. */
  private playTag(p: Pet) {
    const game = p.play!, o = game.with;
    if (this.clock >= game.until || o.room !== p.room || o.play?.with !== p) {
      this.endPlay(p);
      if (o.room === p.room) p.dir = dirBetween(tileOf(p), tileOf(o));
      return;
    }
    if (!game.chasing) {
      if (!p.path.length) { const to = this.wanderTarget(p); if (to) this.routePet(p, to); }
      return;
    }
    if (Math.abs(p.x - o.x) + Math.abs(p.y - o.y) <= 1) {
      // tagged: the other one is "it" now and gets a head start of a step
      game.chasing = false; o.play!.chasing = true;
      p.path = p.path.slice(0, 1);
      const to = this.wanderTarget(p); if (to) this.routePet(p, to);
      o.path = o.path.slice(0, 1);
      return;
    }
    const goal = p.path[p.path.length - 1];
    if (!goal || Math.abs(goal.c - o.x) + Math.abs(goal.r - o.y) > 1) this.routePet(p, tileOf(o));
  }

  /** Ends a game for both players; they rest a moment and do not play again for a while. */
  private endPlay(p: Pet) {
    for (const q of p.play ? [p, p.play.with] : []) {
      if (!q.play) continue;
      q.play = null;
      q.path = q.path.slice(0, 1);
      q.restUntil = this.clock + 2_000 + Math.floor(rand(q) * 2_000);
      q.playAgainAt = this.clock + PET_PLAY_COOLDOWN_MS;
    }
  }

  /** A random tile two to seven steps away, out of the doorway. */
  private wanderTarget(p: Pet): Tile | null {
    const from = tileOf(p);
    const avoid = [...this.agentSpots(p.room), ...this.pets.filter((o) => o !== p && o.room === p.room).flatMap((o) => [...this.covers(o), ...(o.path.length ? [o.path[o.path.length - 1]] : [])])];
    const seen = new Set([`${from.c},${from.r}`]);
    const q: [Tile, number][] = [[from, 0]];
    const out: Tile[] = [];
    for (let i = 0; i < q.length; i++) {
      const [t, d] = q[i];
      // never stop in front of the door, where others come in and go out
      if (d >= 2 && !this.isSeat(t) && !avoid.some((a) => same(a, t)) && Math.abs(t.c - this._floor.door.c) + Math.abs(t.r - this._floor.door.r) > 2) out.push(t);
      if (d === 7) continue;
      for (const [dc, dr] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
        const n = { c: t.c + dc, r: t.r + dr };
        const k = `${n.c},${n.r}`;
        if (seen.has(k) || n.r >= bottomOf(this._floor) || !this.petGrid[n.r]?.[n.c]) continue;
        seen.add(k); q.push([n, d + 1]);
      }
    }
    return out.length ? out[Math.floor(rand(p) * out.length)] : null;
  }
}
