# MCP server

`deskmates mcp` is a stdio [MCP](https://modelcontextprotocol.io) server. Any agent that speaks MCP can put itself in the office through it, with no adapter and no hand-written calls to the [ingest API](ingest-api.md): the agent calls five small tools and deskmates turns them into events.

- One server process is one session. The client starts it, the agent calls the tools, and when the client exits (stdin closes, or SIGTERM) the character walks out.
- It posts to the running office with the token in `~/.config/deskmates/token`, like `deskmates demo`. Start the office first with `deskmates serve`.
- If the office is down, every tool still answers at once (at most 1 s) with a short text saying nothing was recorded. The agent's work is never blocked.

## When to use it

| Tool | Best way in |
|---|---|
| Claude Code | hooks (`deskmates connect`): richer and automatic |
| Codex, Copilot CLI, Cursor, Gemini CLI | session files, nothing to set up |
| Anything else that speaks MCP (Windsurf, Cline, Zed, Goose, Continue, your own agent) | **this server** |

You can also use it with the tools above, for example to report a named role or the **?** for tools whose session files have no "waiting" line. The MCP session is a separate character from the one the hooks or session files show, so you will see two characters for that agent; run `deskmates serve --no-transcripts` if you prefer only the MCP one.

## Tools

| Tool | Arguments | Event |
|---|---|---|
| `office_start` | `agent?` (role, e.g. `reviewer`), `name?` (the name on your label, e.g. `Ada`), `model?` (shown on your card), `cwd?` (default: the folder the client started the server in), `source?` (your tool name) | `start` |
| `office_name` | `name` (1–40 chars): the name on your label | `start` (enters the office if needed) |
| `office_status` | `state`: `working` \| `waiting` \| `idle`; `tool?` (e.g. `Edit`); `detail?` (a file name or the first line of a command) | `tool`, `waiting`, `idle` |
| `office_usage` | `input`, `output`, `cacheRead?`, `cacheWrite?`: cumulative token totals | `usage` |
| `office_end` | none | `end` |

- Any tool called before `office_start` enters the office first, so an agent that only ever calls `office_status` still shows up.
- **Source** (the left part of the label): `office_start`'s `source`, else `deskmates mcp --source NAME`, else the name the client gives in the MCP handshake (`codex-mcp-client` becomes `codex`), else `mcp`. It must match `[a-z0-9._-]`, 1–40 chars, like every ingest API source.
- **Privacy:** `detail` keeps only its first line and is clipped to 120 characters, the same rule as the hooks. Tell your agent to send labels, never prompts or file contents.
- Bad arguments come back as a tool error the model can read and fix; nothing is posted.

## Setup

Install deskmates so `deskmates` is on your PATH (`npm link` in the repository, or the packaged build). Otherwise use `node` as the command and `["/path/to/deskmates/bin/deskmates.ts", "mcp"]` as the args.

### Claude Code

```bash
claude mcp add --scope user deskmates -- deskmates mcp
```

### Codex (`~/.codex/config.toml`)

```toml
[mcp_servers.deskmates]
command = "deskmates"
args = ["mcp"]
```

### Cursor (`~/.cursor/mcp.json`, or `.cursor/mcp.json` in a project)

```json
{
  "mcpServers": {
    "deskmates": { "command": "deskmates", "args": ["mcp"] }
  }
}
```

### Gemini CLI (`~/.gemini/settings.json`)

```json
{
  "mcpServers": {
    "deskmates": { "command": "deskmates", "args": ["mcp"] }
  }
}
```

### Any other client (generic stdio entry)

Every MCP client has a place for a local (stdio) server with a command and arguments:

```json
{
  "type": "stdio",
  "command": "deskmates",
  "args": ["mcp", "--source", "my-agent"]
}
```

Options: `--url http://host:47821` posts to another office (another port, or a machine where `serve --lan` runs; that machine's token must be in your token file); `--source NAME` sets the source.

## Tell the agent when to call it

MCP clients pass the server's instructions to the model, but most agents follow a line in their instructions file more reliably. Put this in `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` or your tool's rules file:

```markdown
## deskmates office

The `deskmates` MCP server shows you in the user's office. Calls are cheap; never let them slow your work, and if a call says the office is not reachable, carry on without retrying.

- At the start of a session call `office_start` (pass `agent` if you have a role name), then pick a short first name for yourself and call `office_name` with it.
- Before each step call `office_status` with `state: "working"`, the `tool` you are about to use and a short `detail` such as a file name or the first line of a command. Never put prompts, code or file contents in `detail`.
- When you need the user's answer or permission call `office_status` with `state: "waiting"`.
- When you finish a task and hand back to the user call `office_status` with `state: "idle"`.
- If you know your token totals, call `office_usage` with the cumulative numbers.
- When the session is over call `office_end`.
```

## Protocol

JSON-RPC 2.0 over stdio, one message per line. The server answers `initialize` (protocol versions `2025-11-25`, `2025-06-18`, `2025-03-26`, `2024-11-05`; it offers the newest one when the client asks for another) and, for `2026-07-28` clients, `server/discover` with per-request `_meta`. It implements `tools/list`, `tools/call` and `ping`; it has no resources or prompts. stdout carries MCP messages only; errors go to stderr.
