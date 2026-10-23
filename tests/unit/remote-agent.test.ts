import { test, expect, afterEach } from "vitest";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer, type Running } from "../../src/server/server.ts";

const SCRIPT = new URL("../../scripts/remote-agent.sh", import.meta.url).pathname;
const STARTED = new URL("../../scripts/github-runner/job-started.sh", import.meta.url).pathname;
const COMPLETED = new URL("../../scripts/github-runner/job-completed.sh", import.meta.url).pathname;
const TOKEN = "r".repeat(32);
let srv: Running | undefined;
afterEach(async () => { await srv?.close(); srv = undefined; });
async function boot() {
  const web = mkdtempSync(join(tmpdir(), "dm-w-"));
  writeFileSync(join(web, "index.html"), "x");
  srv = await startServer({ port: 0, webDir: web, token: TOKEN });
  return `http://127.0.0.1:${srv.port}`;
}
// async on purpose: the test server lives in this process and must keep answering while the script runs
const run = (file: string, args: string[], env: Record<string, string>) => new Promise<{ code: number | null; ms: number }>((ok) => {
  const t = performance.now();
  const c = spawn(file, args, { env: { PATH: process.env.PATH!, HOME: "/nonexistent", ...env }, stdio: "ignore" });
  c.on("exit", (code) => ok({ code, ms: performance.now() - t }));
});

test("sends an event, escaping quotes, and the character appears", async () => {
  const url = await boot();
  const r = await run(SCRIPT, ["tool", "deploy", "d-1", "releaser", "/srv/app", "Bash", 'echo "hi"'], { DESKMATES_URL: url, DESKMATES_TOKEN: TOKEN });
  expect(r.code).toBe(0);
  expect(Object.values(srv!.state().characters)[0]).toMatchObject({ source: "deploy", agent: "releaser", tool: "Bash", detail: 'echo "hi"' });
});

test("never fails: no url, wrong token, or office down", async () => {
  expect((await run(SCRIPT, ["start", "x", "1"], {})).code).toBe(0);
  const url = await boot();
  expect((await run(SCRIPT, ["start", "x", "1"], { DESKMATES_URL: url, DESKMATES_TOKEN: "bad" })).code).toBe(0);
  const down = await run(SCRIPT, ["start", "x", "1"], { DESKMATES_URL: "http://10.255.255.1:47821", DESKMATES_TOKEN: TOKEN });
  expect(down.code).toBe(0);
  expect(down.ms).toBeLessThan(2500);
});

test("GitHub runner hooks put the job in the office and take it out", async () => {
  const url = await boot();
  const env = { DESKMATES_URL: url, DESKMATES_TOKEN: TOKEN, GITHUB_RUN_ID: "77", GITHUB_JOB: "tests", GITHUB_REPOSITORY: "me/atlas", GITHUB_WORKFLOW: "CI" };
  expect((await run(STARTED, [], env)).code).toBe(0);
  expect(Object.values(srv!.state().characters)[0]).toMatchObject({ source: "ci", session: "77-tests", label: "ci · tests", status: "working", detail: "CI" });
  expect((await run(COMPLETED, [], env)).code).toBe(0);
  expect(Object.values(srv!.state().characters)[0].status).toBe("leaving");
});

test("runner hooks also work when installed in one folder next to remote-agent.sh", async () => {
  const { mkdtempSync: mk, copyFileSync, chmodSync } = await import("node:fs");
  const dir = mk(join(tmpdir(), "dm-runner-"));
  for (const f of [SCRIPT, STARTED, COMPLETED]) { const to = join(dir, f.split("/").pop()!); copyFileSync(f, to); chmodSync(to, 0o755); }
  const url = await boot();
  const env = { DESKMATES_URL: url, DESKMATES_TOKEN: TOKEN, GITHUB_RUN_ID: "8", GITHUB_JOB: "build" };
  expect((await run(join(dir, "job-started.sh"), [], env)).code).toBe(0);
  expect(Object.values(srv!.state().characters)[0]).toMatchObject({ session: "8-build" });
});

test("a URL ending in /, fields over the office's limits and a backslash at the cut still make one valid event", async () => {
  const url = await boot();
  const detail = "x".repeat(119) + "\\" + "tail";
  const r = await run(SCRIPT, ["tool", "deploy", "d-2", "a".repeat(100), "/srv/app", "T".repeat(90), detail], { DESKMATES_URL: `${url}/`, DESKMATES_TOKEN: TOKEN });
  expect(r.code).toBe(0);
  expect(Object.values(srv!.state().characters)[0]).toMatchObject({ source: "deploy", agent: "a".repeat(80), tool: "T".repeat(80), detail: "x".repeat(119) + "\\" });
});
