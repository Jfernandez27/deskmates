import { test, expect, afterEach, describe, vi } from "vitest";
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import { startServer, type Running, type StateMessage } from "../../src/server/server.ts";
import { OWNER_COLORS } from "../../src/core/owners.ts";
import { floorNumbersOf } from "../../src/server/theme-floor.ts";

let srv: Running | undefined;
afterEach(async () => { await srv?.close(); srv = undefined; });

const fixtures = (name: string) =>
  readFileSync(new URL(`../fixtures/claude/${name}.jsonl`, import.meta.url), "utf8").trim().split("\n");

async function boot(dealer?: () => number) {
  const web = mkdtempSync(join(tmpdir(), "dm-web-"));
  writeFileSync(join(web, "index.html"), "<!doctype html><title>deskmates</title>");
  mkdirSync(join(web, "sub"));
  writeFileSync(join(web, "sub", "a.js"), "export {}");
  srv = await startServer({ port: 0, webDir: web, usageDelayMs: 10, dealer });
  return `http://127.0.0.1:${srv.port}`;
}
const post = (url: string, body: string) =>
  fetch(`${url}/v1/hook/claude`, { method: "POST", headers: { "content-type": "application/json" }, body });

test("hook POSTs build the office; /healthz reports it", async () => {
  const url = await boot();
  for (const l of fixtures("named-agent").slice(0, 2)) expect((await post(url, l)).status).toBe(204);
  const h = await (await fetch(`${url}/healthz`)).json();
  expect(h).toMatchObject({ ok: true, characters: 1 });
  expect(h.lastEvent).toMatchObject({ source: "claude", profile: "claude-work", decoded: true });
  const c = Object.values(srv!.state().characters)[0];
  expect(c).toMatchObject({ label: "claude-work · id3a:designer", status: "working" });
});

test("websocket gets a snapshot and then updates with outfits", async () => {
  const url = await boot();
  const ws = new WebSocket(url.replace("http", "ws") + "/ws");
  const msgs: any[] = [];
  ws.on("message", (d) => msgs.push(JSON.parse(String(d))));
  await new Promise((r) => ws.on("open", r));
  await new Promise((r) => setTimeout(r, 50));
  expect(msgs[0]).toMatchObject({ type: "state", state: { characters: [] } });
  await post(url, fixtures("named-agent")[0]);
  await new Promise((r) => setTimeout(r, 50));
  const last = msgs.at(-1);
  expect(last.state.characters[0]).toMatchObject({ agent: "id3a:designer", outfit: { role: "designer", accessory: "beret" } });
  ws.close();
});

test("websocket: another site's page cannot read the office (Origin must be the office itself)", async () => {
  const url = await boot();
  const first = (origin?: string) => new Promise<string>((ok) => {
    const ws = new WebSocket(url.replace("http", "ws") + "/ws", origin ? { origin } : {});
    ws.on("message", (d) => { ok(JSON.parse(String(d)).type); ws.close(); });
    ws.on("close", (code) => ok(`closed ${code}`));
    ws.on("error", () => ok("error"));
  });
  expect(await first("https://evil.example")).toBe("closed 1008");
  expect(await first(`http://localhost:${srv!.port}`)).toBe("closed 1008");
  expect(await first(url)).toBe("state");
  expect(await first()).toBe("state");
});

test("someone walking into an empty office starts a new deal, which holds while anyone is in", async () => {
  const deals = [5, 9, 13];
  const url = await boot(() => deals.shift()!);
  const ws = new WebSocket(url.replace("http", "ws") + "/ws");
  const msgs: any[] = [];
  ws.on("message", (d) => msgs.push(JSON.parse(String(d))));
  await new Promise((r) => ws.on("open", r));
  await new Promise((r) => setTimeout(r, 50));
  expect(msgs[0].state.deal).toBe(5);
  const [first, second] = fixtures("named-agent");
  await post(url, first);
  await new Promise((r) => setTimeout(r, 50));
  expect(msgs.at(-1).state).toMatchObject({ deal: 9, characters: [{}] });
  await post(url, second);
  await new Promise((r) => setTimeout(r, 50));
  expect(msgs.at(-1).state.deal, "the deal moved with someone in").toBe(9);
  ws.close();
});

test("bad input never crashes the server", async () => {
  const url = await boot();
  expect((await post(url, "{not json")).status).toBe(400);
  expect((await post(url, "a".repeat(70_000))).status).toBe(413);
  expect((await post(url, JSON.stringify({ hook_event_name: "PreCompact" }))).status).toBe(204);
  expect((await fetch(`${url}/v1/hook/claude`)).status).toBe(405);
  expect((await fetch(`${url}/healthz`)).status).toBe(200);
});

test("serves the web app and refuses path traversal", async () => {
  const url = await boot();
  expect(await (await fetch(url + "/")).text()).toContain("deskmates");
  expect((await fetch(url + "/sub/a.js")).headers.get("content-type")).toMatch(/javascript/);
  expect((await fetch(url + "/..%2f..%2fetc%2fpasswd")).status).toBe(404);
  expect((await fetch(url + "/nope.js")).status).toBe(404);
});

test("themes of your own are listed after the bundled ones and served where a bundled theme would be", async () => {
  const web = mkdtempSync(join(tmpdir(), "dm-web-"));
  const themesDir = mkdtempSync(join(tmpdir(), "dm-themes-"));
  for (const id of ["beach", "cozy", "Not_An_Id", "empty"]) mkdirSync(join(themesDir, id));
  writeFileSync(join(themesDir, "beach", "theme.json"), '{"id":"beach"}');
  writeFileSync(join(themesDir, "beach", "SAND.png"), "png");
  writeFileSync(join(themesDir, "cozy", "theme.json"), '{"id":"cozy"}'); // a bundled id: the bundled theme wins
  writeFileSync(join(themesDir, "cozy", "MINE.png"), "png");
  writeFileSync(join(themesDir, "Not_An_Id", "theme.json"), "{}");
  srv = await startServer({ port: 0, webDir: web, themesDir });
  const url = `http://127.0.0.1:${srv.port}/assets/themes`;
  const index = await (await fetch(`${url}/index.json`)).json();
  expect(index.default).toBe("day");
  expect(index.user).toEqual(["beach"]);
  expect(index.themes.slice(-2)).toEqual(["headquarters", "beach"]);
  expect(await (await fetch(`${url}/beach/theme.json`)).json()).toEqual({ id: "beach" });
  expect((await fetch(`${url}/beach/SAND.png`)).headers.get("content-type")).toBe("image/png");
  expect((await (await fetch(`${url}/cozy/theme.json`)).json()).label).toBe("Cozy");
  expect((await fetch(`${url}/cozy/MINE.png`)).status).toBe(404);
  expect((await fetch(`${url}/beach/..%2f..%2f..%2fetc%2fpasswd`)).status).toBe(404);
});

test("without a themes folder only the bundled themes are listed", async () => {
  srv = await startServer({ port: 0, webDir: mkdtempSync(join(tmpdir(), "dm-web-")), themesDir: join(tmpdir(), "dm-no-such-dir") });
  const index = await (await fetch(`http://127.0.0.1:${srv.port}/assets/themes/index.json`)).json();
  expect(index.user).toEqual([]);
  expect(index.themes).toContain("day");
});

test("token usage is read from the transcript after a hook", async () => {
  const url = await boot();
  const dir = mkdtempSync(join(tmpdir(), "dm-tr-"));
  const tp = join(dir, ".claude-work", "projects", "p", "S.jsonl");
  mkdirSync(join(dir, ".claude-work", "projects", "p"), { recursive: true });
  writeFileSync(tp, readFileSync(new URL("../fixtures/claude/transcript-usage.jsonl", import.meta.url)));
  await post(url, JSON.stringify({ hook_event_name: "SessionStart", session_id: "S", transcript_path: tp, cwd: "/p" }));
  await post(url, JSON.stringify({ hook_event_name: "Stop", session_id: "S", transcript_path: tp, cwd: "/p" }));
  await new Promise((r) => setTimeout(r, 150));
  expect(Object.values(srv!.state().characters)[0].tokens).toEqual({ input: 6, output: 386, cacheRead: 234049, cacheWrite: 41717 });
});

describe("GET /v1/history", () => {
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  async function bootWithHistory(dir: string) {
    const web = mkdtempSync(join(tmpdir(), "dm-web-"));
    writeFileSync(join(web, "index.html"), "x");
    srv = await startServer({ port: 0, webDir: web, historyDir: dir, historySaveMs: 20 });
    return `http://127.0.0.1:${srv.port}`;
  }

  test("today comes from memory, is saved to disk without contents, and is loaded on the next start", async () => {
    const dir = join(mkdtempSync(join(tmpdir(), "dm-h-")), "history");
    let url = await bootWithHistory(dir);
    await post(url, JSON.stringify({ hook_event_name: "SessionStart", session_id: "H1", cwd: "/home/j/atlas" }));
    await post(url, JSON.stringify({ hook_event_name: "PreToolUse", session_id: "H1", cwd: "/home/j/atlas", tool_name: "Bash", tool_input: { command: "echo hush-secret" } }));
    const res = await fetch(`${url}/v1/history`);
    expect(res.status).toBe(200);
    const h = await res.json();
    expect(h.date).toBe(today());
    expect(h.hours).toHaveLength(24);
    expect(h.totals).toMatchObject({ sessions: 1 });
    expect(h.sessions[0]).toMatchObject({ source: "claude", cwd: "/home/j/atlas", tools: 1, ended: false });
    expect(JSON.stringify(h)).not.toContain("hush-secret");
    expect((await fetch(`${url}/v1/history?date=${today()}`)).status).toBe(200);
    await srv!.close(); srv = undefined;
    const file = readFileSync(join(dir, `${today()}.json`), "utf8");
    expect(file).not.toContain("hush-secret");
    expect(file).not.toContain("Bash");
    url = await bootWithHistory(dir);
    expect((await (await fetch(`${url}/v1/history`)).json()).sessions[0]).toMatchObject({ cwd: "/home/j/atlas", tools: 1 });
  });

  test("past days come from disk; missing is 404, malformed dates are 400", async () => {
    const dir = mkdtempSync(join(tmpdir(), "dm-h-"));
    writeFileSync(join(dir, "2026-01-02.json"), JSON.stringify({ version: 1, date: "2026-01-02", sessions: {
      "codex//a": { source: "codex", firstSeen: "2026-01-02T10:00:00Z", lastSeen: "2026-01-02T11:00:00Z", ended: true, workingMs: 1000, waitingMs: 0, tools: 3, tokens: { input: 5, output: 7 }, hourMask: 1 << 10, phase: "ended", at: 0 } } }));
    writeFileSync(join(dir, "..", "secret.json"), "{}");
    const url = await bootWithHistory(dir);
    const ok = await fetch(`${url}/v1/history?date=2026-01-02`);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ date: "2026-01-02", totals: { sessions: 1, workingMs: 1000, tokens: 12 } });
    expect((await fetch(`${url}/v1/history?date=2026-01-03`)).status).toBe(404);
    for (const bad of ["2026-02-30", "..%2Fsecret", "../secret", "2026-01-02.json", "yesterday", ""])
      expect((await fetch(`${url}/v1/history?date=${bad}`)).status).toBe(400);
    expect((await fetch(`${url}/v1/history`, { method: "POST" })).status).toBe(405);
  });
});

describe("shared office", () => {
  const T = "t".repeat(32);
  const mkBase = () => {
    const web = mkdtempSync(join(tmpdir(), "dm-web-"));
    writeFileSync(join(web, "index.html"), "<!doctype html><title>deskmates</title>");
    return { port: 0, webDir: web, usageDelayMs: 10 };
  };
  const postEvents = (port: number, events: unknown[]) =>
    fetch(`http://127.0.0.1:${port}/v1/events`, { method: "POST", headers: { authorization: `Bearer ${T}`, "content-type": "application/json" }, body: JSON.stringify(events) });

  test("remembers owners across restarts and tells the page it is shared", async () => {
    const ownersFile = join(mkdtempSync(join(tmpdir(), "dm-shared-")), "shared.json");
    const base = mkBase();
    let s = await startServer({ ...base, token: T, shared: true, ownersFile });
    await postEvents(s.port, [{ source: "claude", session: "1", kind: "start", owner: "bbbbbbbb" }]);
    await postEvents(s.port, [{ source: "claude", session: "2", kind: "start", owner: "aaaaaaaa" }]);
    expect(await (await fetch(`http://127.0.0.1:${s.port}/v1/config`)).json()).toEqual({ theme: "headquarters", shared: true, floor: { desksPerRoom: 24, islandSize: 4 } });
    expect((await (await fetch(`http://127.0.0.1:${s.port}/healthz`)).json()).owners).toBe(2);
    const frame = await new Promise<StateMessage>((res, rej) => {
      const ws = new WebSocket(`ws://127.0.0.1:${s.port}/ws`);
      ws.once("message", (d) => { ws.close(); res(JSON.parse(String(d))); });
      ws.once("error", rej);
    });
    expect(frame.state.characters).toMatchObject([{ owner: "bbbbbbbb", ownerColor: OWNER_COLORS[0] }, { owner: "aaaaaaaa", ownerColor: OWNER_COLORS[1] }]);
    await s.close();
    s = await startServer({ ...base, token: T, shared: true, ownersFile });
    expect(s.state().owners).toEqual(["bbbbbbbb", "aaaaaaaa"]);
    await s.close();
  });

  test("healthz counts the PCs with an agent still around, not every PC ever seen", async () => {
    srv = await startServer({ ...mkBase(), token: T, shared: true, ownersFile: join(mkdtempSync(join(tmpdir(), "dm-shared-")), "o.json") });
    const owners = async () => (await (await fetch(`http://127.0.0.1:${srv!.port}/healthz`)).json()).owners;
    await postEvents(srv.port, [{ source: "claude", session: "1", kind: "start", owner: "aaaaaaaa" }, { source: "claude", session: "2", kind: "start", owner: "aaaaaaaa" }]);
    await postEvents(srv.port, [{ source: "claude", session: "1", kind: "start", owner: "bbbbbbbb" }]);
    expect(await owners()).toBe(2);
    await postEvents(srv.port, [{ source: "claude", session: "1", kind: "end", owner: "bbbbbbbb" }]);
    expect(await owners()).toBe(1);
    expect(srv.state().owners).toEqual(["aaaaaaaa", "bbbbbbbb"]);
  });

  test("the ingest limit is per owner and a batch holds one owner", async () => {
    srv = await startServer({ ...mkBase(), token: T, shared: true, ownersFile: join(mkdtempSync(join(tmpdir(), "dm-shared-")), "o.json") });
    const many = (owner: string) => Array.from({ length: 100 }, (_, i) => ({ source: "claude", session: `${owner}${i}`, kind: "start", owner }));
    for (let i = 0; i < 6; i++) expect((await postEvents(srv.port, many("aaaaaaaa"))).status).toBe(202);
    expect((await postEvents(srv.port, many("aaaaaaaa"))).status).toBe(429);
    expect((await postEvents(srv.port, many("bbbbbbbb"))).status).toBe(202);
    expect((await postEvents(srv.port, [{ source: "claude", session: "x", kind: "start", owner: "aaaaaaaa" }, { source: "claude", session: "y", kind: "start", owner: "bbbbbbbb" }])).status).toBe(400);
  });

  test("a relay forwards what this office keeps to the shared office, owner stamped", async () => {
    const lab = await startServer({ ...mkBase(), token: T, shared: true, ownersFile: join(mkdtempSync(join(tmpdir(), "dm-shared-")), "o.json") });
    srv = await startServer({ ...mkBase(), token: "u".repeat(32), relay: { url: `http://127.0.0.1:${lab.port}`, token: T, owner: "aaaaaaaa", ownerName: "Ana", ownerHost: "pc", batchMs: 20 } });
    try {
      const res = await fetch(`http://127.0.0.1:${srv.port}/v1/events`, { method: "POST", headers: { authorization: `Bearer ${"u".repeat(32)}`, "content-type": "application/json" }, body: JSON.stringify([{ source: "claude", session: "1", kind: "start" }]) });
      expect(res.status).toBe(202);
      await expect.poll(() => Object.values(lab.state().characters).map((c) => [c.session, c.owner, c.ownerName])).toEqual([["1", "aaaaaaaa", "Ana"]]);
      await srv.close(); srv = undefined;
      await expect.poll(() => Object.values(lab.state().characters).map((c) => c.status)).toEqual(["leaving"]);
    } finally { await lab.close(); }
  });

  test("the lab takes a relayed event whose cwd is longer than its limit", async () => {
    const lab = await startServer({ ...mkBase(), token: T, shared: true, ownersFile: join(mkdtempSync(join(tmpdir(), "dm-shared-")), "o.json") });
    srv = await startServer({ ...mkBase(), token: "u".repeat(32), relay: { url: `http://127.0.0.1:${lab.port}`, token: T, owner: "aaaaaaaa", ownerName: "Ana", ownerHost: "pc", batchMs: 20 } });
    try {
      const body = JSON.stringify({ hook_event_name: "SessionStart", session_id: "long", cwd: "/w".repeat(500), source: "startup" });
      await fetch(`http://127.0.0.1:${srv.port}/v1/hook/claude`, { method: "POST", headers: { "content-type": "application/json" }, body });
      expect(Object.values(srv.state().characters).map((c) => c.cwd?.length)).toEqual([1000]);
      await expect.poll(() => Object.values(lab.state().characters).map((c) => c.cwd?.length)).toEqual([400]);
    } finally { await lab.close(); }
  });

  /** An assets dir with a fixture `headquarters` theme whose layout has 24 seats (the real theme comes later). */
  const hqAssets = () => {
    const dir = mkdtempSync(join(tmpdir(), "dm-assets-"));
    mkdirSync(join(dir, "themes", "headquarters"), { recursive: true });
    const seats = [2, 6, 10, 14].flatMap((r) => [3, 7, 11, 15, 19, 23].map((c) => ({ c, r })));
    const layout = { cols: 48, rows: 24, seats, door: { c: 24, r: 23 }, doorGap: [24, 25], meeting: [] };
    writeFileSync(join(dir, "themes", "headquarters", "theme.json"), JSON.stringify({ id: "headquarters", layout }));
    return dir;
  };

  test("a shared office numbers desks by the headquarters floor", async () => {
    srv = await startServer({ ...mkBase(), assetsDir: hqAssets(), token: T, shared: true, ownersFile: join(mkdtempSync(join(tmpdir(), "dm-shared-")), "o.json") });
    expect(srv.state().floor).toEqual({ desksPerRoom: 24, islandSize: 4 });
    expect((await (await fetch(`http://127.0.0.1:${srv.port}/v1/config`)).json()).floor).toEqual({ desksPerRoom: 24, islandSize: 4 });
  });

  test("a theme without a layout keeps today's eight desks and islands of four", async () => {
    srv = await startServer({ ...mkBase(), theme: "day" });
    expect(srv.state().floor).toEqual({ desksPerRoom: 8, islandSize: 4 });
  });

  test("floorNumbersOf falls back to eight and four for an unknown theme or a broken layout", () => {
    const dir = hqAssets();
    expect(floorNumbersOf("headquarters", dir)).toEqual({ desksPerRoom: 24, islandSize: 4 });
    expect(floorNumbersOf(undefined, dir)).toEqual({ desksPerRoom: 8, islandSize: 4 });
    expect(floorNumbersOf("nope", dir)).toEqual({ desksPerRoom: 8, islandSize: 4 });
    expect(floorNumbersOf("../x", dir)).toEqual({ desksPerRoom: 8, islandSize: 4 });
    mkdirSync(join(dir, "themes", "broken"));
    writeFileSync(join(dir, "themes", "broken", "theme.json"), JSON.stringify({ id: "broken", layout: { cols: 2 } }));
    expect(floorNumbersOf("broken", dir)).toEqual({ desksPerRoom: 8, islandSize: 4 });
  });

  test("shared without a token is refused", async () => {
    await expect(startServer({ ...mkBase(), shared: true })).rejects.toThrow("a shared office needs a token");
  });
});

test("the page's files never leave the web folder, however the path is spelled", async () => {
  const root = mkdtempSync(join(tmpdir(), "dm-root-"));
  const web = join(root, "web");
  mkdirSync(web);
  writeFileSync(join(web, "index.html"), "<p>office</p>");
  writeFileSync(join(root, "secret.txt"), "outside");
  srv = await startServer({ port: 0, webDir: web });
  const { request } = await import("node:http");
  // raw paths: fetch() would normalise the dots away before sending
  const get = (path: string) => new Promise<{ status: number; body: string }>((ok, fail) => {
    const r = request({ host: "127.0.0.1", port: srv!.port, path }, (res) => {
      let body = ""; res.on("data", (c) => (body += c)); res.on("end", () => ok({ status: res.statusCode ?? 0, body }));
    });
    r.on("error", fail); r.end();
  });
  expect((await get("/index.html")).body).toBe("<p>office</p>");
  for (const path of ["/../secret.txt", "/..%2fsecret.txt", "/%2e%2e/secret.txt", "/%2e%2e%2fsecret.txt", "/..%5csecret.txt", "/web/../../secret.txt", `/${encodeURIComponent(join(root, "secret.txt"))}`]) {
    const r = await get(path);
    expect(r.body, path).not.toContain("outside");
  }
});

test("a port already in use rejects startServer with EADDRINUSE instead of crashing the process", async () => {
  const url = await boot();
  const port = Number(new URL(url).port);
  const web = mkdtempSync(join(tmpdir(), "dm-web-"));
  await expect(startServer({ port, webDir: web })).rejects.toMatchObject({ code: "EADDRINUSE" });
});

test("every open page gets a ping, so it can tell a dead connection from a quiet office", async () => {
  const web = mkdtempSync(join(tmpdir(), "dm-web-"));
  srv = await startServer({ port: 0, webDir: web, heartbeatMs: 30 });
  const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`);
  const types: string[] = [];
  ws.on("message", (d) => types.push(JSON.parse(String(d)).type));
  await new Promise((r) => setTimeout(r, 120));
  ws.close();
  expect(types[0]).toBe("state");
  expect(types.filter((t) => t === "ping").length).toBeGreaterThanOrEqual(2);
});

test("hook events keep counting when this machine's clock steps back (NTP after boot, dual boot)", async () => {
  const url = await boot();
  const base = { session_id: "s", transcript_path: "/h/.claude/projects/p/s.jsonl", cwd: "/p" };
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    vi.setSystemTime(new Date("2026-10-14T12:00:00Z"));
    await post(url, JSON.stringify({ ...base, hook_event_name: "SessionStart" }));
    vi.setSystemTime(new Date("2026-10-14T09:00:00Z"));
    await post(url, JSON.stringify({ ...base, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "npm test" } }));
    expect(Object.values(srv!.state().characters)[0]).toMatchObject({ tool: "Bash", detail: "npm test" });
  } finally { vi.useRealTimers(); }
});
