import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import type { EventKind, Tokens } from "../types/events.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { clip } from "../adapters/detail.ts";
import { packageRoot } from "../root.ts";

/**
 * `deskmates mcp`: a stdio MCP server, so any MCP client can put its agent in the office.
 * Hand-rolled JSON-RPC 2.0 (newline-delimited JSON): four tools need no SDK.
 * One process is one session; every tool call becomes a POST /v1/events.
 */

/** Versions with the initialize handshake, newest first; 2026-07-28 clients use server/discover instead. */
const LEGACY_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const MODERN_VERSIONS = ["2026-07-28"];
const SERVER_INFO = { name: "deskmates", version: JSON.parse(readFileSync(join(packageRoot(), "package.json"), "utf8")).version as string };
const POST_TIMEOUT_MS = 1000; // same ceiling as remote senders: never slow the agent
const SOURCE_RE = /^[a-z0-9][a-z0-9._-]{0,39}$/;

const INSTRUCTIONS = "Reports this agent to the deskmates office, a pixel-art view of the user's coding agents. " +
  "Call office_start once, office_status when you start a step (working), need the user (waiting) or finish (idle), office_usage with cumulative tokens if you know them, and office_end when done. " +
  "Labels only: never put prompts, code or file contents in detail. Calls are cheap and never fail your task.";

const str = (description: string, extra: object = {}) => ({ type: "string", description, ...extra });
const num = (description: string) => ({ type: "integer", minimum: 0, description });

export const TOOLS = [
  {
    name: "office_start",
    title: "Enter the office",
    description: "Put this agent in the deskmates office. Call once at the start of a session. All fields optional.",
    inputSchema: {
      type: "object",
      properties: {
        agent: str("Agent name or role, e.g. reviewer or designer (matched against roles.toml for the outfit)", { maxLength: 80 }),
        name: str("The name you go by in the office, shown on your label instead of the role or folder, e.g. Ada", { maxLength: 40 }),
        model: str("The model you run on, shown on your card, e.g. gpt-5 or claude-opus-5-5", { maxLength: 80 }),
        cwd: str("Working folder; its last part is the label when there is no agent name", { maxLength: 400 }),
        source: str("Your tool name in lowercase, e.g. codex or cursor; defaults to the MCP client name", { pattern: SOURCE_RE.source }),
      },
      additionalProperties: false,
    },
  },
  {
    name: "office_name",
    title: "Choose your name",
    description: "Choose the name you go by in the office; it shows on your label. Call it at the start of a session, or later to change it.",
    inputSchema: {
      type: "object",
      properties: { name: str("A short name, e.g. Ada or Mateo", { maxLength: 40, minLength: 1 }) },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "office_status",
    title: "Report status",
    description: "Tell the office what this agent is doing: working (with the tool in use), waiting for the user, or idle when a task is done.",
    inputSchema: {
      type: "object",
      properties: {
        state: { type: "string", enum: ["working", "waiting", "idle"], description: "working: busy on a step; waiting: needs the user; idle: done for now" },
        tool: str("Tool in use while working, e.g. Edit, Bash, Search", { maxLength: 80 }),
        detail: str("Short label such as a file name or the first line of a command. Never prompts or file contents.", { maxLength: 120 }),
      },
      required: ["state"],
      additionalProperties: false,
    },
  },
  {
    name: "office_usage",
    title: "Report tokens",
    description: "Report the session's cumulative token totals so far (not the increment).",
    inputSchema: {
      type: "object",
      properties: { input: num("Input tokens so far"), output: num("Output tokens so far"), cacheRead: num("Cache read tokens so far"), cacheWrite: num("Cache write tokens so far") },
      required: ["input", "output"],
      additionalProperties: false,
    },
  },
  {
    name: "office_end",
    title: "Leave the office",
    description: "This agent's session is over; it walks out. Sent automatically when the client exits.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

/** MCP client names → a source the ingest API accepts: `Codex-MCP-Client` → `codex`. */
export function sourceFromClient(name: unknown): string {
  if (typeof name !== "string") return "mcp";
  const s = name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/-?mcp-client$|-mcp$/, "").replace(/^[^a-z0-9]+/, "").slice(0, 40);
  return SOURCE_RE.test(s) ? s : "mcp";
}

export type McpOptions = {
  input: Readable;
  output: Writable;
  /** POST /v1/events URL of the office */
  url: string;
  token: string;
  /** default working folder: the client starts the server in its project */
  cwd?: string;
  /** --source: overrides the client name */
  source?: string;
  session?: string;
  log?: (msg: string) => void;
};

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };
class InvalidArgs extends Error {}

/** Runs until input closes; then sends `end` if the agent is in the office. */
export async function runMcp(o: McpOptions): Promise<void> {
  const session = o.session ?? randomUUID();
  const log = o.log ?? ((m: string) => process.stderr.write(`deskmates mcp: ${m}\n`));
  let source = o.source;
  let clientSource: string | undefined;
  let agent: string | undefined;
  let officeName: string | undefined;
  let model: string | undefined;
  let cwd = o.cwd;
  let inOffice = false;

  const write = (msg: object) => o.output.write(JSON.stringify(msg) + "\n");
  const text = (t: string, isError = false): ToolResult => ({ content: [{ type: "text", text: t }], ...(isError ? { isError } : {}) });

  /** Posts events; never throws. Returns an error text for the agent, or undefined when accepted. */
  async function post(events: object[]): Promise<{ down?: true; error?: string }> {
    try {
      const r = await fetch(o.url, {
        method: "POST",
        headers: { authorization: `Bearer ${o.token}`, "content-type": "application/json" },
        body: JSON.stringify(events),
        signal: AbortSignal.timeout(POST_TIMEOUT_MS),
      });
      if (r.ok) return {};
      return { error: `the office answered ${r.status}: ${(await r.text()).slice(0, 200)}` };
    } catch {
      return { down: true };
    }
  }

  const base = () => ({ source: source ?? clientSource ?? "mcp", session, ...(agent ? { agent } : {}), ...(officeName ? { name: officeName } : {}), ...(model ? { model } : {}), ...(cwd ? { cwd } : {}) });

  /** Sends one event, entering the office first if needed (a leaving character only comes back with `start`). */
  async function send(kind: EventKind, extra: object = {}): Promise<ToolResult> {
    const events: object[] = [];
    if (!inOffice && kind !== "start" && kind !== "end") events.push({ ...base(), kind: "start" });
    events.push({ ...base(), kind, ...extra });
    const r = await post(events);
    if (r.down) return text(`deskmates office not reachable at ${o.url}; nothing recorded. Carry on with your task, no need to retry.`);
    if (r.error) return text(r.error, true);
    inOffice = kind !== "end";
    return text(kind === "end" ? "left the office" : "ok");
  }

  const optStr = (a: Record<string, unknown>, k: string, max: number) => {
    const v = a[k];
    if (v === undefined) return undefined;
    if (typeof v !== "string" || v.length > max) throw new InvalidArgs(`${k} must be a string of at most ${max} chars`);
    return v || undefined;
  };
  const count = (a: Record<string, unknown>, k: string, required: boolean) => {
    const v = a[k];
    if (v === undefined && !required) return undefined;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) throw new InvalidArgs(`${k} must be a non-negative number`);
    return Math.floor(v);
  };

  async function callTool(name: string, a: Record<string, unknown>): Promise<ToolResult> {
    switch (name) {
      case "office_start": {
        const s = optStr(a, "source", 40);
        if (s !== undefined && !SOURCE_RE.test(s)) throw new InvalidArgs("source must match [a-z0-9._-], 1-40 chars, starting with a letter or digit");
        const nextAgent = optStr(a, "agent", 80), nextName = optStr(a, "name", 40), nextModel = optStr(a, "model", 80), nextCwd = optStr(a, "cwd", 400);
        // A different source is a different character: the old one walks out first.
        if (s && s !== base().source && inOffice) await send("end");
        if (s) source = s;
        if (nextAgent) agent = nextAgent;
        if (nextName) officeName = nextName;
        if (nextModel) model = nextModel;
        if (nextCwd) cwd = nextCwd;
        return send("start");
      }
      case "office_name": {
        const n = optStr(a, "name", 40);
        if (!n) throw new InvalidArgs("name must be a string of 1-40 chars");
        officeName = n;
        return send("start");
      }
      case "office_status": {
        const kinds: Record<string, EventKind> = { working: "tool", waiting: "waiting", idle: "idle" };
        const kind = kinds[a.state as string];
        if (!kind) throw new InvalidArgs("state must be one of working, waiting, idle");
        const tool = optStr(a, "tool", 80);
        // Same rule as the hooks: one short line, clipped to 120 chars.
        const raw = typeof a.detail === "string" ? a.detail.split("\n")[0].trim() : optStr(a, "detail", 120);
        const detail = raw ? clip(raw) : undefined;
        return send(kind, { ...(tool ? { tool } : {}), ...(detail ? { detail } : {}) });
      }
      case "office_usage": {
        const tokens: Tokens = { input: count(a, "input", true)!, output: count(a, "output", true)! };
        const cr = count(a, "cacheRead", false), cw = count(a, "cacheWrite", false);
        if (cr !== undefined) tokens.cacheRead = cr;
        if (cw !== undefined) tokens.cacheWrite = cw;
        return send("usage", { tokens });
      }
      case "office_end":
        if (!inOffice) return text("not in the office");
        return send("end");
    }
    throw new Error("unknown tool");
  }

  async function handle(m: Rpc): Promise<object | undefined> {
    const p = m.params ?? {};
    const meta = (p._meta ?? {}) as Record<string, unknown>;
    // Legacy clients name themselves once in initialize; modern ones on every request.
    const info = (p.clientInfo ?? meta["io.modelcontextprotocol/clientInfo"]) as { name?: unknown } | undefined;
    if (info?.name !== undefined) clientSource ??= sourceFromClient(info.name);
    const requested = meta["io.modelcontextprotocol/protocolVersion"];
    // resultType is required from 2026-07-28 on; older clients get the plain result.
    const reply = (result: object) => ({ jsonrpc: "2.0", id: m.id, result: requested !== undefined ? { resultType: "complete", ...result } : result });
    const fail = (code: number, message: string, data?: object) => ({ jsonrpc: "2.0", id: m.id, error: { code, message, ...(data ? { data } : {}) } });
    if (requested !== undefined && !MODERN_VERSIONS.includes(requested as string))
      return fail(-32022, "Unsupported protocol version", { supported: MODERN_VERSIONS, requested });

    switch (m.method) {
      case "initialize": {
        const v = p.protocolVersion as string;
        return reply({
          protocolVersion: LEGACY_VERSIONS.includes(v) ? v : LEGACY_VERSIONS[0],
          capabilities: { tools: {} }, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS,
        });
      }
      case "server/discover":
        return { jsonrpc: "2.0", id: m.id, result: { resultType: "complete", supportedVersions: MODERN_VERSIONS, capabilities: { tools: {} }, instructions: INSTRUCTIONS, _meta: { "io.modelcontextprotocol/serverInfo": SERVER_INFO } } };
      case "ping":
        return reply({});
      case "tools/list":
        return reply({ tools: TOOLS });
      case "tools/call": {
        const name = p.name as string;
        if (!TOOLS.some((t) => t.name === name)) return fail(-32602, `Unknown tool: ${String(name)}`);
        const args = p.arguments ?? {};
        if (typeof args !== "object" || Array.isArray(args)) return fail(-32602, "arguments must be an object");
        try {
          return reply(await callTool(name, args as Record<string, unknown>));
        } catch (e) {
          // Bad arguments go back to the model as a tool error it can correct (spec: tool execution errors).
          if (e instanceof InvalidArgs) return reply(text(e.message, true));
          throw e;
        }
      }
      default:
        return fail(-32601, `Method not found: ${String(m.method)}`);
    }
  }

  // Requests are answered in order of arrival; tool calls are short (1 s ceiling), so a queue keeps events ordered.
  let queue: Promise<void> = Promise.resolve();
  const lines = createInterface({ input: o.input, crlfDelay: Infinity });
  lines.on("line", (line) => {
    if (!line.trim()) return;
    let m: Rpc;
    try { m = JSON.parse(line); } catch { write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); return; }
    if (Array.isArray(m)) { write({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Batches are not supported" } }); return; }
    if (!m || typeof m !== "object" || "result" in m || "error" in m) return; // responses: this server sends no requests
    if (typeof m.method !== "string") { write({ jsonrpc: "2.0", id: m.id ?? null, error: { code: -32600, message: "Invalid Request" } }); return; }
    if (m.id === undefined) return; // notifications (initialized, cancelled): nothing to answer
    queue = queue.then(async () => {
      try {
        const r = await handle(m);
        if (r) write(r);
      } catch (e) {
        log(e instanceof Error ? e.message : String(e));
        write({ jsonrpc: "2.0", id: m.id, error: { code: -32603, message: "Internal error" } });
      }
    });
  });
  await new Promise<void>((resolve) => lines.once("close", resolve));
  await queue;
  // The client exited: the character walks out instead of waiting 30 minutes of silence.
  if (inOffice) await send("end");
}
