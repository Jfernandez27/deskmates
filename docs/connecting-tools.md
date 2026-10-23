# Connecting your tools

| Tool | How deskmates sees it | Setup | Live states |
|---|---|---|---|
| Claude Code | hooks | `deskmates connect --profile <dir>` | working, typing/reading, waiting for permission, idle, end, subagents, tokens |
| Codex CLI and Codex desktop | session files | none | working, tools, idle per task, tokens |
| GitHub Copilot CLI | session files | none | working, tools, tokens at the end, end |
| Cursor agent (editor and CLI) | session files | none | working, tools, idle |
| Gemini CLI | session files | none | working, tools, idle, tokens |
| Any MCP client | [MCP server](mcp.md) | add `deskmates mcp` to its MCP settings | whatever the agent reports: working, waiting, idle, end, tokens |
| Anything else | [ingest API](ingest-api.md) | send events | whatever you send |

## Claude Code

`deskmates connect` writes one entry per hook event into `<profile>/settings.json`, each marked `"_deskmates": true`, after saving `settings.json.bak-deskmates-<timestamp>` next to it. It never touches other hooks, plugins or settings, keeps the file's indentation, and is safe to run again.

The hook is `bin/deskmates-hook.sh`, which `connect` copies to `~/.config/deskmates/deskmates-hook.sh` (a path that stays when node is upgraded or nvm switches versions) and points settings.json at: it posts the hook payload to `127.0.0.1:47821` with a 50 ms ceiling and always exits 0. Set `DESKMATES_PORT` in the agent's environment if you serve on another port.

- **Several profiles.** Connect each one, or all of them with `deskmates connect --all` (every `~/.claude*` directory that holds a `settings.json` or `projects/`, plus `$CLAUDE_CONFIG_DIR`); `doctor` checks the same list. Characters show the profile name (`claude-work · designer`), so two profiles never mix.
- **Named agents.** Sessions started with `claude --agent plugin:name` and subagents (`Explore`, `Plan`, your own) carry their name; [roles.md](roles.md) maps names to outfits.
- **Tokens.** Read from the session transcript after each event.
- **Moved the repository?** Run `connect` again: `doctor` warns when hooks point to an old path.

## Session files

`deskmates serve` polls these paths every second. Files that were already quiet for 30 minutes when it started are skipped, so old sessions do not walk in.

| Tool | Path | Override |
|---|---|---|
| Codex | `~/.codex/sessions/**/rollout-*.jsonl` | `$CODEX_HOME` |
| Copilot CLI | `~/.copilot/session-state/*/events.jsonl` | `$COPILOT_HOME` |
| Cursor | `~/.cursor/projects/*/agent-transcripts/*/*.jsonl` | — |
| Gemini CLI | `~/.gemini/tmp/*/chats/session-*.jsonl` | `$GEMINI_CLI_HOME` |

Limits:
- These files have no "waiting for your permission" line, so those tools never show the **?**.
- Most have no explicit end: their characters fall asleep after 10 quiet minutes and leave after 30.
- Cursor lines have no timestamps; the file time is used.
- Formats can change with a tool update. A line deskmates cannot read is skipped; `deskmates doctor` shows which tools it found.

Turn session files off with `deskmates serve --no-transcripts`.

## MCP clients

Any agent that speaks MCP can report itself with `deskmates mcp`, a stdio MCP server with five tools (`office_start`, `office_name`, `office_status`, `office_usage`, `office_end`). Config snippets for Claude Code, Codex, Cursor, Gemini CLI and any other client, plus a line to put in `AGENTS.md`/`CLAUDE.md`, are in [mcp.md](mcp.md).

## Agents on other machines

See [lan-and-remote.md](lan-and-remote.md).
