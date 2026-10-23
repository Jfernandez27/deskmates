import { test, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir, networkInterfaces } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import WebSocket from "ws";
import { startServer, type Running } from "../../src/server/server.ts";

const TOKEN = "z".repeat(32);
/** A non-loopback address of this machine: requests to it look like they come from the network. */
const lanIp = Object.values(networkInterfaces()).flat().find((i) => i && i.family === "IPv4" && !i.internal)?.address;
let srv: Running | undefined;
afterEach(async () => { await srv?.close(); srv = undefined; });
async function boot(lan: boolean) {
  const web = mkdtempSync(join(tmpdir(), "dm-web-"));
  writeFileSync(join(web, "index.html"), "office");
  srv = await startServer({ port: 0, webDir: web, token: TOKEN, lan });
  return srv.port;
}

test.skipIf(!lanIp)("without --lan the service is not reachable from the network", async () => {
  const port = await boot(false);
  await expect(fetch(`http://${lanIp}:${port}/`)).rejects.toThrow();
});

test.skipIf(!lanIp)("with --lan, the network needs the token; the link sets a cookie for the rest", async () => {
  const port = await boot(true);
  const base = `http://${lanIp}:${port}`;
  expect((await fetch(`${base}/`)).status).toBe(401);
  expect((await fetch(`${base}/?token=wrong`)).status).toBe(401);
  const ok = await fetch(`${base}/?token=${TOKEN}`);
  expect(ok.status).toBe(200);
  const cookie = ok.headers.get("set-cookie")!;
  expect(cookie).toMatch(/HttpOnly/);
  const again = await fetch(`${base}/healthz`, { headers: { cookie: cookie.split(";")[0] } });
  expect(again.status).toBe(200);
  // every request with the cookie renews it, so a wall screen open for weeks never loses it
  expect(again.headers.get("set-cookie")).toMatch(/Max-Age=2592000/);
  expect((await fetch(`${base}/healthz`, { headers: { cookie: "deskmates_token=wrong" } })).headers.get("set-cookie")).toBeNull();
  expect((await fetch(`http://127.0.0.1:${port}/healthz`)).status).toBe(200);
});

test.skipIf(!lanIp)("with --lan, hooks still only come from this machine, and the websocket needs the token", async () => {
  const port = await boot(true);
  const hook = (host: string) => fetch(`http://${host}:${port}/v1/hook/claude?token=${TOKEN}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ hook_event_name: "SessionStart", session_id: "s" }) });
  expect((await hook(lanIp!)).status).toBe(403);
  expect((await hook("127.0.0.1")).status).toBe(204);
  const closed = await new Promise<number>((ok) => { const ws = new WebSocket(`ws://${lanIp}:${port}/ws`); ws.on("close", (c) => ok(c)); ws.on("error", () => ok(-1)); });
  expect(closed).not.toBe(1000);
  const msg = await new Promise<any>((ok) => { const ws = new WebSocket(`ws://${lanIp}:${port}/ws?token=${TOKEN}`); ws.on("message", (d) => { ok(JSON.parse(String(d))); ws.close(); }); });
  expect(msg.type).toBe("state");
});

test("LAN mode refuses to start without a token", async () => {
  const web = mkdtempSync(join(tmpdir(), "dm-web-"));
  await expect(startServer({ port: 0, webDir: web, lan: true })).rejects.toThrow(/token/);
});

test.skipIf(!lanIp)("with --lan, agents on other machines can post to the ingest API with the token", async () => {
  const port = await boot(true);
  const post = (token: string) => fetch(`http://${lanIp}:${port}/v1/events`, {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ source: "ci", session: "build-7", kind: "start", cwd: "/runner/atlas" }),
  });
  expect((await post("wrong".padEnd(32, "x"))).status).toBe(401);
  expect((await post(TOKEN)).status).toBe(202);
  expect(Object.values(srv!.state().characters)[0]).toMatchObject({ source: "ci", label: "ci · atlas" });
});

test.skipIf(!lanIp)("with --lan, history needs the token like the page", async () => {
  const port = await boot(true);
  expect((await fetch(`http://${lanIp}:${port}/v1/history`)).status).toBe(401);
  expect((await fetch(`http://${lanIp}:${port}/v1/history?token=wrong`)).status).toBe(401);
  const ok = await fetch(`http://${lanIp}:${port}/v1/history?token=${TOKEN}`);
  expect(ok.status).toBe(200);
  expect((await ok.json()).hours).toHaveLength(24);
  expect((await fetch(`http://${lanIp}:${port}/v1/history`, { headers: { authorization: `Bearer ${TOKEN}` } })).status).toBe(200);
  expect((await fetch(`http://127.0.0.1:${port}/v1/history`)).status).toBe(200);
});

test.skipIf(!lanIp)("without --lan, history is not reachable from the network", async () => {
  const port = await boot(false);
  await expect(fetch(`http://${lanIp}:${port}/v1/history?token=${TOKEN}`)).rejects.toThrow();
});

test("/v1/lan: on localhost without --lan, lan is false and the token is withheld", async () => {
  const port = await boot(false);
  const r = await (await fetch(`http://127.0.0.1:${port}/v1/lan`)).json();
  expect(r).toEqual({ lan: false, port, primary: null, alternatives: [], token: null });
});

test.skipIf(!lanIp)("/v1/lan with --lan: the token only to a client that already has it", async () => {
  const web = mkdtempSync(join(tmpdir(), "dm-web-"));
  writeFileSync(join(web, "index.html"), "office");
  srv = await startServer({ port: 0, webDir: web, token: TOKEN, lan: true, addresses: () => ({ primary: "192.168.1.9", alternatives: ["10.0.0.5"] }) });
  const base = `http://${lanIp}:${srv.port}`;
  expect((await fetch(`${base}/v1/lan`)).status).toBe(401);
  const ok = await fetch(`${base}/v1/lan`, { headers: { authorization: `Bearer ${TOKEN}` } });
  expect(await ok.json()).toEqual({ lan: true, port: srv.port, primary: "192.168.1.9", alternatives: ["10.0.0.5"], token: TOKEN });
  expect(ok.headers.get("cache-control")).toBe("no-store");
});

test("/v1/lan reads the addresses on every request: a network that comes up after serve shows without a restart", async () => {
  const web = mkdtempSync(join(tmpdir(), "dm-web-"));
  writeFileSync(join(web, "index.html"), "office");
  let current: { primary: string | null; alternatives: string[] } = { primary: null, alternatives: [] };
  srv = await startServer({ port: 0, webDir: web, token: TOKEN, lan: true, addresses: () => current });
  const lan = async () => (await fetch(`http://127.0.0.1:${srv!.port}/v1/lan`)).json();
  expect((await lan()).primary).toBeNull();
  current = { primary: "192.168.1.96", alternatives: [] };
  expect((await lan()).primary).toBe("192.168.1.96");
});

test("GET /v1/lan from loopback hands the token only to a local Host name (DNS rebinding)", async () => {
  const web = mkdtempSync(join(tmpdir(), "dm-web-"));
  writeFileSync(join(web, "index.html"), "office");
  srv = await startServer({ port: 0, webDir: web, token: TOKEN, lan: true, addresses: () => ({ primary: "192.168.1.9", alternatives: [] }) });
  const port = srv.port;
  const lan = (host: string) => new Promise<any>((ok, bad) => {
    const r = request({ host: "127.0.0.1", port, path: "/v1/lan", headers: { host } }, (res) => {
      let b = ""; res.on("data", (d) => (b += d)); res.on("end", () => ok(JSON.parse(b)));
    });
    r.on("error", bad); r.end();
  });
  const evil = await lan("evil.example");
  expect(evil.token).toBeNull();
  expect(evil.lan).toBe(true);
  expect((await lan("localhost")).token).toBe(TOKEN);
  expect((await lan(`127.0.0.1:${port}`)).token).toBe(TOKEN);
  expect((await lan(`[::1]:${port}`)).token).toBe(TOKEN);
});
