# Backlog

Ideas accepted for later. Not scheduled in any plan yet.

- **`serve --https`** — a self-signed certificate so a tablet opening the LAN link gets a secure context: system notifications, and a screen wake lock (new work: deskmates calls no wake-lock API yet, and it needs HTTPS). The cost is the browser's certificate warning on the first visit, and where to keep the certificate.
- **A Host check on every route** — the office trusts any request from this machine by socket address. A web page that rebinds its hostname to 127.0.0.1 can read the agent feed and history; `/v1/lan` already refuses it the token. Allow only `localhost`, `127.0.0.1`, `::1` and the LAN addresses as `Host`.
- **Small follow-ups from the LAN QR and kiosk review** — the Share dialog says "Offline." for every fetch failure and its 16 px padding counts as backdrop; the bar's peek in kiosk should also extend while using the bar and accept taps on the margins around the office; tests to add: address ranking by private range and the 172.16–31 boundary, a version 10 QR fixture, `/v1/lan` wrong-token and loopback cases.
- **An accessory per tool in use** — the literal "outfit by task": the prop follows the tool of the moment (magnifier while searching or reading, globe for web search, terminal for commands). Livelier but noisy, an agent would swap props every few seconds; the bubble already shows typing or reading. If done, keep the type's accessory as the identity and show the tool's prop only briefly.
- **Labels that do not climb** — labels stack upward when neighbours' labels overlap at scale 1; on the Headquarters floor the PC prefix makes it worse. Drop the prefix at labelUnit 1, or alternate above and below.
- **Overflow agents back to their island** — an owner's overflow agents spill onto other islands (`assignDesk`) but compaction never moves them back, so one agent can keep a second floor open with free desks on the first.

_(A robustness review shipped on 2026-10-23: the share link finds a network that came up after start; an unreadable session file, a bad roles.toml or a busy port no longer stop the service; another website can no longer read the feed or post hook events; a done Claude agent no longer turns to "?" a minute later; Codex and Gemini sessions quiet at start show up when they resume; doctor and `connect --all` cover every ~/.claude* profile and recognise hooks that lost their mark; hooks run from a copy in ~/.config/deskmates that survives node upgrades, and the service docs work under nvm and on macOS; pages notice a dead connection and stay current for days (theme, season, quiet mode, LAN cookie); the relay re-announces a PC's agents after the lab was away and corrects for clock skew; history no longer recounts tools after a restart; CI tests the packed tarball on node 22.18 and 24.)_

_(The repository was prepared for publication on 2026-10-21: a quick start and the Headquarters screenshot in the README, HTTPS clone URLs, author, homepage and issue tracker in package.json, a CI workflow running the type check, unit and browser tests, and SECURITY.md and CONTRIBUTING.md brought up to date with the shared office and the commit rule.)_

_(The headquarters floor shipped on 2026-10-21: a theme can bring a floor of its own (`layout`: size, seats, door, meeting table, island size); Headquarters is one 48 × 28 floor of six islands of four desks with a café in the middle and a lounge, each island tinted with its PC's colour, and a shared office opens on it. The server numbers desks by its theme's floor (`state.floor`, `/v1/config.floor`) and the page lays them out on its own.)_

_(A QR for the LAN link and kiosk from a button shipped on 2026-10-20: `serve --lan` prints a QR of the first private wifi or wired address and lists the others as text; a Share button in the bar shows the same QR, or how to turn LAN on; a kiosk button turns kiosk on with full screen, a tap brings the bar back for 4 seconds to turn it off, and the choice is remembered per browser. HTTP only, so no notifications or wake lock on the tablet.)_

_(User themes shipped on 2026-10-17: themes in `~/.config/deskmates/themes/<id>/` (or `serve --themes <dir>`) are listed under Yours, served at the same paths as bundled ones and checked with the same rules, room layout included; a broken one is left out with the reason in the console.)_

_(Subagents at the same pixel density shipped on 2026-10-17: a subagent is drawn at full scale like everyone; a ↳ before its label, its parent's team colour on its chest and the same colour as a stripe on both labels tie it to its parent. The team colour is the parent's role colour, else one of six picked by its key.)_

_(A real break room shipped on 2026-10-17: break spots are furniture roles with an activity (drink, coffee, sofa, game) and a facing, so each theme brings its own; the base room has soda, espresso, snacks apart at the head of the aisle, and a TV over a sofa; Cozy's sofa and Café's counter and tables are break spots too.)_

_(A pixel top bar shipped on 2026-10-17: square controls with a hard border and a pixel drop shadow, every select styled alike, at least 32 px tall (44 px on touch), the bell named for screen readers, one line at 1280 px.)_

_(Bitmap labels shipped on 2026-10-17: labels and the z's are set in deskmates' own 5x7 pixel font (web/font.ts, with Spanish accents, ñ, ü, ¿ and ¡) at a whole-number size, half the scale rounded up.)_

_(Pixel night glows were tried on 2026-10-17 and reverted on 2026-10-18: four stepped bands read as targets around each desk, so lamps, screens and machines are smooth radial gradients again.)_

_(All hand-held accessories come from scripts/draw-accessories.py with a dark outline since 2026-10-17; the magnifier, folder and notebook got a one-pixel ring.)_

_(Agents choose their name since 2026-10-17: the `office_name` MCP tool, a line for CLAUDE.md/AGENTS.md in mcp.md, and `DESKMATES_NAME` read by the Claude Code hook for the session it is set in.)_

_(Kiosk mode shipped on 2026-10-17: `?kiosk` hides the bar and lets the office fill the window; a double click goes full screen.)_

_(A summary in the bar shipped on 2026-10-17: counts by state, each a button that shows the next agent in that state.)_

_(Reduced motion and a text view shipped on 2026-10-17: under prefers-reduced-motion everything that moves only to look alive holds still, and a visually hidden list plus a polite live region tell a screen reader who is in and who needs you.)_

_(Biscuit became a tricolour corgi on 2026-10-17 — charcoal coat, tan cheeks, white blaze, chest and socks — so it no longer reads as Claudio.)_

_(Outfits for more agent types shipped on 2026-10-17: toolbox for general-purpose and builders, red pen for reviewers, book for guides, globe for researchers, and the magnifier for cavecrew-investigator too.)_

_(Names shipped on 2026-10-17: a `name` field in the ingest API and `office_start` sets the label apart from the role, and agents with neither get a name from a bank of twenty women's and twenty men's names that suits their character; the card keeps the session and folder.)_

_(A visible done state and a pixel "?" shipped on 2026-10-17: a green check bubble for an agent done at its desk; the permission bubble is a larger outlined pixel bubble and the waiting agent's label turns yellow.)_

_(Rooms in a grid scaled to the window shipped on 2026-10-17: the largest whole-number scale that fits width and height, no 4× cap, centred. Phones are out of scope: below 600 × 400 px the page says the window is too small, so room tabs on phones were dropped.)_

_(Seasons became opt-in on 2026-10-17: off by default, a selector turns them on and the browser remembers it.)_

_(Subagents walking across chairs, and agents in general, was fixed on 2026-10-17: they now route on the chair-free grid.)_

_(The MCP server moved to [ROADMAP.md](ROADMAP.md) on 2026-10-14.)_

_(The vending machines shipped on 2026-10-14.)_

_(Themes moved to [ROADMAP.md](ROADMAP.md) on 2026-10-14.)_

_(More pets moved to [ROADMAP.md](ROADMAP.md) on 2026-10-14.)_

- **Shared office** — shipped 2026-10-20: `serve --shared` on a lab, `serve --relay` on each PC, owner labels and colours, islands, visitors chatting while they wait, a quiet page, `doctor --relay`. See [shared-office.md](shared-office.md).
- **Long PC names crowd the label** — open: a long `--name` plus the role can overflow the label of a character in a shared office.
