import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve, extname, sep } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import type { AgentEvent, Character, OfficeState } from "../types/events.ts";
import { reduce, tick, emptyState, keyOf } from "../core/reducer.ts";
import { CHARACTER_NAME, loadRoles, roleFor, type Outfit, type Role } from "../core/roles.ts";
import { fromHook } from "../adapters/claude/hook.ts";
import { UsageTracker, transcriptPathFor } from "../adapters/claude/usage.ts";
import type { Addresses } from "./lan-address.ts";
import { Dedup } from "./state.ts";
import { checkToken, parseBody, IngestError, RateLimits } from "./ingest.ts";
import { TranscriptWatcher, type TranscriptAdapter } from "../adapters/transcript.ts";
import { packageRoot, configDir } from "../root.ts";
import { floorNumbersOf, type FloorNumbers } from "./theme-floor.ts";
import { ancestorPids, defaultLister, defaultReader, findToolPid, parsePidHeader, TOOL_PROCESSES, type PpidReader, type ProcLister } from "./pids.ts";
import { applyEvent, emptyDay, isValidDate, localDate, roll, viewOf, type Day } from "../core/history.ts";
import { DebouncedSaver, loadDay } from "./history-store.ts";
import { defaultOwnersFile, loadOwners, saveOwners } from "./owners-store.ts";
import { ownerColor, ownerLabels } from "../core/owners.ts";
import { Relay, type RelayOptions } from "./relay.ts";

export const DEFAULT_PORT = 47821;
const MAX_BODY = 64 * 1024;
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".png": "image/png", ".json": "application/json", ".svg": "image/svg+xml", ".wav": "audio/wav", ".ico": "image/x-icon",
};

/** `pids`: the agent's process and its ancestors, sent only to clients on this machine (the VS Code panel uses it to find the terminal). */
/** A PNG whose header says 112x96: the character sheet format (7 frames of 16x32 in 3 rows). */
export function isCharacterSheet(png: Buffer): boolean {
  const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.length < 24 || !SIG.every((b, i) => png[i] === b) || png.toString("latin1", 12, 16) !== "IHDR") return false;
  return png.readUInt32BE(16) === 112 && png.readUInt32BE(20) === 96;
}

export type ViewCharacter = Character & { outfit?: Outfit; pids?: number[]; ownerLabel?: string; ownerColor?: string };
/** `deal` turns the order characters are dealt in; pages built without it (tests, demos) deal from 0. */
export type StateMessage = { type: "state"; now: number; state: { rooms: number; deal?: number; characters: ViewCharacter[] } };
export type LastEvent = { at: string; source?: string; profile?: string; decoded: boolean };

export type Options = {
  port?: number; host?: string; webDir: string; assetsDir?: string; rolesFile?: string;
  /** your own character sheets (`<name>.png`, 112x96 like the bundled ones); default ~/.config/deskmates/characters */
  charactersDir?: string; usageDelayMs?: number;
  /** your own themes (`<id>/theme.json` and its art), listed after the bundled ones; default ~/.config/deskmates/themes */
  themesDir?: string;
  /** bearer token for POST /v1/events; the ingest API is off without it */
  token?: string;
  /** listen on the network: every request from another machine must carry the token */
  lan?: boolean;
  /** a shared office: no local sources, quiet page */
  shared?: boolean;
  /** forward every event this office keeps to a shared office on another machine */
  relay?: RelayOptions;
  /** where the order of owners is kept; default $XDG_STATE_HOME|~/.local/state + /deskmates/shared.json */
  ownersFile?: string;
  /** the addresses of this machine, ranked by the CLI and read on every GET /v1/lan, so a network that comes up later shows; the server never reads the interfaces itself */
  addresses?: () => Addresses;
  /** transcript-based adapters to watch (Codex, Copilot, Cursor, Gemini…) */
  transcripts?: TranscriptAdapter[];
  transcriptIntervalMs?: number;
  /** default office theme for pages that have not picked one; a shared office defaults to Headquarters */
  theme?: string;
  /** how desks are numbered; default: from the layout of `theme` (or Headquarters when shared), else 8 desks and islands of 4 */
  floor?: FloorNumbers;
  /** how to read a process's parent pid (tests inject a fake /proc) */
  ppidReader?: PpidReader;
  /** lists running processes of the transcript tools, to find the terminal of their sessions */
  procLister?: ProcLister;
  /** how often sessions of those tools without a process are looked up again (ms) */
  procScanMs?: number;
  /** how often every open page gets a ping, so it can tell a dead connection from a quiet office; default 20 s */
  heartbeatMs?: number;
  /** where each day's history is kept (YYYY-MM-DD.json); without it, history lives in memory only */
  historyDir?: string;
  historySaveMs?: number;
  /** picks where character dealing starts (tests make it predictable) */
  dealer?: () => number;
};
export type Running = { port: number; state: () => OfficeState; close: () => Promise<void> };

/**
 * The name in x-deskmates-name. Header values reach Node as latin1, and the hook sends the shell's UTF-8 as is:
 * decoded back so "Sofía" stays Sofía. Control characters out, at most 40 characters, like the ingest API.
 */
export function hookName(v: string | string[] | undefined): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = Buffer.from(v, "latin1").toString("utf8").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return s ? [...s].slice(0, 40).join("") : undefined;
}

const isLoopback = (a?: string) => a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";

function readBody(req: IncomingMessage): Promise<Buffer | "too-large"> {
  return new Promise((ok, fail) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) { req.removeAllListeners("data"); req.resume(); ok("too-large"); return; }
      chunks.push(c);
    });
    req.on("end", () => ok(Buffer.concat(chunks)));
    req.on("error", fail);
  });
}

async function serveFile(root: string, urlPath: string, res: ServerResponse): Promise<boolean> {
  let p: string;
  try { p = decodeURIComponent(urlPath.split("?")[0]); } catch { return false; }
  if (p.endsWith("/")) p += "index.html";
  const base = resolve(root);
  const file = resolve(join(base, p));
  if (file !== base && !file.startsWith(base + sep)) return false;
  try {
    if (!(await stat(file)).isFile()) return false;
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-cache" });
    res.end(body);
    return true;
  } catch { return false; }
}

const THEME_ID = /^[a-z0-9-]{1,30}$/;
/** Themes of your own: folders of themesDir with a theme.json, under an id no bundled theme has. */
async function userThemes(dir: string, bundled: string[]): Promise<string[]> {
  let names: string[];
  try { names = await readdir(dir); } catch { return []; }
  const ids: string[] = [];
  for (const n of names.sort()) {
    if (!THEME_ID.test(n) || bundled.includes(n)) continue;
    try { if ((await stat(join(dir, n, "theme.json"))).isFile()) ids.push(n); } catch { /* not a theme */ }
  }
  return ids;
}

const COOKIE = "deskmates_token";
function cookieToken(header?: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

export async function startServer(opts: Options): Promise<Running> {
  if (opts.lan && !opts.token) throw new Error("LAN mode needs a token");
  if (opts.shared && !opts.token) throw new Error("a shared office needs a token");
  const ownersFile = opts.shared ? opts.ownersFile ?? defaultOwnersFile() : undefined;
  const host = opts.host ?? (opts.lan ? "0.0.0.0" : "127.0.0.1");
  /** Localhost is always trusted; from the network, the token comes as ?token=, a cookie, or a Bearer header. */
  const remoteAllowed = (req: IncomingMessage): boolean => {
    if (isLoopback(req.socket.remoteAddress)) return true;
    if (!opts.lan || !opts.token) return false;
    const q = new URL(req.url ?? "/", "http://x").searchParams.get("token");
    const given = q ?? cookieToken(req.headers.cookie) ?? /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1];
    return !!given && checkToken(`Bearer ${given}`, opts.token);
  };
  /** A browser always says which page opened the socket; only the office's own page may read it (any site can reach 127.0.0.1). */
  const ownPage = (req: IncomingMessage): boolean => {
    const origin = req.headers.origin;
    if (origin === undefined) return true;
    try { return new URL(origin).host === req.headers.host; } catch { return false; }
  };
  const roles: Role[] = loadRoles(opts.rolesFile ?? join(configDir(), "roles.toml"));
  const assetsDir = opts.assetsDir ?? join(packageRoot(), "assets");
  const themesDir = opts.themesDir ?? join(configDir(), "themes");
  const bundledIndex = async () => JSON.parse(await readFile(join(assetsDir, "themes", "index.json"), "utf8")) as { default: string; themes: string[] };
  const usage = new UsageTracker();
  const dedup = new Dedup();
  const pending = new Map<string, NodeJS.Timeout>();
  // the theme this office serves (Headquarters for a shared one by default) opens the page and numbers the desks
  const theme = opts.theme ?? (opts.shared ? "headquarters" : undefined);
  const floor = opts.floor ?? floorNumbersOf(theme, assetsDir);
  let state = emptyState(ownersFile ? loadOwners(ownersFile) : [], floor);
  /** PCs with an agent not yet leaving, i.e. heard from in the last 30 minutes; `state.owners` keeps every PC ever seen */
  const liveOwners = () => new Set(Object.values(state.characters).filter((c) => c.owner && c.status !== "leaving").map((c) => c.owner)).size;
  let lastEvent: LastEvent | undefined;
  const saver = opts.historyDir ? new DebouncedSaver(opts.historyDir, opts.historySaveMs ?? 10_000, (e) => console.error("deskmates: could not save history:", e)) : undefined;
  let day: Day = (opts.historyDir && loadDay(opts.historyDir, localDate(Date.now()))) || emptyDay(localDate(Date.now()));
  /** At midnight the finished day is written at once and a new one starts. */
  const rollDay = (now: number) => {
    const r = roll(day, now);
    if (!r.closed) return;
    day = r.day;
    saver?.saveNow(r.closed);
    saver?.schedule(day);
  };

  /** session key → its process ancestry, resolved once per session from the hook's x-deskmates-ppid */
  const pids = new Map<string, number[]>();
  const ppidReader = opts.ppidReader ?? defaultReader();
  const trackPids = (key: string, pid: number | undefined) => {
    if (pid === undefined || pids.has(key)) return;
    pids.set(key, []); // claimed: resolve only once, never block the request
    ancestorPids(pid, ppidReader).then((list) => {
      if (!pids.has(key) || list.length === 0) return;
      pids.set(key, list);
      if (state.characters[key]) broadcast();
    }, () => {});
  };

  /**
   * Tools watched through transcripts send no pid: look for the tool's process running in the session's folder.
   * Only sessions still without one are looked up, all with a single process listing.
   */
  const procLister = opts.procLister ?? defaultLister();
  let scanning = false;
  const findToolPids = async () => {
    const todo = Object.values(state.characters).filter((c) => TOOL_PROCESSES[c.source] && c.cwd && c.status !== "leaving" && !pids.has(c.key));
    if (!todo.length || scanning) return;
    scanning = true;
    try {
      const procs = await procLister([...new Set(todo.flatMap((c) => TOOL_PROCESSES[c.source]))]);
      for (const c of todo) trackPids(c.key, findToolPid(c.source, c.cwd!, procs));
    } catch { /* try again on the next round */ } finally { scanning = false; }
  };
  const procTimer = setInterval(() => void findToolPids(), opts.procScanMs ?? 5000);
  procTimer.unref();

  /** `local`: the client is on this machine; only then does it get pids. */
  const view = (local: boolean): StateMessage => {
    const labels = ownerLabels(Object.values(state.characters));
    return {
    type: "state", now: Date.now(),
    state: {
      rooms: state.rooms,
      deal,
      characters: Object.values(state.characters).map((c) => {
        const v: ViewCharacter = { ...c, outfit: roleFor(roles, c.agent) };
        if (c.owner) { v.ownerLabel = labels.get(c.owner); v.ownerColor = ownerColor(state.owners, c.owner); }
        const p = local ? pids.get(c.key) : undefined;
        if (p?.length) v.pids = p;
        return v;
      }),
    },
    };
  };
  /** socket → is it a loopback client */
  const sockets = new Map<WebSocket, boolean>();
  const broadcast = () => {
    const msg: Partial<Record<"true" | "false", string>> = {};
    for (const [s, local] of sockets) {
      if (s.readyState !== WebSocket.OPEN) continue;
      s.send(msg[`${local}`] ??= JSON.stringify(view(local)));
    }
  };

  // whoever walks into an empty office starts a new deal, so the first agent is not always the same character;
  // while anyone is in, it holds, so nobody changes face and a full room still shows each character once
  const dealer = opts.dealer ?? (() => Math.floor(Math.random() * 1_000_000));
  let deal = dealer();
  const relay = opts.relay ? new Relay(opts.relay, () => state) : undefined;
  const relayTimer = relay ? setInterval(() => void relay.flush(), opts.relay?.batchMs ?? 250) : undefined;
  relayTimer?.unref();
  const apply = (events: AgentEvent[]) => {
    if (!Object.keys(state.characters).length) deal = dealer();
    const before = state;
    const dayBefore = day;
    rollDay(Date.now());
    for (const e of events) if (dedup.keep(e)) { state = reduce(state, e); day = applyEvent(day, e); relay?.push(e); }
    if (ownersFile && state.owners.length > before.owners.length) { try { saveOwners(ownersFile, state.owners); } catch { /* the order is a convenience; keep serving */ } }
    if (state !== before) broadcast();
    if (day !== dayBefore) saver?.schedule(day);
  };

  /** Token totals live in the transcript, not the hook payload: read it shortly after each hook. */
  const scheduleUsage = (payload: Record<string, unknown>, ev: AgentEvent) => {
    const path = transcriptPathFor(payload);
    if (!path) return;
    const key = keyOf(ev);
    clearTimeout(pending.get(key));
    pending.set(key, setTimeout(async () => {
      pending.delete(key);
      const tokens = await usage.update(key, path).catch(() => undefined);
      const model = usage.takeModel(key);
      if (tokens || model) apply([{ ...ev, kind: "usage", tokens, model, ts: new Date().toISOString(), transport: "transcript", tool: undefined, detail: undefined }]);
      if (ev.kind === "end") usage.forget(key);
    }, opts.usageDelayMs ?? 400));
  };

  const server = createServer(async (req, res) => {
    try {
      const url = (req.url ?? "/").split("?")[0];
      if (!remoteAllowed(req)) { res.writeHead(401, { "content-type": "text/plain" }).end("deskmates: open the link with ?token=… shown by `deskmates serve --lan`"); return; }
      if (!isLoopback(req.socket.remoteAddress) && opts.token && (new URL(req.url ?? "/", "http://x").searchParams.has("token") || cookieToken(req.headers.cookie))) {
        // remember the token so the page, its assets and the WebSocket work without it in every URL;
        // every request renews it, so a page that keeps fetching never sees it expire
        res.setHeader("set-cookie", `${COOKIE}=${encodeURIComponent(opts.token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000`);
      }
      if (url === "/v1/hook/claude") {
        if (req.method !== "POST") { res.writeHead(405, { allow: "POST" }).end(); return; }
        if (!isLoopback(req.socket.remoteAddress)) { res.writeHead(403).end(); return; }
        const body = await readBody(req);
        if (body === "too-large") { res.writeHead(413).end(); return; }
        let payload: unknown;
        try { payload = JSON.parse(body.toString("utf8")); } catch { res.writeHead(400).end("invalid JSON"); return; }
        const named = hookName(req.headers["x-deskmates-name"]);
        // DESKMATES_NAME names the session it was set for; its subagents share the hook and the environment, not the name
        const events = fromHook(payload, new Date().toISOString()).map((e) => (named && !e.parent ? { ...e, name: named } : e));
        lastEvent = { at: new Date().toISOString(), source: events[0]?.source, profile: events[0]?.profile, decoded: events.length > 0 };
        apply(events);
        if (events[0]) trackPids(keyOf(events[0]), parsePidHeader(req.headers["x-deskmates-ppid"]));
        if (events[0]) scheduleUsage(payload as Record<string, unknown>, events[0]);
        res.writeHead(204).end();
        return;
      }
      if (url === "/v1/events") {
        if (req.method !== "POST") { res.writeHead(405, { allow: "POST" }).end(); return; }
        if (!opts.token) { res.writeHead(404).end(); return; }
        if (!checkToken(req.headers.authorization, opts.token)) { res.writeHead(401, { "www-authenticate": "Bearer" }).end(); return; }
        const body = await readBody(req);
        if (body === "too-large") { res.writeHead(413).end(); return; }
        try {
          let parsed: unknown;
          try { parsed = JSON.parse(body.toString("utf8")); } catch { throw new IngestError(400, "invalid JSON"); }
          const events = parseBody(parsed);
          if (events.some((e) => e.owner !== events[0].owner)) throw new IngestError(400, "events must share one owner");
          if (!rate.take(events[0].owner ?? "token", events.length)) throw new IngestError(429, "rate limit: 600 events per minute");
          lastEvent = { at: new Date().toISOString(), source: events[0].source, profile: events[0].profile, decoded: true };
          apply(events);
          res.writeHead(202, { "content-type": "application/json" }).end(JSON.stringify({ accepted: events.length }));
        } catch (e) {
          const err = e instanceof IngestError ? e : new IngestError(400, "invalid events");
          res.writeHead(err.status, { "content-type": "application/json" }).end(JSON.stringify({ error: err.message }));
        }
        return;
      }
      if (url.startsWith("/v1/characters/")) {
        if (req.method !== "GET") { res.writeHead(405, { allow: "GET" }).end(); return; }
        const m = /^\/v1\/characters\/([^/]+)\.png$/.exec(url);
        if (!m || !CHARACTER_NAME.test(m[1])) { res.writeHead(404).end(); return; }
        let png: Buffer;
        try { png = await readFile(join(opts.charactersDir ?? join(configDir(), "characters"), `${m[1]}.png`)); } catch { res.writeHead(404).end(); return; }
        if (!isCharacterSheet(png)) { res.writeHead(422, { "content-type": "text/plain" }).end("deskmates: a character sheet is a 112x96 PNG (7 frames of 16x32 in 3 rows)"); return; }
        res.writeHead(200, { "content-type": "image/png", "cache-control": "no-cache" }).end(png);
        return;
      }
      if (url === "/v1/config") {
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ theme: theme ?? null, shared: !!opts.shared, floor }));
        return;
      }
      if (url === "/v1/lan") {
        if (req.method !== "GET") { res.writeHead(405, { allow: "GET" }).end(); return; }
        const { primary, alternatives } = opts.addresses?.() ?? { primary: null, alternatives: [] };
        // A page that rebinds its own name to 127.0.0.1 arrives from loopback but with a foreign Host: it gets no token.
        const hostName = (req.headers.host ?? "").replace(/:\d*$/, "").replace(/^\[(.*)\]$/, "$1").toLowerCase();
        const local = !isLoopback(req.socket.remoteAddress) || ["127.0.0.1", "localhost", "::1"].includes(hostName);
        const body = { lan: !!opts.lan, port: req.socket.localPort ?? opts.port ?? DEFAULT_PORT, primary, alternatives, token: opts.lan && local ? opts.token ?? null : null };
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(body));
        return;
      }
      if (url === "/v1/history") {
        if (req.method !== "GET") { res.writeHead(405, { allow: "GET" }).end(); return; }
        const now = Date.now();
        rollDay(now);
        const asked = new URL(req.url ?? "/", "http://x").searchParams.get("date");
        const json = (status: number, body: unknown) => res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(body));
        if (asked !== null && !isValidDate(asked)) { json(400, { error: "date must be YYYY-MM-DD" }); return; }
        const date = asked ?? day.date;
        if (date === day.date) { json(200, viewOf(day, now)); return; }
        const stored = opts.historyDir ? loadDay(opts.historyDir, date) : undefined;
        if (!stored) { json(404, { error: "no history for that date" }); return; }
        json(200, viewOf(stored));
        return;
      }
      if (url === "/healthz") {
        res.writeHead(200, { "content-type": "application/json" })
          .end(JSON.stringify({ ok: true, characters: Object.keys(state.characters).length, owners: liveOwners(), lastEvent }));
        return;
      }
      if (req.method === "GET" && url.split("?")[0] === "/assets/themes/index.json") {
        // the bundled themes, then yours, read again on every page load so a new folder shows up without a restart
        const index = await bundledIndex();
        const user = await userThemes(themesDir, index.themes);
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-cache" })
          .end(JSON.stringify({ ...index, themes: [...index.themes, ...user], user }));
        return;
      }
      if (req.method === "GET" && url.startsWith("/assets/") && (await serveFile(assetsDir, url.slice("/assets".length), res))) return;
      // a theme of your own is served where a bundled one would be, so its theme.json is written the same way
      const own = /^\/assets\/themes\/([^/?]+)\//.exec(url);
      if (req.method === "GET" && own && THEME_ID.test(own[1]) && !(await bundledIndex()).themes.includes(own[1])
        && (await serveFile(themesDir, url.slice("/assets/themes".length), res))) return;
      if (req.method === "GET" && (await serveFile(opts.webDir, url, res))) return;
      res.writeHead(404).end();
    } catch {
      if (!res.headersSent) res.writeHead(500).end();
    }
  });

  const wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (ws, req) => {
    if (!remoteAllowed(req) || !ownPage(req)) { ws.close(1008); return; }
    const local = isLoopback(req.socket.remoteAddress);
    sockets.set(ws, local);
    ws.on("close", () => sockets.delete(ws));
    ws.on("error", () => sockets.delete(ws));
    ws.send(JSON.stringify(view(local)));
  });

  const rate = new RateLimits();
  const watcher = opts.transcripts?.length
    ? new TranscriptWatcher(opts.transcripts, (events) => apply(events), { intervalMs: opts.transcriptIntervalMs })
    : undefined;
  watcher?.start();

  const heartbeat = setInterval(() => { for (const s of sockets.keys()) s.send('{"type":"ping"}'); }, opts.heartbeatMs ?? 20_000);
  heartbeat.unref();

  const timer = setInterval(() => {
    const next = tick(state, Date.now());
    if (next !== state) {
      state = next;
      for (const k of pids.keys()) if (!state.characters[k]) pids.delete(k);
      broadcast();
    }
    rollDay(Date.now());
  }, 1000);
  timer.unref();

  // ws re-emits the http server's errors; without a listener a busy port would throw past the promise below
  wss.on("error", () => {});
  try {
    await new Promise<void>((ok, fail) => { server.once("error", fail); server.listen(opts.port ?? DEFAULT_PORT, host, () => ok()); });
  } catch (e) {
    clearInterval(timer); clearInterval(heartbeat); clearInterval(procTimer); clearInterval(relayTimer);
    watcher?.stop();
    throw e;
  }
  const addr = server.address();
  return {
    port: typeof addr === "object" && addr ? addr.port : opts.port ?? DEFAULT_PORT,
    state: () => state,
    close: async () => {
      clearInterval(timer); clearInterval(heartbeat); clearInterval(procTimer); clearInterval(relayTimer);
      watcher?.stop();
      // the shared office learns these sessions are gone; best effort, at most a second
      await relay?.close(state).catch(() => {});
      for (const t of pending.values()) clearTimeout(t);
      saver?.flush();
      for (const s of sockets.keys()) s.terminate();
      await new Promise<void>((ok) => wss.close(() => server.close(() => ok())));
    },
  };
}
