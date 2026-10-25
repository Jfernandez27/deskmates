#!/usr/bin/env node
import { existsSync, accessSync, constants, readFileSync } from "node:fs";
import { homedir, networkInterfaces } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { startServer, DEFAULT_PORT } from "../src/server/server.ts";
import { connect, disconnect, findProfiles, hookIsCurrent, installHook, status } from "../src/cli/connect.ts";
import { loadRoles } from "../src/core/roles.ts";
import { loadOrCreateToken, readRelayToken, TOKEN_FILE } from "../src/cli/token.ts";
import { TRANSCRIPT_ADAPTERS } from "../src/adapters/index.ts";
import { cast, eventsAt, endAll, normalize, DEFAULTS, TICK_MS } from "../src/cli/demo.ts";
import type { AgentEvent } from "../src/types/events.ts";
import { runMcp } from "../src/cli/mcp.ts";
import { glob } from "node:fs/promises";
import { packageRoot, configDir } from "../src/root.ts";
import { rankAddresses } from "../src/server/lan-address.ts";
import { lanBanner } from "../src/cli/lan-banner.ts";
import { loadOrCreateMachineId, displayName, hostName } from "../src/cli/machine.ts";
import { defaultHistoryDir } from "../src/server/history-store.ts";

const ROOT = packageRoot();
const HOOK = join(ROOT, "bin", "deskmates-hook.sh");
/** where settings.json points: a copy of HOOK that stays put when node (and the package with it) moves */
const HOOK_COPY = join(configDir(), "deskmates-hook.sh");
const WEB = join(ROOT, "dist", "web");

const args = process.argv.slice(2);
const cmd = args[0];
const flag = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const expand = (p: string) => resolve(p.replace(/^~(?=$|\/)/, homedir()));
const profileArg = () => expand(flag("profile") ?? process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"));
/** --port, else DESKMATES_PORT (an empty one is unset), else 47821; anything but 1-65535 is refused rather than turned into a random port */
const port = (() => {
  const raw = flag("port") ?? (process.env.DESKMATES_PORT || undefined);
  if (raw === undefined) return DEFAULT_PORT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) { console.error(`deskmates: port must be a number from 1 to 65535, got "${raw}"`); process.exit(2); }
  return n;
})();

const knownProfiles = () => findProfiles(homedir(), [process.env.CLAUDE_CONFIG_DIR, flag("profile")].map((p) => p && expand(p)));
/** --all: every profile on this machine; otherwise the one named, $CLAUDE_CONFIG_DIR or ~/.claude */
const targetProfiles = () => (args.includes("--all") ? knownProfiles() : [profileArg()]);
const requireWeb = () => {
  if (!existsSync(join(WEB, "index.html"))) { console.error(`The web app is not built. Run: npm run build:web (in ${ROOT})`); process.exit(1); }
};

async function main() {
  switch (cmd) {
    case "serve": {
      requireWeb();
      const shared = args.includes("--shared");
      const transcripts = args.includes("--no-transcripts") || shared ? [] : TRANSCRIPT_ADAPTERS;
      const relayUrl = (flag("relay") ?? process.env.DESKMATES_RELAY)?.replace(/\/$/, "");
      if (relayUrl !== undefined) {
        let ok = false;
        try { ok = ["http:", "https:"].includes(new URL(relayUrl).protocol); } catch { /* not a URL */ }
        if (!ok) { console.error("--relay needs a full URL such as http://lab:47821"); process.exit(2); }
      }
      const relayToken = readRelayToken(flag("relay-token"));
      if (relayUrl && !relayToken) {
        console.error("--relay needs the lab's token: --relay-token, DESKMATES_RELAY_TOKEN or ~/.config/deskmates/relay-token (print it on the lab with: deskmates token)");
        process.exit(2);
      }
      const relay = relayUrl && relayToken
        ? { url: relayUrl, token: relayToken, owner: loadOrCreateMachineId(), ownerName: displayName(flag("name")), ownerHost: hostName() }
        : undefined;
      const lan = args.includes("--lan");
      if (shared && !lan) console.error("note: --shared without --lan only listens on 127.0.0.1; add --lan so other PCs can relay to it");
      const token = loadOrCreateToken();
      const addresses = rankAddresses(networkInterfaces());
      const s = await startServer({ port, webDir: WEB, token, transcripts, lan, addresses: () => rankAddresses(networkInterfaces()), theme: flag("theme"), themesDir: flag("themes"), historyDir: defaultHistoryDir(), relay, shared });
      console.log(`deskmates: http://127.0.0.1:${s.port}`);
      if (transcripts.length) console.log(`following transcripts of: ${transcripts.map((t) => t.source).join(", ")}`);
      console.log(`ingest API token: ${TOKEN_FILE}`);
      for (const l of lanBanner({ lan, port: s.port, token, addresses, tty: !!process.stdout.isTTY, relay: relay && { url: relay.url, ownerName: relay.ownerName } })) console.log(l);
      const stop = async () => { await s.close(); process.exit(0); };
      process.on("SIGINT", stop); process.on("SIGTERM", stop);
      return;
    }
    case "connect": {
      installHook(HOOK, configDir());
      for (const p of targetProfiles()) {
        const backup = connect(p, HOOK_COPY);
        console.log(backup ? `Connected ${p}. Backup: ${backup}` : `Connected ${p}.`);
      }
      if (port !== DEFAULT_PORT) console.log(`Note: the hook posts to port ${DEFAULT_PORT} unless DESKMATES_PORT is set in the agent's environment.`);
      return;
    }
    case "disconnect": {
      for (const p of targetProfiles()) console.log(disconnect(p) ? `Disconnected ${p}.` : `Nothing to remove in ${p}.`);
      return;
    }
    case "demo": {
      const num = (k: string) => (flag(k) === undefined ? undefined : Number(flag(k)));
      const token = loadOrCreateToken();
      // no office running on this machine: open one with the demo alone in it, so one command shows the office
      let own = false;
      if (flag("url") === undefined && !(await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(1000) }).then((r) => r.ok, () => false))) {
        requireWeb();
        await startServer({ port, webDir: WEB, token, transcripts: [] });
        own = true;
        console.log(`deskmates: http://127.0.0.1:${port} — no office was running, so the demo opened one with simulated agents only; Ctrl+C closes it`);
      }
      const o = normalize({
        agents: num("agents"), meetings: num("meetings"), waiting: num("waiting"), subagents: num("subagents"), breaks: num("breaks"), pcs: num("pcs"),
        tools: flag("tools") === undefined ? DEFAULTS.tools : flag("tools")!.split(",").filter(Boolean),
        seconds: num("minutes") === undefined ? (own ? 0 : DEFAULTS.seconds) : num("minutes")! * 60,
      } as never);
      const url = `${(flag("url") ?? `http://127.0.0.1:${port}`).replace(/\/$/, "")}/v1/events`;
      const c = cast(o);
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const send = async (all: AgentEvent[]) => {
        // the office takes one PC per request, so events are posted in groups of the same owner
        const groups = new Map<string | undefined, AgentEvent[]>();
        for (const e of all) { const g = groups.get(e.owner) ?? []; g.push(e); groups.set(e.owner, g); }
        for (const events of groups.values()) for (let i = 0; i < events.length; i += 100) {
          for (let attempt = 0; ; attempt++) {
            try {
              const r = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(events.slice(i, i + 100)) });
              if (!r.ok) console.error(`office answered ${r.status}: ${await r.text()}`);
              break;
            } catch {
              if (attempt === 0) console.error(`waiting for the office at ${url} …`);
              if (attempt > 60) { console.error("office unreachable, giving up"); process.exit(1); }
              await sleep(1000);
            }
          }
        }
      };
      let stopping = false;
      const stop = async () => { if (stopping) return; stopping = true; await send(endAll(c)); console.log("demo finished: everyone left"); process.exit(0); };
      process.on("SIGINT", stop); process.on("SIGTERM", stop);
      console.log(`demo: ${o.agents} agents, ${o.meetings} meeting pair(s), ${o.waiting} waiting, ${o.subagents} subagent(s), ${o.breaks} on breaks${o.pcs ? `, spread over ${o.pcs} PC(s)` : ""}; tools: claude${o.tools.length ? ", " + o.tools.join(", ") : ""}; ${o.seconds ? `${o.seconds / 60} min` : "until Ctrl+C"}`);
      for (let tick = 0; !stopping && (o.seconds === 0 || tick * TICK_MS < o.seconds * 1000); tick++) {
        await send(eventsAt(c, tick));
        await sleep(TICK_MS);
      }
      await stop();
      return;
    }
    case "mcp": {
      // stdout belongs to the MCP client: every message here goes to stderr.
      const url = `${(flag("url") ?? `http://127.0.0.1:${port}`).replace(/\/$/, "")}/v1/events`;
      const source = flag("source");
      if (source !== undefined && !/^[a-z0-9][a-z0-9._-]{0,39}$/.test(source)) { console.error("--source must match [a-z0-9._-], 1-40 chars"); process.exit(2); }
      // Some clients stop servers with a signal instead of closing stdin: treat both as the end of the session.
      const close = () => process.stdin.destroy();
      process.on("SIGINT", close); process.on("SIGTERM", close);
      await runMcp({ input: process.stdin, output: process.stdout, url, token: loadOrCreateToken(), cwd: process.cwd(), source });
      process.exit(0);
    }
    case "token": {
      console.log(loadOrCreateToken());
      return;
    }
    case "doctor": {
      let ok = true;
      const relayUrl = (flag("relay") ?? process.env.DESKMATES_RELAY)?.replace(/\/$/, "");
      const line = (good: boolean, msg: string) => { if (!good) ok = false; console.log(`${good ? "✓" : "✗"} ${msg}`); };
      let curl = false;
      try { execFileSync("curl", ["--version"], { stdio: "ignore" }); curl = true; } catch {}
      line(curl, curl ? "curl found" : "curl not found: the hook needs it");
      let exec = false;
      try { accessSync(HOOK_COPY, constants.X_OK); exec = true; } catch {}
      if (!exec) line(false, `hook script is missing or not executable: ${HOOK_COPY} (run: deskmates connect)`);
      else line(hookIsCurrent(HOOK, HOOK_COPY), hookIsCurrent(HOOK, HOOK_COPY) ? `hook script is executable: ${HOOK_COPY}` : `hook script ${HOOK_COPY} is older than this deskmates (run: deskmates connect)`);
      const rolesFile = join(configDir(), "roles.toml");
      if (existsSync(rolesFile)) {
        const problems: string[] = [];
        loadRoles(rolesFile, (m) => problems.push(m));
        line(!problems.length, problems[0] ?? `${rolesFile} is valid`);
      }
      try {
        const h = await (await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(1000) })).json() as any;
        line(true, `service up on port ${port}, ${h.characters} character(s)`);
        if (h.lastEvent) line(h.lastEvent.decoded, `last event ${h.lastEvent.at} from ${h.lastEvent.source ?? "?"}/${h.lastEvent.profile ?? "?"} ${h.lastEvent.decoded ? "decoded" : "NOT decoded"}`);
        else console.log("· no events received yet");
        if (!relayUrl && typeof h.owners === "number") {
          try {
            const cfg = await (await fetch(`http://127.0.0.1:${port}/v1/config`, { signal: AbortSignal.timeout(1000) })).json() as any;
            if (cfg.shared) console.log(`· shared office: ${h.owners} PC(s) seen`);
          } catch {}
        }
      } catch { line(false, `service not reachable on port ${port} (run: deskmates serve)`); }
      if (relayUrl) {
        const token = readRelayToken(flag("relay-token"));
        if (!token) line(false, `shared office at ${relayUrl}: no token (--relay-token, DESKMATES_RELAY_TOKEN or ~/.config/deskmates/relay-token)`);
        else {
          try {
            const r = await fetch(`${relayUrl}/healthz?token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(2000) });
            if (r.status === 200) line(true, `shared office at ${relayUrl}: ${((await r.json()) as any).owners} PC(s) connected`);
            else if (r.status === 401) line(false, `shared office at ${relayUrl}: token refused`);
            else line(false, `shared office at ${relayUrl} unreachable`);
          } catch { line(false, `shared office at ${relayUrl} unreachable`); }
        }
      }
      for (const a of TRANSCRIPT_ADAPTERS) {
        let n = 0;
        for (const pat of a.patterns()) { try { for await (const _ of glob(pat)) n++; } catch {} }
        console.log(`${n ? "✓" : "·"} ${a.source}: ${n ? `${n} transcript file(s) found` : "no transcripts found (not installed or never used)"}`);
      }
      for (const p of knownProfiles()) {
        let s;
        try { s = status(p, HOOK_COPY); } catch (e) { line(false, `${p}: ${(e as Error).message}`); continue; }
        const why = [s.stale && "pointing to an old path", s.missing.length && `missing ${s.missing.join(", ")}`].filter(Boolean).join(", ");
        line(s.connected && !why, `${p}: ${s.connected ? `${s.entries} hooks${why ? `, ${why} — run connect again` : ""}` : "not connected"}`);
      }
      process.exitCode = ok ? 0 : 1;
      return;
    }
    case "--version": case "-v": case "version": {
      console.log(JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version);
      return;
    }
    default:
      console.log(`deskmates — a pixel-art office for your AI coding agents

  deskmates serve [--port N] [--no-transcripts] [--lan] [--theme <id>] [--themes <dir>]
                 [--relay <url> [--relay-token <token>] [--name <name>]] [--shared]
                                      start the office at http://127.0.0.1:${DEFAULT_PORT} and follow
                                      Codex, Copilot CLI, Cursor and Gemini CLI transcripts;
                                      --lan also serves your network, protected by the token;
                                      --themes: your own themes (default ~/.config/deskmates/themes);
                                      --relay (or DESKMATES_RELAY): also send every event to the shared office at <url>
                                      (token: --relay-token, DESKMATES_RELAY_TOKEN or ~/.config/deskmates/relay-token);
                                      --name: how you are called there (default: your user name);
                                      --shared: host a shared office (implies --no-transcripts); it opens
                                      on the Headquarters floor unless --theme says otherwise
                                      See docs/shared-office.md
  deskmates connect [--profile DIR | --all]   add hooks to a Claude Code profile (default: $CLAUDE_CONFIG_DIR or ~/.claude;
                                      --all: every ~/.claude* profile)
  deskmates disconnect [--profile DIR | --all] remove only the hooks deskmates added
  deskmates doctor [--relay <url>]    check curl, the hook, the service, transcripts and each profile
  deskmates token                     print the token for POST /v1/events (see docs/ingest-api.md)
  deskmates demo [--agents 6] [--meetings 1] [--waiting 1] [--subagents 1] [--breaks 1]
                 [--tools codex,copilot,gemini] [--minutes 10] [--url http://host:47821] [--pcs 4]
                                      fill the office with simulated agents (0 minutes = until Ctrl+C);
                                      with no office running here, opens its own with the demo alone
                                      and runs until Ctrl+C;
                                      --pcs spreads them over several PCs, as in a shared office
  deskmates mcp [--url http://host:47821] [--source NAME]
                                      stdio MCP server: any MCP client reports its agent to the office
                                      (see docs/mcp.md)
  deskmates --version                 print the version
  deskmates --help                    this help (also -h)`);
      if (cmd && !["help", "--help", "-h"].includes(cmd)) process.exitCode = 2;
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
