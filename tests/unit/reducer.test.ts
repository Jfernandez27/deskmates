import { describe, test, expect } from "vitest";
import { reduce, tick, emptyState, keyOf, SLEEP_AFTER_MS, LEAVE_AFTER_MS, REMOVE_AFTER_MS } from "../../src/core/reducer.ts";
import type { AgentEvent, OfficeState } from "../../src/types/events.ts";

const T0 = Date.parse("2026-10-14T12:00:00Z");
const at = (ms: number) => new Date(T0 + ms).toISOString();
const ev = (p: Partial<AgentEvent> & Pick<AgentEvent, "kind">, ms = 0): AgentEvent =>
  ({ source: "claude", profile: "claude-work", session: "s1", ts: at(ms), transport: "hook", ...p });
const run = (events: AgentEvent[], s: OfficeState = emptyState()) => events.reduce(reduce, s);
const ch = (s: OfficeState, session = "s1", profile = "claude-work") => s.characters[keyOf({ source: "claude", profile, session })];

describe("reducer", () => {
  test("start creates a working character at the first desk", () => {
    const s = run([ev({ kind: "start", agent: "id3a:designer", cwd: "/home/j/proj" })]);
    expect(ch(s)).toMatchObject({ status: "working", desk: 0, label: "claude-work · id3a:designer", agent: "id3a:designer" });
  });

  test("label falls back to source and cwd basename", () => {
    expect(ch(run([ev({ kind: "start", cwd: "/home/j/atlas" })])).label).toBe("claude-work · atlas");
    const s = run([ev({ kind: "start", profile: undefined, cwd: "/x/harbor" })]);
    expect(Object.values(s.characters)[0].label).toBe("claude · harbor");
  });

  test("a chosen name is the label, apart from the role, and can change later", () => {
    const s = run([ev({ kind: "start", agent: "id3a:designer", name: "Ada", cwd: "/x/web" })]);
    expect(ch(s)).toMatchObject({ name: "Ada", agent: "id3a:designer", label: "claude-work · Ada" });
    const s2 = run([ev({ kind: "tool", tool: "Edit", name: "Grace" }, 1)], s);
    expect(ch(s2)).toMatchObject({ name: "Grace", label: "claude-work · Grace" });
    expect(ch(run([ev({ kind: "tool", tool: "Read" }, 2)], s2)).name, "an event without a name keeps it").toBe("Grace");
  });

  test("the model in use is kept, and the latest one wins", () => {
    const s = run([ev({ kind: "start" }), ev({ kind: "usage", model: "claude-sonnet-5-5" }, 1)]);
    expect(ch(s).model).toBe("claude-sonnet-5-5");
    expect(ch(run([ev({ kind: "tool", tool: "Read", model: "claude-opus-5-5" }, 2)], s)).model).toBe("claude-opus-5-5");
  });

  test("editing tools type, reading tools read", () => {
    const s1 = run([ev({ kind: "start" }), ev({ kind: "tool", tool: "Edit", detail: "SKILL.md" }, 1)]);
    expect(ch(s1)).toMatchObject({ activity: "typing", tool: "Edit", detail: "SKILL.md" });
    const s2 = reduce(s1, ev({ kind: "tool", tool: "Grep", detail: "foo" }, 2));
    expect(ch(s2).activity).toBe("reading");
  });

  test("waiting, then tool resumes working", () => {
    const s = run([ev({ kind: "start" }), ev({ kind: "waiting" }, 1)]);
    expect(ch(s).status).toBe("waiting");
    expect(ch(reduce(s, ev({ kind: "tool", tool: "Bash" }, 2))).status).toBe("working");
  });

  test("idle records when work began, for the finished notification", () => {
    const s = run([ev({ kind: "start" }), ev({ kind: "tool", tool: "Edit" }, 1000), ev({ kind: "idle" }, 200_000)]);
    expect(ch(s)).toMatchObject({ status: "idle", workedMs: 200_000 });
  });

  test("silence: sleeping after 10 min, leaving after 30, removed later; desk freed", () => {
    let s = run([ev({ kind: "start" })]);
    s = tick(s, T0 + SLEEP_AFTER_MS + 1);
    expect(ch(s).status).toBe("sleeping");
    s = tick(s, T0 + LEAVE_AFTER_MS + 1);
    expect(ch(s).status).toBe("leaving");
    const s2 = reduce(s, ev({ kind: "start", session: "s2" }, LEAVE_AFTER_MS + 2));
    expect(ch(s2, "s2").desk).toBe(0);
    expect(ch(tick(s2, T0 + LEAVE_AFTER_MS + 1 + REMOVE_AFTER_MS + 1))).toBeUndefined();
  });

  test("a new event wakes a sleeping character", () => {
    let s = tick(run([ev({ kind: "start" })]), T0 + SLEEP_AFTER_MS + 1);
    s = reduce(s, ev({ kind: "tool", tool: "Read" }, SLEEP_AFTER_MS + 2));
    expect(ch(s).status).toBe("working");
  });

  test("end makes the character leave and frees the desk", () => {
    const s = run([ev({ kind: "start" }), ev({ kind: "end" }, 5)]);
    expect(ch(s)).toMatchObject({ status: "leaving", desk: null });
  });

  test("out-of-order events are ignored", () => {
    const s = run([ev({ kind: "start" }), ev({ kind: "waiting" }, 10), ev({ kind: "tool", tool: "Edit" }, 5)]);
    expect(ch(s).status).toBe("waiting");
  });

  test("subagent sits next to its parent and leaves on end", () => {
    let s = run([ev({ kind: "start" }), ev({ kind: "start", session: "x" }), ev({ kind: "start", session: "sub", parent: "s1", agent: "Explore" }, 1)]);
    expect(ch(s, "sub")).toMatchObject({ parent: keyOf({ source: "claude", profile: "claude-work", session: "s1" }), desk: 2, label: "claude-work · Explore" });
    s = reduce(s, ev({ kind: "end", session: "sub" }, 2));
    expect(ch(s, "sub").status).toBe("leaving");
  });

  test("subagent takes the free desk closest to its parent", () => {
    let s = run(Array.from({ length: 4 }, (_, i) => ev({ kind: "start", session: `p${i}` })));
    s = reduce(s, ev({ kind: "end", session: "p3" }, 1));
    s = reduce(s, ev({ kind: "end", session: "p0" }, 1));
    s = reduce(s, ev({ kind: "start", session: "sub", parent: "p2" }, 2));
    expect(ch(s, "sub").desk).toBe(3);
  });

  test("the ninth session opens a second room", () => {
    const s = run(Array.from({ length: 9 }, (_, i) => ev({ kind: "start", session: `s${i}` })));
    expect(ch(s, "s8").desk).toBe(8);
    expect(s.rooms).toBe(2);
  });

  test("a subagent stays in its parent's room instead of opening a new one", () => {
    let s = run(Array.from({ length: 8 }, (_, i) => ev({ kind: "start", session: `s${i}` })));
    s = reduce(s, ev({ kind: "start", session: "s0", profile: "other" }, 1));
    s = reduce(s, ev({ kind: "start", session: "sub", parent: "s7" }, 2));
    expect(ch(s, "sub").desk).toBe(9);
    expect(s.rooms).toBe(2);
    const full = run(Array.from({ length: 16 }, (_, i) => ev({ kind: "start", session: `s${i}` })));
    const sub = reduce(reduce(full, ev({ kind: "end", session: "s2" }, 1)), ev({ kind: "start", session: "sub", parent: "s15" }, 2));
    expect(ch(sub, "sub").desk).toBe(2);
    expect(sub.rooms).toBe(2);
  });

  test("empty rooms close: whoever is left in a later room moves to a free desk", () => {
    let s = run(Array.from({ length: 22 }, (_, i) => ev({ kind: "start", session: `s${i}` })));
    expect(s.rooms).toBe(3);
    for (let i = 0; i < 21; i++) s = reduce(s, ev({ kind: "end", session: `s${i}` }, 1));
    expect(ch(s, "s21").desk).toBeLessThan(8);
    expect(s.rooms).toBe(1);
  });

  test("same session id in two profiles does not collide", () => {
    const s = run([ev({ kind: "start" }), ev({ kind: "start", profile: "claude" })]);
    expect(Object.keys(s.characters)).toHaveLength(2);
  });

  test("usage sets tokens without changing status, and never creates a character", () => {
    const tokens = { input: 6, output: 386, cacheRead: 1, cacheWrite: 2 };
    const s = run([ev({ kind: "start" }), ev({ kind: "idle" }, 1), ev({ kind: "usage", tokens }, 2)]);
    expect(ch(s)).toMatchObject({ status: "idle", tokens });
    expect(Object.keys(run([ev({ kind: "usage", tokens, session: "ghost" })]).characters)).toHaveLength(0);
  });

  test("an event for an unknown session creates it (service restarted mid-session)", () => {
    expect(ch(run([ev({ kind: "tool", tool: "Edit" })])).status).toBe("working");
  });

  test("reduce does not mutate its input", () => {
    const s = run([ev({ kind: "start" })]);
    const snapshot = JSON.stringify(s);
    reduce(s, ev({ kind: "waiting" }, 1));
    tick(s, T0 + LEAVE_AFTER_MS * 2);
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});

describe("owners", () => {
  const ov = (p: Partial<AgentEvent>): AgentEvent =>
    ({ source: "claude", kind: "start", transport: "api", ts: at(0), session: "s", ...p }) as AgentEvent;

  test("two owners, same source/profile/session, are two characters", () => {
    let s = emptyState();
    s = reduce(s, ov({ owner: "aaaaaaaa", ownerName: "Ana", session: "x" }));
    s = reduce(s, ov({ owner: "bbbbbbbb", ownerName: "Beto", session: "x" }));
    expect(Object.keys(s.characters).sort()).toEqual(["aaaaaaaa:claude//x", "bbbbbbbb:claude//x"]);
    expect(s.owners).toEqual(["aaaaaaaa", "bbbbbbbb"]);
    expect(s.characters["bbbbbbbb:claude//x"].ownerName).toBe("Beto");
  });

  test("owners are remembered in order and never dropped", () => {
    let s = emptyState(["zzzzzzzz"]);
    s = reduce(s, ov({ owner: "aaaaaaaa", session: "1" }));
    s = reduce(s, ov({ owner: "aaaaaaaa", session: "1", kind: "end", ts: at(1) }));
    s = tick(s, Date.now() + 60 * 60_000);
    expect(s.owners).toEqual(["zzzzzzzz", "aaaaaaaa"]);
  });

  test("an owner's agents sit on its island, overflow goes anywhere free", () => {
    let s = emptyState();
    for (let i = 0; i < 5; i++) s = reduce(s, ov({ owner: "bbbbbbbb", session: `b${i}` }));
    s = reduce(s, ov({ owner: "aaaaaaaa", session: "a0" }));
    const desks = (o: string) => Object.values(s.characters).filter((c) => c.owner === o).map((c) => c.desk).sort((x, y) => x! - y!);
    expect(desks("bbbbbbbb")).toEqual([0, 1, 2, 3, 4]); // overflow takes the first free desk, which is on the not-yet-seen island 1
    expect(desks("aaaaaaaa")).toEqual([5]); // its island is partly taken, so the first free desk of it
  });

  test("with eight or fewer agents the office keeps one room, so the third and fourth PC share rows with the first two", () => {
    let s = emptyState();
    ["a", "b", "c", "a", "c", "d"].forEach((o, i) => (s = reduce(s, ov({ owner: o.repeat(8), session: `s${i}` }))));
    const desks = Object.values(s.characters).map((c) => c.desk!).sort((x, y) => x - y);
    expect(s.rooms).toBe(1);
    expect(desks).toEqual([0, 1, 2, 3, 4, 5]);
    expect(desks.every((d) => d < 8)).toBe(true);
  });

  test("islands wrap on a floor of six islands", () => {
    let s = emptyState([], { desksPerRoom: 24, islandSize: 4 });
    for (let k = 0; k < 7; k++) s = reduce(s, ov({ owner: `o${k}`, session: `s${k}` }));
    expect(s.characters["o6:claude//s6"].desk).toBe(1); // island 0, next free after o0's desk 0
    expect(s.rooms).toBe(1);
  });

  test("an owner is never pulled off its island to close a room", () => {
    let s = emptyState([], { desksPerRoom: 8, islandSize: 4 });
    // a fills island 0 (desks 0-3), b island 1 (4-7); c wraps to island 0, which is full, so it sits at 8
    for (let i = 0; i < 4; i++) s = reduce(s, ov({ owner: "a", session: `a${i}` }));
    for (let i = 0; i < 4; i++) s = reduce(s, ov({ owner: "b", session: `b${i}` }));
    s = reduce(s, ov({ owner: "c", session: "c0" }));
    expect(s.characters["c:claude//c0"].desk).toBe(8);
    // b's agents leave: room 0 has free desks, but none on c's island → c stays, rooms stays 2
    for (let i = 0; i < 4; i++) s = reduce(s, ov({ owner: "b", session: `b${i}`, kind: "end" }));
    s = tick(s, T0 + 60_000);
    expect(s.characters["c:claude//c0"].desk).toBe(8);
    expect(s.rooms).toBe(2);
  });

  test("an owner in a surplus room moves to a free desk of its own island in a lower room", () => {
    let s = emptyState([], { desksPerRoom: 8, islandSize: 4 });
    for (let i = 0; i < 4; i++) s = reduce(s, ov({ owner: "a", session: `a${i}` }));
    for (let i = 0; i < 4; i++) s = reduce(s, ov({ owner: "b", session: `b${i}` }));
    s = reduce(s, ov({ owner: "c", session: "c0" }));
    // a's agents leave: island 0 of room 0 is free again, and c (island 0) moves there
    for (let i = 0; i < 4; i++) s = reduce(s, ov({ owner: "a", session: `a${i}`, kind: "end" }));
    expect(s.characters["c:claude//c0"].desk).toBe(0);
    expect(s.rooms).toBe(1);
  });

  test("on a floor of six islands an owner's overflow never takes another known owner's island", () => {
    let s = emptyState(["a", "b", "c", "d"], { desksPerRoom: 24, islandSize: 4 });
    for (let i = 0; i < 6; i++) s = reduce(s, ov({ owner: "a", session: `a${i}` }));
    for (const o of ["b", "c", "d"]) for (let i = 0; i < 3; i++) s = reduce(s, ov({ owner: o, session: `${o}${i}` }));
    const desks = (o: string) => Object.values(s.characters).filter((c) => c.owner === o).map((c) => c.desk!).sort((x, y) => x - y);
    expect(desks("a")).toEqual([0, 1, 2, 3, 16, 17]); // islands 4 and 5 are held by no known owner
    expect(desks("b")).toEqual([4, 5, 6]);
    expect(desks("c")).toEqual([8, 9, 10]);
    expect(desks("d")).toEqual([12, 13, 14]);
    expect(s.rooms).toBe(1);
  });

  test("a subagent of a's agent at desk 3 never takes desk 4 while b is known", () => {
    const start = () => {
      let s = emptyState(["a", "b"], { desksPerRoom: 24, islandSize: 4 });
      for (let i = 0; i < 4; i++) s = reduce(s, ov({ owner: "a", session: `a${i}` }));
      return s;
    };
    // a's island is full: the nearest desk of an island no known owner holds
    let s = reduce(start(), ov({ owner: "a", session: "sub", parent: "a3" }));
    expect(s.characters["a:claude//a3"].desk).toBe(3);
    expect(s.characters["a:claude//sub"].desk).toBe(8);
    // a desk of a's own island is free again: the subagent takes it
    s = reduce(start(), ov({ owner: "a", session: "a1", kind: "end" }));
    s = reduce(s, ov({ owner: "a", session: "sub", parent: "a3" }));
    expect(s.characters["a:claude//sub"].desk).toBe(1);
  });

  test("when every island is held, an owner's overflow falls back to the first free desk", () => {
    let s = emptyState(["a", "b"], { desksPerRoom: 8, islandSize: 4 });
    for (let i = 0; i < 5; i++) s = reduce(s, ov({ owner: "a", session: `a${i}` }));
    expect(s.characters["a:claude//a4"].desk).toBe(4);
  });

  test("an unowned subagent still takes the nearest free desk to its parent", () => {
    let s = emptyState([], { desksPerRoom: 24, islandSize: 4 });
    for (let i = 0; i < 4; i++) s = reduce(s, ov({ session: `p${i}` }));
    s = reduce(s, ov({ session: "sub", parent: "p3" }));
    expect(s.characters["claude//sub"].desk).toBe(4);
  });

  test("a subagent of an owned agent sits by its parent, not by the island", () => {
    let s = emptyState();
    s = reduce(s, ov({ owner: "aaaaaaaa", session: "p" }));
    s = reduce(s, ov({ owner: "aaaaaaaa", session: "c", parent: "p" }));
    expect(s.characters["aaaaaaaa:claude//c"].parent).toBe("aaaaaaaa:claude//p");
    expect(s.characters["aaaaaaaa:claude//c"].desk).toBe(1);
  });
});

test("an agent waiting for your answer keeps its ? instead of falling asleep, and still leaves after the long silence", () => {
  let s = run([ev({ kind: "start" }), ev({ kind: "waiting" }, 1000)]);
  s = tick(s, T0 + 1000 + SLEEP_AFTER_MS + 1);
  expect(ch(s).status).toBe("waiting");
  s = tick(s, T0 + 1000 + LEAVE_AFTER_MS + 1);
  expect(ch(s).status).toBe("leaving");
});

test("going idle again keeps how long the last stretch of work lasted", () => {
  let s = run([ev({ kind: "start" }), ev({ kind: "idle" }, 5000), ev({ kind: "idle" }, 6000)]);
  expect(ch(s).workedMs).toBe(5000);
});
