/** Normalized event every adapter and the ingest API produce (spec §4). */
export type EventKind = "start" | "tool" | "waiting" | "idle" | "end" | "usage";

export type Tokens = { input: number; output: number; cacheRead?: number; cacheWrite?: number };

export type AgentEvent = {
  source: string;
  profile?: string;
  session: string;
  parent?: string;
  agent?: string;
  /** the name the agent goes by in the office, apart from its role; the latest one wins */
  name?: string;
  /** the PC that relayed this event; set only by `serve --relay` */
  owner?: string;
  ownerName?: string;
  ownerHost?: string;
  /** the model it runs on, e.g. claude-opus-5-5; the latest one wins */
  model?: string;
  cwd?: string;
  kind: EventKind;
  tool?: string;
  detail?: string;
  tokens?: Tokens;
  ts: string;
  transport: "hook" | "transcript" | "api";
};

export type Status = "working" | "waiting" | "idle" | "sleeping" | "leaving";
export type Activity = "typing" | "reading";

export type Character = {
  key: string;
  source: string;
  profile?: string;
  session: string;
  parent?: string;
  agent?: string;
  name?: string;
  /** the PC that relayed this event; set only by `serve --relay` */
  owner?: string;
  ownerName?: string;
  ownerHost?: string;
  model?: string;
  cwd?: string;
  label: string;
  status: Status;
  activity: Activity;
  tool?: string;
  detail?: string;
  tokens?: Tokens;
  startedAt: string;
  /** ms epoch of the last event that touched this character */
  lastEventAt: number;
  /** ms epoch when the current stretch of work started; set while working */
  workingSince?: number;
  /** how long the last stretch of work lasted, set when it goes idle */
  workedMs?: number;
  /** ms epoch when it started leaving */
  leftAt?: number;
  /** global desk index (room = floor(desk / floor.desksPerRoom)); null once leaving */
  desk: number | null;
};

export type OfficeState = {
  characters: Record<string, Character>;
  /** rooms currently open; grows when desks run out, never below 1 */
  rooms: number;
  /** machine ids in order of first appearance; never shrinks */
  owners: string[];
  /** how the server numbers desks: desks per room, and desks reserved for one PC's agents in a shared office */
  floor: { desksPerRoom: number; islandSize: number };
};
