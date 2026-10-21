import type { ViewCharacter, StateMessage } from "../../src/server/server.ts";
import type { HistoryView } from "../../src/core/history.ts";
import { OWNER_COLORS } from "../../src/core/owners.ts";

const base = (p: Partial<ViewCharacter>): ViewCharacter => ({
  key: "claude/claude-work/x", source: "claude", profile: "claude-work", session: "x", label: "claude-work · x",
  status: "working", activity: "typing", startedAt: "2026-10-14T12:00:00Z", lastEventAt: 0, desk: 0, ...p,
});

export const office: StateMessage = {
  type: "state", now: 0,
  state: {
    rooms: 1,
    characters: [
      base({ key: "a", agent: "id3a:designer", label: "claude-work · id3a:designer", desk: 0, tool: "Edit", detail: "gen.py", model: "claude-opus-5-5",
        outfit: { role: "designer", color: "#7A4FD6", accessory: "beret", computer: "mac" }, tokens: { input: 900, output: 4000, cacheRead: 1_000_000, cacheWrite: 300_000 } }),
      base({ key: "b", agent: "id3a:community-manager", label: "claude-work · id3a:community-manager", desk: 1, status: "waiting", tool: "Bash", detail: "python3 encolar.py",
        outfit: { role: "community-manager", color: "#1F9E89", accessory: "headset" } }),
      base({ key: "c", agent: "id3a:content-creator", label: "claude-work · id3a:content-creator", desk: 2, activity: "reading", tool: "Read",
        outfit: { role: "content-creator", color: "#E0832B", accessory: "notebook", computer: "laptop" } }),
      base({ key: "d", label: "claude · atlas", profile: "claude", desk: 4, status: "sleeping" }),
      base({ key: "e", label: "claude · deskmates", profile: "claude", desk: 5, status: "idle", tokens: { input: 10, output: 20, cacheWrite: 6_000_000 } }),
      base({ key: "f", parent: "a", agent: "Explore", label: "claude-work · Explore", desk: 3, activity: "reading",
        outfit: { role: "explore", accessory: "magnifier" } }),
    ],
  },
};

/**
 * A shared office: four PCs in order of arrival, each on its own island of four desks as the reducer seats them
 * (Jesús 0-3, Ana 4-6, Beto 8-9, Carla 12), so ten agents over two rooms. One subagent, two waiting.
 */
const PCS = [["pc-jesus", "Jesús"], ["pc-ana", "Ana"], ["pc-beto", "Beto"], ["pc-carla", "Carla"]] as const;
const pc = (i: number, p: Partial<ViewCharacter>) => {
  const [owner, ownerLabel] = PCS[i];
  const key = `${owner}:${p.key}`;
  return base({ ...p, key, parent: p.parent && `${owner}:${p.parent}`, owner, ownerName: ownerLabel, ownerLabel, ownerColor: OWNER_COLORS[i] });
};
export const shared: StateMessage = {
  type: "state", now: 0,
  state: {
    rooms: 2,
    characters: [
      pc(0, { key: "a", label: "claude · deskmates", desk: 0, tool: "Edit", detail: "render.ts" }),
      pc(0, { key: "b", label: "claude · atlas", desk: 1, activity: "reading", tool: "Read" }),
      pc(0, { key: "c", label: "claude · harbor", desk: 2, status: "waiting", tool: "Bash" }),
      pc(0, { key: "d", parent: "a", agent: "Explore", label: "claude · Explore", desk: 3, activity: "reading", outfit: { role: "explore", accessory: "magnifier" } }),
      pc(1, { key: "e", label: "claude · summit", desk: 4 }),
      pc(1, { key: "f", source: "codex", profile: "", label: "codex · api", desk: 5, activity: "reading", tool: "Read" }),
      pc(1, { key: "g", label: "claude · beacon", desk: 6, status: "idle" }),
      pc(2, { key: "h", label: "claude · meridian", desk: 8, status: "waiting", tool: "Bash" }),
      pc(2, { key: "i", label: "claude · site", desk: 9 }),
      pc(3, { key: "j", label: "claude · notes", desk: 12, activity: "reading", tool: "Grep" }),
    ],
  },
};

/**
 * The same office as a 24-desk server numbers it, on one Headquarters floor: owner k keeps desks 4k..4k+3 (the
 * desks above already follow that), so the four PCs sit on islands 0-3 and only the room count changes.
 */
export const sharedHeadquarters: StateMessage = { ...shared, state: { ...shared.state, rooms: 1 } };

const M = 60_000;
const at = (h: number, m = 0) => `2026-10-14T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000Z`;
/** A day of history, as GET /v1/history returns it (times in UTC; the test pins the time zone). */
export const historyDay: HistoryView = {
  date: "2026-10-14",
  sessions: [
    { key: "claude/claude-work/a", source: "claude", profile: "claude-work", agent: "id3a:designer", cwd: "/home/j/atlas", firstSeen: at(8, 40), lastSeen: at(12, 15), ended: true, workingMs: 142 * M, waitingMs: 9 * M, tools: 212, tokens: { input: 900, output: 48_000, cacheRead: 1_000_000 } },
    { key: "claude/claude-work/f", source: "claude", profile: "claude-work", agent: "Explore", parent: "claude/claude-work/a", cwd: "/home/j/atlas", firstSeen: at(9, 5), lastSeen: at(9, 30), ended: true, workingMs: 24 * M, waitingMs: 0, tools: 41, tokens: { input: 300, output: 6_100 } },
    { key: "claude/claude/d", source: "claude", profile: "claude", cwd: "/home/j/deskmates", firstSeen: at(10, 0), lastSeen: at(16, 48), ended: false, workingMs: 201 * M, waitingMs: 37 * M, tools: 388, tokens: { input: 2_100, output: 131_000 } },
    { key: "codex//r", source: "codex", cwd: "/home/j/harbor", firstSeen: at(13, 20), lastSeen: at(14, 5), ended: true, workingMs: 31 * M, waitingMs: 2 * M, tools: 57, tokens: { input: 12_000, output: 9_400 } },
    { key: "gemini//g", source: "gemini", cwd: "/home/j/summit-mobile-app", firstSeen: at(15, 10), lastSeen: at(15, 12), ended: true, workingMs: 40_000, waitingMs: 0, tools: 3 },
  ],
  totals: { sessions: 5, workingMs: (142 + 24 + 201 + 31) * M + 40_000, tokens: 900 + 48_000 + 300 + 6_100 + 2_100 + 131_000 + 12_000 + 9_400 },
  hours: [0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0],
};
