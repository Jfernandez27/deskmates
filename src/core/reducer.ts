import type { AgentEvent, Character, OfficeState, Activity } from "../types/events.ts";
import { assignDesk, compact, roomsFor, islandOf } from "./desks.ts";

export const SLEEP_AFTER_MS = 10 * 60_000;
export const LEAVE_AFTER_MS = 30 * 60_000;
/** time a leaving character stays so the page can walk it out */
export const REMOVE_AFTER_MS = 10_000;

/** Tools that only look at things, across CLIs (compared lowercase). Everything else counts as typing. */
const READING_TOOLS = new Set([
  "read", "grep", "glob", "ls", "webfetch", "websearch", "notebookread", "toolsearch",
  "view", "read_file", "read_many_files", "list_directory", "search_file_content", "web_fetch", "google_web_search",
]);

export const emptyState = (owners: string[] = [], floor = { desksPerRoom: 8, islandSize: 4 }): OfficeState =>
  ({ characters: {}, rooms: 1, owners, floor });

export const keyOf = (e: { source: string; profile?: string; session: string; owner?: string }) =>
  `${e.owner ? `${e.owner}:` : ""}${e.source}/${e.profile ?? ""}/${e.session}`;

const basename = (p?: string) => (p ? p.replace(/\/+$/, "").split("/").pop() || p : "");

function labelFor(e: { source: string; profile?: string; agent?: string; name?: string; cwd?: string }): string {
  const left = e.profile ?? e.source;
  const right = e.name ?? e.agent ?? basename(e.cwd);
  return right ? `${left} · ${right}` : left;
}

const activityFor = (tool?: string): Activity => (tool && READING_TOOLS.has(tool.toLowerCase()) ? "reading" : "typing");

function create(state: OfficeState, e: AgentEvent, t: number): Character {
  const parentKey = e.parent ? keyOf({ ...e, session: e.parent }) : undefined;
  const parentDesk = parentKey ? state.characters[parentKey]?.desk : undefined;
  return {
    key: keyOf(e),
    source: e.source,
    profile: e.profile,
    session: e.session,
    parent: parentKey,
    agent: e.agent,
    name: e.name,
    cwd: e.cwd,
    label: labelFor(e),
    status: "working",
    activity: "typing",
    startedAt: e.ts,
    lastEventAt: t,
    workingSince: t,
    desk: assignDesk(state, parentDesk ?? undefined, e.owner ? islandOf(state, e.owner) : undefined),
    owner: e.owner,
    ownerName: e.ownerName,
    ownerHost: e.ownerHost,
  };
}

function withCharacter(state: OfficeState, c: Character): OfficeState {
  const next = { ...state, characters: { ...state.characters, [c.key]: c } };
  const packed = compact(next);
  return { ...packed, rooms: roomsFor(packed) };
}

/** Pure: applies one event. Events older than the character's last event are ignored. */
export function reduce(state: OfficeState, e: AgentEvent): OfficeState {
  const t = Date.parse(e.ts);
  const key = keyOf(e);
  let c = state.characters[key];

  if (!c) {
    if (e.kind === "usage" || e.kind === "end") return state;
    if (e.owner && !state.owners.includes(e.owner)) state = { ...state, owners: [...state.owners, e.owner] };
    c = create(state, e, t);
  } else if (t < c.lastEventAt) {
    return state;
  } else if (c.status === "leaving" && e.kind !== "usage") {
    if (e.kind !== "start") return state;
    c = create(state, e, t);
  }

  c = { ...c, lastEventAt: Math.max(c.lastEventAt, t) };
  if (e.agent && !c.agent) c = { ...c, agent: e.agent, label: c.name ? c.label : labelFor({ ...c, agent: e.agent }) };
  if (e.cwd && !c.cwd) c = { ...c, cwd: e.cwd, label: c.agent || c.name ? c.label : labelFor({ ...c, cwd: e.cwd }) };
  if (e.name && e.name !== c.name) c = { ...c, name: e.name, label: labelFor({ ...c, name: e.name }) };
  if (e.ownerName && e.ownerName !== c.ownerName) c = { ...c, ownerName: e.ownerName };
  if (e.ownerHost && e.ownerHost !== c.ownerHost) c = { ...c, ownerHost: e.ownerHost };
  if (e.model && e.model !== c.model) c = { ...c, model: e.model };

  const resume = (x: Character): Character =>
    x.status === "working" ? x : { ...x, status: "working", workingSince: t, workedMs: undefined };

  switch (e.kind) {
    case "start":
      c = resume(c);
      break;
    case "tool":
      c = e.tool
        ? { ...resume(c), tool: e.tool, detail: e.detail, activity: activityFor(e.tool) }
        : resume(c);
      break;
    case "waiting":
      c = { ...c, status: "waiting" };
      break;
    case "idle":
      c = { ...c, status: "idle", workedMs: c.workingSince !== undefined ? t - c.workingSince : c.workedMs, workingSince: undefined };
      break;
    case "end":
      c = { ...c, status: "leaving", leftAt: t, desk: null };
      break;
    case "usage":
      if (e.tokens) c = { ...c, tokens: e.tokens };
      break;
  }
  return withCharacter(state, c);
}

/** Pure: applies the silence rules at time `now` (ms epoch). */
export function tick(state: OfficeState, now: number): OfficeState {
  let changed = false;
  const characters: Record<string, Character> = {};
  for (const [k, c] of Object.entries(state.characters)) {
    if (c.status === "leaving") {
      if (now - (c.leftAt ?? c.lastEventAt) > REMOVE_AFTER_MS) { changed = true; continue; }
      characters[k] = c;
    } else if (now - c.lastEventAt > LEAVE_AFTER_MS) {
      characters[k] = { ...c, status: "leaving", leftAt: now, desk: null }; changed = true;
    } else if (now - c.lastEventAt > SLEEP_AFTER_MS && c.status !== "sleeping" && c.status !== "waiting") {
      // a waiting agent keeps its ? however long you take: it is not idle, it needs you
      characters[k] = { ...c, status: "sleeping" }; changed = true;
    } else characters[k] = c;
  }
  if (!changed) return state;
  const next = { ...state, characters };
  const packed = compact(next);
  return { ...packed, rooms: roomsFor(packed) };
}
