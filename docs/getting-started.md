# Getting started

## Requirements

| | Version | Why |
|---|---|---|
| Node.js | 22.18 or newer | runs the service; TypeScript runs natively from source |
| curl | any | the Claude Code hook posts events with it |
| A browser | any recent one | the office is a web page |
| Claude Code | 2.1 or newer | for live Claude sessions (other tools are optional) |

Linux and macOS are supported. On Windows use WSL.

## Install

From npm:

```bash
npm install -g deskmates
npm update -g deskmates     # later, to get a new version
```

From the repository, to change it or follow `main`:

```bash
git clone https://github.com/Jfernandez27/deskmates.git
cd deskmates
npm install
npm link            # optional: makes `deskmates` available everywhere
npm run build       # after each `git pull`: rebuilds the page and the CLI the link points to
```

Each [GitHub release](https://github.com/Jfernandez27/deskmates/releases) also carries the package file: `npm install -g ./deskmates-<version>.tgz`.

## First run

1. **Start the office.**
   ```bash
   deskmates serve                # installed from npm, or linked
   npm start                      # from a clone without npm link: builds the page, then serves
   ```
   Open <http://127.0.0.1:47821>.
2. **Connect Claude Code.** Once per profile:
   ```bash
   deskmates connect                          # $CLAUDE_CONFIG_DIR or ~/.claude
   deskmates connect --profile ~/.claude-work # any other profile
   deskmates connect --all                    # every ~/.claude* profile at once
   ```
   New Claude Code sessions in that profile walk into the office. Sessions already running pick the hooks up on their next event.
3. **Check everything.**
   ```bash
   deskmates doctor
   ```

Codex, Copilot CLI, Cursor and Gemini CLI need no setup: `deskmates serve` follows their session files. See [connecting-tools.md](connecting-tools.md).

## Keep it running

`deskmates serve` runs in the foreground. To start it with your session on Linux, a user service works well:

```ini
# ~/.config/systemd/user/deskmates.service
[Unit]
Description=deskmates office

[Service]
ExecStart=%h/.local/bin/deskmates serve
Restart=on-failure

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now deskmates
```

Adjust `ExecStart` to where `deskmates` lives (`command -v deskmates`). Add `--lan` to see it from other devices.

## The page

- **Header:** connection status, number of agents, theme, characters, pets, **History**, and the bell (sound and notifications).
- **Hover or tap** a character for its card; in the VS Code panel a click also jumps to its terminal.
- **URL options:** `?theme=<id>|auto`, `?season=auto|<id>|off`, `?kiosk` (no bar, the office fills the window; a double-click, or the kiosk button in the bar, asks for full screen), `?chars=deskmates|pixel-agents|all`, `?pets=auto|all|<name>|off` (`auto`, the default: two pets per open room; `all`: all six; or one of `claudio`, `gitcat`, `pascal`, `biscuit`, `nova`, `pip`).

What everything on the page means, and the everyday tasks, are in [usage.md](usage.md).

## Commands

| Command | What it does |
|---|---|
| `deskmates serve [--port N] [--lan] [--theme ID] [--no-transcripts]` | starts the office (default port 47821) |
| `deskmates connect [--profile DIR]` | adds deskmates hooks to a Claude Code profile, with a backup |
| `deskmates disconnect [--profile DIR]` | removes only the hooks deskmates added |
| `deskmates doctor` | checks curl, the hook script, the service, transcripts and each profile |
| `deskmates token` | prints the API token (creates it on first use) |
| `deskmates demo [options]` | fills the office with simulated agents, see below |
| `deskmates mcp [--url URL] [--source NAME]` | stdio MCP server for any MCP client, see [mcp.md](mcp.md) |

## Demo mode

Shows what deskmates looks like without spending tokens: simulated agents are posted to the running office through the ingest API.

1. Start the office in one terminal: `deskmates serve` (add `--lan` to watch from another device). From a clone without `npm link`, run `npm start`.
2. Open `http://127.0.0.1:47821`.
3. In another terminal, run the demo. From a clone without `npm link`, use `node bin/deskmates.ts demo …` instead of `deskmates demo …`.
4. Stop it with Ctrl+C, or let `--minutes` run out.

The demo waits up to a minute if the office is not up yet. It reads the token from `~/.config/deskmates/token` (created on first use); to post to another machine, copy that machine's token there first.

```bash
deskmates demo                                   # 6 agents, 1 meeting, 1 waiting, 1 subagent, 1 on breaks, 10 minutes
deskmates demo --agents 12 --meetings 2 --waiting 2 --subagents 3 --breaks 2 --minutes 0
deskmates demo --tools codex,cursor --url http://192.168.1.20:47821   # another machine, office in --lan mode
deskmates demo --pcs 4 --waiting 2                # a shared office: the cast spread over four PCs, each with its colour and name
```

`--pcs` stamps every simulated agent with a PC of its own (Jesús, Ana, Beto, Carla…), the way `serve --relay` does, so the page shows the shirt colours, the PC names on the labels and the chats between PCs described in [shared-office.md](shared-office.md), against any office, shared or not.

| Option | Default | What it adds |
|---|---|---|
| `--agents N` | 6 | agents working at their desks (up to 40); more than 8 opens more rooms |
| `--meetings N` | 1 | pairs that share a project and meet at the table every couple of minutes |
| `--waiting N` | 1 | agents that ask for permission (the **?**) and wait |
| `--subagents N` | 1 | subagents next to a working agent; they hand over and leave, then come back |
| `--breaks N` | 1 | agents that finish now and then and go to the vending machines |
| `--tools LIST` | `codex,copilot,gemini` | other tools mixed in with Claude (`codex`, `copilot`, `cursor`, `gemini`; empty for Claude only) |
| `--minutes M` | 10 | duration; `0` runs until Ctrl+C |
| `--url URL` | this machine | office to post to |

When it ends, or on Ctrl+C, every simulated agent walks out. Demo agents use the profile `demo`, so they never mix with real sessions.

Every agent takes a desk and each room has 8, so the number of rooms is the total count divided by 8, rounded up: agents + 2 × meetings + waiting + subagents + breaks, plus your real sessions. The defaults make 10 agents (2 rooms); `--agents 12 --meetings 2 --waiting 2 --subagents 2 --breaks 2` makes 22 (3 rooms). Subagents sit next to their parent when its room has a free desk, otherwise at the first free desk anywhere. When agents leave and a room is no longer needed, whoever is still in it walks to a free desk in an earlier room and the empty room closes.

If a demo is killed with `kill -9` it cannot send its goodbyes; its agents fall asleep after 10 minutes and leave after 30. Running the demo again with the same or larger numbers and stopping it with Ctrl+C clears them at once, because the simulated sessions keep the same names.

## Uninstall

```bash
deskmates disconnect --all                       # every ~/.claude* profile
npm uninstall -g deskmates                       # or `npm unlink` if you linked it
rm -rf ~/.config/deskmates ~/.local/state/deskmates   # token, roles, history
```
