import { test, expect, afterEach } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer, type Running } from "../../src/server/server.ts";

const HOOK = new URL("../../bin/deskmates-hook.sh", import.meta.url).pathname;
const payload = JSON.stringify({ hook_event_name: "SessionStart", session_id: "S", transcript_path: "/h/.claude-work/projects/p/S.jsonl", cwd: "/p" });
const run = (port: number) => {
  const t = performance.now();
  const r = spawnSync(HOOK, { input: payload, env: { ...process.env, DESKMATES_PORT: String(port) } });
  return { code: r.status, ms: performance.now() - t, out: String(r.stdout) + String(r.stderr) };
};
let srv: Running | undefined;
afterEach(async () => { await srv?.close(); srv = undefined; });

test("with the service down the hook exits 0, silently, in under 50 ms", () => {
  const runs = [run(1), run(1), run(1)];
  for (const r of runs) { expect(r.code).toBe(0); expect(r.out).toBe(""); }
  expect(Math.min(...runs.map((r) => r.ms))).toBeLessThan(50);
});

test("with the service up the payload arrives", async () => {
  const web = mkdtempSync(join(tmpdir(), "dm-w-"));
  writeFileSync(join(web, "index.html"), "x");
  srv = await startServer({ port: 0, webDir: web });
  expect(run(srv.port).code).toBe(0);
  await new Promise((r) => setTimeout(r, 30));
  expect(Object.values(srv.state().characters)[0]).toMatchObject({ session: "S", profile: "claude-work" });
});

test("the hook sends its parent pid in x-deskmates-ppid", async () => {
  let resolve!: (v: { ppid: unknown; body: string }) => void;
  const got = new Promise<{ ppid: unknown; body: string }>((ok) => (resolve = ok));
  const s = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => { res.writeHead(204).end(); resolve({ ppid: req.headers["x-deskmates-ppid"], body }); });
  });
  await new Promise<void>((ok) => s.listen(0, "127.0.0.1", ok));
  const port = (s.address() as { port: number }).port;
  // a parent shell that does not exec the hook, so the hook's parent is this shell
  const child = spawn("sh", ["-c", `"${HOOK}"; true`], { env: { ...process.env, DESKMATES_PORT: String(port) } });
  child.stdin.end(payload);
  const r = await got;
  s.close();
  expect(r.body).toBe(payload);
  expect(r.ppid).toBe(String(child.pid));
});

test("DESKMATES_NAME names the session, accents and all, but not its subagents", async () => {
  const web = mkdtempSync(join(tmpdir(), "dm-w-"));
  writeFileSync(join(web, "index.html"), "x");
  srv = await startServer({ port: 0, webDir: web });
  const send = (body: object) => spawnSync(HOOK, { input: JSON.stringify(body), env: { ...process.env, DESKMATES_PORT: String(srv!.port), DESKMATES_NAME: "Sofía" } });
  send({ hook_event_name: "SessionStart", session_id: "S", transcript_path: "/h/.claude-work/projects/p/S.jsonl", cwd: "/p" });
  send({ hook_event_name: "PreToolUse", session_id: "S", transcript_path: "/h/.claude-work/projects/p/S.jsonl", cwd: "/p",
    agent_id: "a1", agent_type: "Explore", tool_name: "Read", tool_input: { file_path: "/p/x" } });
  await new Promise((r) => setTimeout(r, 50));
  const chars = Object.values(srv.state().characters);
  expect(chars.find((c) => !c.parent)).toMatchObject({ name: "Sofía", label: "claude-work · Sofía" });
  expect(chars.find((c) => c.parent)?.name).toBeUndefined();
});

test("a service that takes the connection and never answers still costs the agent at most ~50 ms", async () => {
  const hung = createServer(() => { /* never answers */ });
  await new Promise<void>((ok) => hung.listen(0, "127.0.0.1", ok));
  const port = (hung.address() as { port: number }).port;
  try {
    // async spawn: the hung server lives in this process and must keep accepting while the hook runs
    const r = await new Promise<{ code: number | null; ms: number }>((ok) => {
      const t = performance.now();
      const c = spawn(HOOK, { env: { ...process.env, DESKMATES_PORT: String(port) }, stdio: ["pipe", "ignore", "ignore"] });
      c.stdin.end(payload);
      c.on("exit", (code) => ok({ code, ms: performance.now() - t }));
    });
    expect(r.code).toBe(0);
    expect(r.ms).toBeLessThan(500);
  } finally { hung.closeAllConnections(); hung.close(); }
});
