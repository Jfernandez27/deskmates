import { test, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { startServer, type Running } from "../../src/server/server.ts";
import { runMcp, sourceFromClient, TOOLS } from "../../src/cli/mcp.ts";

const TOKEN = "t".repeat(32);
let srv: Running | undefined;
afterEach(async () => { await srv?.close(); srv = undefined; });

async function boot() {
  const web = mkdtempSync(join(tmpdir(), "dm-web-"));
  writeFileSync(join(web, "index.html"), "x");
  srv = await startServer({ port: 0, webDir: web, token: TOKEN });
  return `http://127.0.0.1:${srv.port}/v1/events`;
}

/** A port nothing listens on. */
async function deadUrl() {
  const s = createServer();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const port = (s.address() as { port: number }).port;
  await new Promise((r) => s.close(r));
  return `http://127.0.0.1:${port}/v1/events`;
}

/** An in-process MCP client talking to runMcp over two pipes. */
function client(url: string, opts: { token?: string; source?: string } = {}) {
  const input = new PassThrough(), output = new PassThrough();
  const logs: string[] = [];
  const done = runMcp({ input, output, url, token: opts.token ?? TOKEN, cwd: "/work/api", source: opts.source, session: "s1", log: (m) => logs.push(m) });
  const waiting = new Map<unknown, (m: any) => void>();
  const unsolicited: any[] = [];
  let buf = "";
  output.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
      const w = waiting.get(m.id);
      if (w) { waiting.delete(m.id); w(m); } else unsolicited.push(m);
    }
  });
  let id = 0;
  const raw = (line: string) => input.write(line + "\n");
  const request = (method: string, params?: object): Promise<any> => {
    const n = ++id;
    const p = new Promise((r) => waiting.set(n, r));
    raw(JSON.stringify({ jsonrpc: "2.0", id: n, method, ...(params ? { params } : {}) }));
    return p;
  };
  const call = async (name: string, args: object = {}) => (await request("tools/call", { name, arguments: args })).result;
  const init = async (name = "Codex-MCP-Client") => {
    const r = await request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name, version: "1.0" } });
    raw(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }));
    return r;
  };
  const close = async () => { input.end(); await done; };
  return { request, call, init, raw, close, unsolicited, logs };
}

const chars = () => Object.values(srv!.state().characters);

test("initialize negotiates the version and names the server; tools/list lists the four tools", async () => {
  const c = client(await deadUrl());
  const r = await c.init();
  expect(r).toMatchObject({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "deskmates" } } });
  expect(r.result.resultType).toBeUndefined();
  expect((await c.request("initialize", { protocolVersion: "1999-01-01" })).result.protocolVersion).toBe("2025-11-25");
  const list = (await c.request("tools/list")).result.tools;
  expect(list.map((t: any) => t.name)).toEqual(["office_start", "office_name", "office_status", "office_usage", "office_end"]);
  for (const t of list) expect(t.inputSchema.type).toBe("object");
  expect((await c.request("ping")).result).toEqual({});
  expect(c.unsolicited).toEqual([]); // the initialized notification gets no answer
  await c.close();
});

test("2026-07-28 clients: server/discover, resultType, and unsupported versions", async () => {
  const c = client(await deadUrl());
  const meta = (v: string) => ({ _meta: { "io.modelcontextprotocol/protocolVersion": v, "io.modelcontextprotocol/clientCapabilities": {} } });
  expect((await c.request("server/discover", meta("2026-07-28"))).result).toMatchObject({ resultType: "complete", supportedVersions: ["2026-07-28"], capabilities: { tools: {} } });
  expect((await c.request("tools/list", meta("2026-07-28"))).result).toMatchObject({ resultType: "complete", tools: TOOLS });
  expect((await c.request("tools/list", meta("2099-01-01"))).error).toMatchObject({ code: -32022, data: { supported: ["2026-07-28"], requested: "2099-01-01" } });
  await c.close();
});

test("protocol errors: parse errors, unknown methods and unknown tools", async () => {
  const c = client(await deadUrl());
  await c.init();
  c.raw("{not json");
  expect((await c.request("resources/list")).error.code).toBe(-32601);
  expect(c.unsolicited).toEqual([{ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }]);
  expect((await c.request("tools/call", { name: "office_dance" })).error).toMatchObject({ code: -32602 });
  await c.close();
});

test("each tool posts the right event, and the character follows", async () => {
  const c = client(await boot());
  await c.init();
  expect(await c.call("office_start", { agent: "reviewer" })).toEqual({ content: [{ type: "text", text: "ok" }] });
  expect(chars()).toMatchObject([{ source: "codex", session: "s1", agent: "reviewer", cwd: "/work/api", label: "codex · reviewer", status: "working" }]);
  await c.call("office_status", { state: "working", tool: "Edit", detail: "README.md" });
  expect(chars()[0]).toMatchObject({ status: "working", tool: "Edit", detail: "README.md" });
  await c.call("office_status", { state: "waiting", tool: "Bash", detail: "rm -rf build" });
  expect(chars()[0].status).toBe("waiting");
  await c.call("office_usage", { input: 1200, output: 300, cacheRead: 5000 });
  expect(chars()[0].tokens).toEqual({ input: 1200, output: 300, cacheRead: 5000 });
  await c.call("office_status", { state: "idle" });
  expect(chars()[0].status).toBe("idle");
  expect(await c.call("office_end")).toEqual({ content: [{ type: "text", text: "left the office" }] });
  expect(chars()[0].status).toBe("leaving");
  // Back to work after leaving: it walks in again.
  await c.call("office_status", { state: "working", tool: "Read" });
  expect(chars()[0]).toMatchObject({ status: "working", tool: "Read" });
  await c.close();
});

test("office_start takes a name for the label, apart from the role that picks the outfit", async () => {
  const c = client(await boot());
  await c.init();
  await c.call("office_start", { agent: "reviewer", name: "Ada" });
  expect(chars()[0]).toMatchObject({ agent: "reviewer", name: "Ada", label: "codex · Ada" });
  await c.call("office_status", { state: "working", tool: "Read" });
  expect(chars()[0].name, "later events carry the name too").toBe("Ada");
  await c.close();
});

test("office_name names the agent, now or later, and needs a name", async () => {
  const c = client(await boot());
  await c.init();
  expect(await c.call("office_name", { name: "Mateo" })).toEqual({ content: [{ type: "text", text: "ok" }] });
  expect(chars()[0]).toMatchObject({ name: "Mateo", label: "codex · Mateo" });
  await c.call("office_name", { name: "Matías" });
  expect(chars()[0].name).toBe("Matías");
  // bad arguments come back as a tool error the agent can read, like every other tool
  expect(await c.call("office_name", {})).toMatchObject({ isError: true, content: [{ text: expect.stringContaining("name") }] });
  await c.close();
});

test("a status before office_start enters the office; detail keeps one clipped line", async () => {
  const c = client(await boot());
  await c.init("claude-code");
  await c.call("office_status", { state: "working", tool: "Bash", detail: `npm test\n${"secret ".repeat(40)}` });
  expect(chars()).toMatchObject([{ source: "claude-code", status: "working", tool: "Bash", detail: "npm test", label: "claude-code · api" }]);
  await c.call("office_status", { state: "working", tool: "Bash", detail: "x".repeat(300) });
  expect(chars()[0].detail).toHaveLength(120);
  await c.close();
});

test("source: --source beats the client name, office_start beats both; unknown clients are mcp", async () => {
  await boot();
  const url = `http://127.0.0.1:${srv!.port}/v1/events`;
  const a = client(url, { source: "my-ide" });
  await a.init();
  await a.call("office_start");
  expect(chars().map((x) => x.source)).toEqual(["my-ide"]);
  await a.call("office_start", { source: "aider" });
  expect(chars().map((x) => [x.source, x.status])).toEqual([["my-ide", "leaving"], ["aider", "working"]]);
  await a.close();
  expect(sourceFromClient("Gemini CLI MCP Client")).toBe("gemini-cli");
  expect(sourceFromClient("cursor-vscode")).toBe("cursor-vscode");
  expect(sourceFromClient("!!!")).toBe("mcp");
  expect(sourceFromClient(undefined)).toBe("mcp");
  const b = client(url);
  await b.request("tools/call", { name: "office_start", arguments: {} }); // no initialize at all
  expect(chars().some((x) => x.source === "mcp")).toBe(true);
  await b.close();
});

test("bad arguments come back as tool errors the model can fix, and nothing is posted", async () => {
  const c = client(await boot());
  await c.init();
  const bad = async (name: string, args: object) => { const r = await c.call(name, args); expect(r.isError).toBe(true); return r.content[0].text; };
  expect(await bad("office_status", { state: "dancing" })).toContain("state");
  expect(await bad("office_status", {})).toContain("state");
  expect(await bad("office_status", { state: "working", tool: "x".repeat(81) })).toContain("tool");
  expect(await bad("office_usage", { input: -1, output: 2 })).toContain("input");
  expect(await bad("office_usage", { input: 1 })).toContain("output");
  expect(await bad("office_start", { source: "Bad Name" })).toContain("source");
  expect(await bad("office_start", { agent: 42 })).toContain("agent");
  expect((await c.request("tools/call", { name: "office_start", arguments: [] })).error.code).toBe(-32602);
  expect(chars()).toHaveLength(0);
  await c.close();
});

test("office down: every tool answers quickly with a plain text result", async () => {
  const c = client(await deadUrl());
  await c.init();
  const t0 = Date.now();
  for (const [name, args] of [["office_start", {}], ["office_status", { state: "working" }], ["office_usage", { input: 1, output: 1 }]] as const) {
    const r = await c.call(name, args);
    expect(r.isError).toBeUndefined();
    expect(r.content[0].text).toContain("not reachable");
  }
  expect(Date.now() - t0).toBeLessThan(3000);
  await c.close();
});

test("a wrong token is reported as an error", async () => {
  const c = client(await boot(), { token: "w".repeat(32) });
  await c.init();
  const r = await c.call("office_start");
  expect(r).toMatchObject({ isError: true, content: [{ text: expect.stringContaining("401") }] });
  await c.close();
});

test("stdin closing sends end; nothing is sent if the agent never entered", async () => {
  const url = await boot();
  const c = client(url);
  await c.init();
  await c.call("office_start");
  await c.close();
  expect(chars()[0].status).toBe("leaving");
  const quiet = client(url);
  await quiet.init();
  await quiet.close();
  expect(chars()).toHaveLength(1);
});

test("`deskmates mcp` CLI: reads the token file, answers on stdout, and ends the session when stdin closes", async () => {
  const url = await boot();
  const cfg = mkdtempSync(join(tmpdir(), "dm-cfg-"));
  mkdirSync(join(cfg, "deskmates"));
  writeFileSync(join(cfg, "deskmates", "token"), TOKEN + "\n", { mode: 0o600 });
  const p = spawn(process.execPath, [join(import.meta.dirname, "../../bin/deskmates.ts"), "mcp", "--url", url.replace("/v1/events", "")], {
    env: { ...process.env, XDG_CONFIG_HOME: cfg }, cwd: cfg, stdio: ["pipe", "pipe", "inherit"],
  });
  let out = "";
  p.stdout.on("data", (d) => (out += d));
  const lines = [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "gemini-cli-mcp-client", version: "1" } } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "office_start", arguments: { agent: "Plan" } } },
  ];
  p.stdin.write(lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  for (let i = 0; i < 100 && !out.includes('"id":2'); i++) await new Promise((r) => setTimeout(r, 50));
  expect(chars()).toMatchObject([{ source: "gemini-cli", agent: "Plan", status: "working" }]);
  p.stdin.end();
  const code = await new Promise((r) => p.on("exit", r));
  expect(code).toBe(0);
  expect(chars()[0].status).toBe("leaving");
  const msgs = out.trim().split("\n").map((l) => JSON.parse(l));
  expect(msgs.map((m) => m.id)).toEqual([1, 2]); // stdout holds MCP messages only
}, 15_000);
