# Security

deskmates shows what your agents are doing: session labels, project folders, tool names and file names. Treat its page as private.

- The service listens on `127.0.0.1` unless started with `--lan`.
- In LAN mode every request from another machine needs the token (`?token=` once, then an HttpOnly cookie; or `Authorization: Bearer`).
- Claude Code hooks are accepted only from localhost, in every mode.
- The live feed (`/ws`) opens only for the office's own page: a browser socket from another site's page is refused, even on this machine.
- The ingest API needs the token, validates every field, caps requests at 100 events and 64 KB, and is rate limited to 600 events per minute.
- The token is stored in `~/.config/deskmates/token` with owner-only permissions. Rotate it by deleting the file and restarting.
- `serve --shared` (a shared office on a lab machine) needs a token and accepts events relayed from other PCs only with it, through the same ingest API, limits included.
- `serve --relay <url>` sends this office's events to the URL you give it: the same fields the ingest API takes (tool name, a detail of at most 120 characters, the working folder, the model, session and agent names) plus this PC's name and host name. Never prompts, file contents or tool output.
- A shared office keeps the order of the PCs it has seen in `$XDG_STATE_HOME/deskmates/shared.json` (`~/.local/state/deskmates/` by default), owner-only.
- Nothing leaves your machine unless you pass `--relay` (or set `DESKMATES_RELAY`). No telemetry.

Report vulnerabilities privately to the maintainer through GitHub (Security → Report a vulnerability) rather than in a public issue.
