import { test, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir, networkInterfaces } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import { startServer, type Running } from "../../src/server/server.ts";
import type { PpidReader } from "../../src/server/pids.ts";

const TOKEN = "t".repeat(32);
const lanIp = Object.values(networkInterfaces()).flat().find((i) => i && i.family === "IPv4" && !i.internal)?.address;
const payload = JSON.stringify({ hook_event_name: "SessionStart", session_id: "S", transcript_path: "/h/.claude-work/projects/p/S.jsonl", cwd: "/p" });
// fake process tree: 900 → 800 → 700 → 1
const tree: Record<number, number> = { 900: 800, 800: 700, 700: 1 };
let reads = 0;
const reader: PpidReader = async (pid) => { reads++; return tree[pid]; };

let srv: Running | undefined;
afterEach(async () => { await srv?.close(); srv = undefined; reads = 0; });

async function boot(lan = false) {
  const web = mkdtempSync(join(tmpdir(), "dm-w-"));
  writeFileSync(join(web, "index.html"), "x");
  srv = await startServer({ port: 0, webDir: web, ppidReader: reader, ...(lan ? { lan: true, token: TOKEN } : {}) });
  return srv.port;
}
const hook = (port: number, ppid?: string) => fetch(`http://127.0.0.1:${port}/v1/hook/claude`, {
  method: "POST", headers: { "content-type": "application/json", ...(ppid ? { "x-deskmates-ppid": ppid } : {}) }, body: payload,
});
/** Last state frame a client gets after the hooks settle. */
async function lastFrame(url: string, act: () => Promise<unknown>) {
  const ws = new WebSocket(url);
  const msgs: any[] = [];
  ws.on("message", (d) => msgs.push(JSON.parse(String(d))));
  await new Promise((r) => ws.on("open", r));
  await act();
  await new Promise((r) => setTimeout(r, 80));
  ws.close();
  return msgs.at(-1).state.characters[0];
}

test("a loopback client gets the agent's process ancestry, resolved once per session", async () => {
  const port = await boot();
  const c = await lastFrame(`ws://127.0.0.1:${port}/ws`, async () => {
    expect((await hook(port, "900")).status).toBe(204);
    await hook(port, "900");
    await hook(port, "900");
  });
  expect(c.pids).toEqual([900, 800, 700]);
  expect(reads).toBe(3); // one walk, not one per hook
});

test("without the header or with a bad one there are no pids", async () => {
  const port = await boot();
  const c = await lastFrame(`ws://127.0.0.1:${port}/ws`, async () => { await hook(port); await hook(port, "abc"); });
  expect(c.session).toBe("S");
  expect(c.pids).toBeUndefined();
});

test.skipIf(!lanIp)("clients on the network never see pids; local ones do", async () => {
  const port = await boot(true);
  const remote = lastFrame(`ws://${lanIp}:${port}/ws?token=${TOKEN}`, async () => {});
  const c = await lastFrame(`ws://127.0.0.1:${port}/ws`, () => hook(port, "900"));
  expect(c.pids).toEqual([900, 800, 700]);
  const r = await remote;
  expect(r.session).toBe("S");
  expect(r).not.toHaveProperty("pids");
  // and a fresh remote snapshot is stripped too
  const snap = await lastFrame(`ws://${lanIp}:${port}/ws?token=${TOKEN}`, async () => {});
  expect(snap).not.toHaveProperty("pids");
});

test("sessions of tools without hooks get the ancestry of their process, found by folder", async () => {
  const web = mkdtempSync(join(tmpdir(), "dm-w-"));
  writeFileSync(join(web, "index.html"), "x");
  const procLister = async () => [{ pid: 900, ppid: 800, args: ["node", "/bin/gemini"], cwd: "/w/a" }];
  srv = await startServer({ port: 0, webDir: web, ppidReader: reader, procLister, procScanMs: 20, token: TOKEN });
  const port = srv.port;
  const c = await lastFrame(`ws://127.0.0.1:${port}/ws`, async () => {
    const r = await fetch(`http://127.0.0.1:${port}/v1/events`, {
      method: "POST", headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify([{ source: "gemini", session: "g1", kind: "start", cwd: "/w/a", ts: new Date().toISOString() }]),
    });
    expect(r.ok).toBe(true);
    await new Promise((ok) => setTimeout(ok, 100));
  });
  expect(c.source).toBe("gemini");
  expect(c.pids).toEqual([900, 800, 700]);
});

test("a session whose process cannot be found is looked up less and less often, not every round forever", async () => {
  const web = mkdtempSync(join(tmpdir(), "dm-w-"));
  writeFileSync(join(web, "index.html"), "x");
  let listings = 0;
  const procLister = async () => { listings++; return []; };
  srv = await startServer({ port: 0, webDir: web, ppidReader: reader, procLister, procScanMs: 10, token: TOKEN });
  await fetch(`http://127.0.0.1:${srv.port}/v1/events`, {
    method: "POST", headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify([{ source: "gemini", session: "g1", kind: "start", cwd: "/w/nowhere" }]),
  });
  await new Promise((ok) => setTimeout(ok, 400));
  expect(listings).toBeGreaterThan(0);
  expect(listings).toBeLessThanOrEqual(6);
});
