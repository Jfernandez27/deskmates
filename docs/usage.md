# Using deskmates

What the office shows, and how to do the everyday things. Setup is in [getting-started.md](getting-started.md).

## Reading the office

Every agent session is a character. Its seat, pose and bubble tell you what it is doing:

| You see | It means |
|---|---|
| Walks in through the door to a desk | a session started |
| Typing, screen flickering | it is editing or running something (Edit, Write, Bash…) |
| Reading a page | it is reading or searching (Read, Grep, Glob…) |
| **?** over its head, a sound | it is waiting for you: a permission prompt or a question |
| Takes a break (a drink, a coffee, the sofa, a game on the TV) | it finished (or has waited for you more than 15 s); it comes back when work resumes, the **?** follows it |
| Sits at the meeting table with a "…" or a little chart | two free agents working in the same folder |
| **zzz** | no activity for 10 minutes |
| Walks out | the session ended, or 30 quiet minutes passed |
| A label starting with ↳ | a subagent; it wears its parent's team colour on its chest and both labels carry it as a stripe; when it finishes it stops by its parent's seat with a document, then leaves |
| Paper stacks on the desk | tokens the session has written: more paper, more tokens |
| Two agents wave | they walked past each other |

**Hover or tap** a character for its card: its name, the session (`claude-work · id3a:designer`), the model (read from Claude Code and Copilot session files, or sent with `model` through the ingest API or `office_start`), status, the tool and file in use, folder, time in the current status and tokens.

The label is the name the agent chose (`name` in the ingest API, `office_name` or `office_start` over MCP, or `DESKMATES_NAME` in the environment of a Claude Code session you start: `DESKMATES_NAME=Sofía claude`; its subagents keep their own labels), else its role (`designer`, `Explore`), else a name that suits its character, from a bank of twenty women's and twenty men's names, Latin and international (`Sofía`, `Mateo`, `Theo`). An agent keeps that name while it is in the office and no two agents share one; past twenty from one bank a number follows (`Sofía 2`). Characters of your own (`character =` in roles.toml) have no bank and show the folder. Agents from Codex, Copilot, Cursor and Gemini say which tool they are (`codex: Mateo`).

### Rooms

How many desks a room has depends on the theme: the room themes have 8 (two rows of four), Headquarters has 24 on one floor (six islands of four). An agent past the last desk opens a second room (or floor) next to the first; when agents leave and a room is no longer needed, whoever is left walks to a free desk in an earlier room and the room closes. A subagent sits next to its parent when that room has a free desk.

## The summary in the bar

Next to the connection badge the bar sums the office up: `1 waiting · 3 working · 1 done · 1 asleep` (states with nobody in them are left out; waiting is yellow). Click a count to see the card of the next agent in that state, next to it; click again for the one after. Inside the VS Code panel it also focuses that agent's terminal, like clicking the character.

## When an agent needs you

- The **?** appears and a sound plays. With the tab hidden you also get a system notification (allow notifications by clicking the bell once).
- A softer sound plays when an agent finishes a job that took more than two minutes.
- Mute both with the bell (🔕). The choice is remembered per browser.
- Browsers play sound only after you clicked the page once.
- `?quiet` removes all of it from a page: no bell, no waiting count, no notifications. A [shared office](shared-office.md) is quiet by default; `?alerts` brings the alerts back there.

## Reduced motion and screen readers

With **reduce motion** turned on in your system, the office holds still: no bouncing **?**, screen flicker, head bobbing while typing or reading, blinking LEDs or animated decor, and the clock's minute hand jumps once a minute. Agents and pets still walk, because that says where they are going.

The canvas has no text a screen reader can read, so the page keeps a hidden list of every agent in the office and what it is doing (`Sofía: waiting for you`, `designer: working, Edit gen.py`, `Mateo: done`), and announces politely when someone needs you or finishes, even with the bell muted.

## Jump to an agent's terminal

In VS Code, run **deskmates: Open office** from the command palette. The office opens in a panel; clicking a character there shows the integrated terminal it runs in. It works for agents that run in a VS Code terminal: Claude Code always, Codex, Copilot, Cursor and Gemini when only one session of that tool runs in that folder. In a browser tab a click only shows the card. Install the extension with [vscode/README.md](../vscode/README.md).

## Change how it looks

All of these are in the page header and remembered per browser; the URL options override them for one link.

| What | Header | URL |
|---|---|---|
| Theme: day, night, cozy, café, server room, library, headquarters, or automatic by hour | theme selector | `?theme=<id>` or `?theme=auto` |
| Characters: the deskmates cast, the Pixel Agents ones, or both | **Characters** | `?chars=deskmates\|pixel-agents\|all` |
| Pets: two per open room (default), all six, one of them, or none | pet selector | `?pets=auto\|all\|<name>\|off` |
| Seasonal decor | season selector: No seasons (default) or Seasons (by date) | `?season=auto`, `?season=<id>` or `?season=off` |

- **Seasons**, once turned on, follow the date: Halloween, Fiestas Patrias and Christmas on their days, and the season of the year the rest of the time. The hemisphere comes from the browser's time zone, so in Santiago October is spring. See [themes.md](themes.md).
- **Default theme for everyone:** `deskmates serve --theme night` (pages that never picked one use it).
- **Outfits by role:** an accessory, a colour badge and a computer per agent name, in `~/.config/deskmates/roles.toml`. See [roles.md](roles.md).
- **A character of your own** for a role: put a 112x96 sheet in `~/.config/deskmates/characters/<name>.png` and add `character = "<name>"` to the role. See [roles.md](roles.md#a-character-of-your-own).
- **Your own theme:** a folder in `~/.config/deskmates/themes/`, listed under **Yours**; see [themes.md](themes.md#your-own-themes).

## Pets

Six pets live in the office: Claudio, Gitcat, Pascal (a tuxedo cat), Biscuit (a tricolour corgi), Nova (a calico cat) and Pip (a lab rabbit). By default each open room brings two of them; a closed room's pair walks out. Each pet roams the whole office: it wanders, goes out one door and comes in through another room's door, sits next to an agent that is idle or asleep at its desk (one pet per agent), and plays tag when it meets another pet. Pets bump into each other instead of walking through, never step on a chair, and get out of the way of agents.

## History

**History** in the header shows today: sessions, working time and tokens in total, active agents per hour, and a timeline of every session with its working and waiting time and tokens (subagents under their parent). Each day is kept in `~/.local/state/deskmates/history/YYYY-MM-DD.json` (or under `$XDG_STATE_HOME`); a past day is at `/v1/history?date=YYYY-MM-DD`. Only names, folders, times and token counts are stored.

## Watch from your phone or another computer

```bash
deskmates serve --lan
```

Scan the QR it prints (or press **Share** in the bar of the page), or open the printed link with `?token=…` once on the other device. Details and the security notes in [lan-and-remote.md](lan-and-remote.md).

## Agents that run elsewhere

- **Scripts, deploys, cron jobs:** `scripts/remote-agent.sh` puts a character in the office for the length of a script. See [lan-and-remote.md](lan-and-remote.md#agents-on-other-machines).
- **GitHub Actions self-hosted runner:** every job becomes a `ci` character. See [lan-and-remote.md](lan-and-remote.md#github-actions-self-hosted-runner).
- **Any other tool:** post events to the [ingest API](ingest-api.md).

## Kiosk mode

For a screen that only shows the office, such as a tablet on a desk or a spare monitor, press the last button in the bar (the expand glyph). The bar goes, the office fills the window and stays centred, and the browser asks for full screen.

Outside kiosk the office is drawn at the largest whole-number scale that fits, counted in the screen's own pixels. Kiosk then stretches it to fill the screen, keeping its shape and its blocky pixels (nearly even: at a fractional stretch some art pixels are one screen pixel wider than others), so a large floor such as Headquarters is not left small in the middle of a TV.

- **Tap the office** and the bar comes back for 4 seconds; the same button (now the shrink glyph) turns kiosk off.
- **A key press** shows the bar too, so the keyboard can reach the button and leave kiosk.
- **Double tap** (or double click) asks for full screen again, for when the browser left it.
- The choice is remembered per browser. `?kiosk` in the address also turns it on (`http://127.0.0.1:47821/?kiosk&theme=night&season=auto`) and wins over what was remembered. `?kiosk` alone does not ask for full screen; the button or a double tap does, because browsers need a gesture for that.
- Theme, characters, pets and seasons are the ones this browser last chose, or set them in the address.

### On a tablet

Start `deskmates serve --lan`, scan the QR, press the kiosk button. deskmates does not keep the screen awake, so raise the tablet's display timeout or it will sleep:

- **Android:** Settings → Display → Screen timeout.
- **iPadOS:** Settings → Display & Brightness → Auto-Lock.

## Show it to someone

```bash
deskmates demo                       # 10 minutes of simulated agents, meetings, a waiting agent, a subagent
deskmates demo --agents 8 --meetings 0 --waiting 0 --subagents 0 --breaks 0   # one full room: every character once
```

Characters are dealt by the desk they first sit at, starting from a different character each time the office fills up from empty, so a full room shows each of the eight once (count your own open sessions as agents). Ctrl+C sends everyone home. Options in [getting-started.md](getting-started.md#demo-mode).

## Several Claude profiles

Connect each profile once (`deskmates connect --profile ~/.claude-work`). Sessions are told apart by their config folder, so the same session id in two profiles never collides, and the label starts with the profile name.

## What is shown, and to whom

Agent names, folders, tool names, file names (not paths) and the first 120 characters of a command or search pattern. Never prompts, file contents or tool output. Process ids, used to find terminals, are sent only to pages opened on the same machine. With `--lan`, anyone with the link sees the same office.
