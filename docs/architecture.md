# Architecture

```
Claude Code ──hook──▶ deskmates-hook.sh ──HTTP──┐
Codex · Copilot · Cursor · Gemini ──session files (polled)──┤
any tool / CI ──POST /v1/events (token)──────────┤
other PCs ──relay: POST /v1/events + owner──────┤
                                                 ▼
                                  deskmates serve (src/server)
                         adapters → normalized AgentEvent → dedup
                                   → pure reducer → OfficeState
                                                 │ WebSocket /ws
                                                 ▼
                           page (web/): Scene → canvas renderer
                           VS Code panel = the same page in a webview
```

## Units

| Path | Responsibility |
|---|---|
| `src/types/events.ts` | `AgentEvent` (what every adapter emits) and `Character`/`OfficeState` |
| `src/adapters/claude/` | hook payload → events; token totals from Claude transcripts |
| `src/adapters/{codex,copilot,cursor,gemini}/` | one decoder per tool's session file format |
| `src/adapters/transcript.ts`, `tail.ts` | polling of session files, incremental line reading |
| `src/adapters/detail.ts` | the short, content-free description of a tool call |
| `src/core/reducer.ts` | pure `reduce(state, event)` and `tick(state, now)`: status, desks, silence rules |
| `src/core/roles.ts` | roles.toml → outfits |
| `src/core/qr.ts` | QR encoder: byte mode, level M, versions 1–10, no dependencies; shared by the CLI and the page |
| `src/server/` | HTTP routes (`GET /v1/lan` gives the link a tablet can reach), WebSocket feed, ingest API validation, LAN access rules |
| `src/server/lan-address.ts` | ranks the machine's IPv4 addresses: the first non-virtual private one, wifi or wired first, is the link; the rest are listed |
| `src/cli/` | connect/disconnect, token |
| `src/cli/qr-text.ts`, `lan-banner.ts` | the QR as half-block text; what `serve --lan` prints |
| `bin/deskmates.ts` | the CLI |
| `web/scene.ts` | per-character actors: walking, breaks, meetings, pets (no drawing) |
| `web/render.ts` | canvas drawing: room, furniture, characters, bubbles, lights |
| `web/layout.ts` | the `Floor` type (size, seats, door, decor, meeting seats, island size), `ROOM` (today's 24 × 14 room), walkability |
| `web/theme.ts` | theme schema, seasons, auto-by-hour; `floorOf(theme)`: the room, or the theme's own floor |
| `src/core/floor-spec.ts` | checks a theme's `layout` block; shared by the page and the server (`src/server/theme-floor.ts`) |
| `web/share.ts`, `web/qr.ts` | the Share dialog; the QR drawn on a canvas |
| `web/kiosk.ts` | kiosk state: on or off, the 4-second peek, the remembered choice (no DOM) |
| `web/icons.ts` | pixel glyphs for the bar buttons |

## Shared office

An event may carry `owner` (a machine id), `ownerName` and `ownerHost`. The reducer stores `owner` on the character and keeps `OfficeState.owners`, the machine ids in order of first appearance (never shrinking). The server derives each owner's label and colour from that order and adds them to the characters it sends; each owner's agents sit at their own island of desks (`src/core/desks.ts`; owner *k* gets island *k* mod the number of islands; when it is full the agent takes a desk on an island no known owner holds, and only then the first free desk; a subagent takes the free desk nearest its parent by the same order; an owner is never pulled off its island when a room closes); and `shared.json` keeps the order across restarts. `src/server/relay.ts` is one more sender: it batches the events a PC's own service produces and posts them to the lab's `/v1/events`, off the hot path, with its own time in `x-deskmates-clock` so the lab can correct a PC whose clock is off; when the lab takes a batch again after a lost one, the relay sends every character it has (a start and its status, at the time of its last real event), since the lab keeps its state in memory only. `/v1/config` tells the page whether the office is shared, which makes it quiet. See [shared-office.md](shared-office.md).

The server sets `state.floor` (desks per room, island size) from the `layout` of the theme it serves (`src/server/theme-floor.ts`, bundled themes only; otherwise 8 and 4) and sends it in `/v1/config`; the page lays the desk numbers out by its own theme's floor, whatever the server's, so nothing is ever off-screen.

## Rules the code keeps

- **Privacy:** events carry a tool name and a detail of at most 120 characters (a file name, the first line of a command). Prompts, file contents and tool output never leave the adapters.
- **Never slow an agent:** the hook has a 50 ms ceiling and always exits 0; remote senders give up after 1 s.
- **Pure core:** the reducer and the scene are deterministic functions of their input and clock, which is what the unit tests exercise.
- **Two profiles never collide:** a session key is `source/profile/session`.
- **Hook beats transcript:** when the same fact arrives both ways within 2 s, the hook version wins.
- **Only this machine's own page reads it:** `/ws` refuses a browser socket whose `Origin` is not the office's host, and `/v1/hook/claude` takes only `application/json` from loopback, so another site open in the browser can neither read the feed nor post events.
- **Nothing stale for the life of the process:** what can change while the service or a page stays up is read when it is used, not once at start: the LAN address on every `/v1/lan`, `/v1/config` on every reconnect, the theme, season and a failed floor every minute, a session file's header even when it was skipped at start. Hooks are stamped by a clock that never steps back.
- **A broken input never stops the service:** an unreadable session file, a bad `roles.toml` or a busy port are reported, not fatal.

## Tests

- `tests/unit/` — reducer, adapters against real recorded fixtures (`tests/fixtures/`, scrubbed), server, ingest API, LAN, connect/disconnect, scripts.
- `tests/web/` — layout, pathing, scene, notifications, themes.
- `tests/e2e/` — Playwright: screenshots of fixed states (`?demo&t=…`), notifications, and an opt-in run against a real Claude Code session (`DESKMATES_E2E_CLAUDE=1`).
