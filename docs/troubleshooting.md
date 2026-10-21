# Troubleshooting

Start with:

```bash
deskmates doctor
```

It checks curl, the hook script, the service, the session files of each tool, and each Claude Code profile, and exits non-zero if something is wrong.

| Symptom | Cause and fix |
|---|---|
| Page says **offline** | The service is not running, or runs on another port. Start `deskmates serve`; the page reconnects by itself. |
| A Claude session does not appear | The profile is not connected (`deskmates connect --profile <dir>`), or the session started before connecting and has not sent an event yet. `doctor` shows the last event the service decoded. |
| `doctor` says hooks point to an old path | The repository or package moved. Run `deskmates connect` again for that profile. |
| Claude uses another port | The hook posts to 47821 unless `DESKMATES_PORT` is set in the agent's environment. |
| Codex, Copilot, Cursor or Gemini sessions missing | They are read from session files; sessions that were quiet when the service started are skipped on purpose. `doctor` lists how many files it found per tool. |
| A character never leaves | Tools without an explicit end leave after 30 quiet minutes. Claude sessions leave on `SessionEnd`. |
| No sound | Browsers allow sound only after one click on the page. Check the bell is not muted (🔕). |
| No system notification | They show only while the tab is hidden, after you allowed notifications (click the bell once). |
| Phone shows **401** | Open the full link with `?token=` printed by `deskmates serve --lan` once; then the cookie is used. |
| Phone cannot connect at all | The service was started without `--lan`, or a firewall blocks port 47821. |
| `POST /v1/events` returns 400 | The response names the field that failed; see [ingest-api.md](ingest-api.md). |
| Blurry sprites | The office scales by whole numbers to fit the window, arranging rooms in a grid; enlarge the window or zoom the browser to 100 %. |
| "The office needs a window at least 600 px wide" | Below 600 × 400 px (phones) the office is not drawn; use a tablet, laptop or desktop, or enlarge the window. |
| No pets | The pet selector in the header is on **No pets**, or the URL has `?pets=off`. |
| Only two pets | By default two pets live in the office per open room; choose **All pets** (`?pets=all`) to bring in all six at once. |
| An agent never walks to the meeting table | Meetings need two free agents of the same folder in the same room; a subagent is not a colleague. Alone, agents go to the vending machines. |
| History panel empty after a restart | Each day is saved in `~/.local/state/deskmates/history/` every few seconds and on exit; a crash can lose the last seconds. |
| VS Code click does nothing | Works only inside the VS Code panel (**deskmates: Open office**), not in a browser tab, and only for agents running in a VS Code terminal. Claude Code: after its next event. Codex, Copilot, Cursor, Gemini: within 5 s, and only when one session of that tool runs in that folder. See `vscode/README.md`. |
| A role does not wear its own character | The file must be `~/.config/deskmates/characters/<name>.png`, a 112x96 PNG, and the name lowercase letters, digits and dashes. The browser console says which one failed; `curl -I http://127.0.0.1:47821/v1/characters/<name>.png` answers 404 (missing) or 422 (wrong size). Restart `deskmates serve` after editing `roles.toml`. |
| Characters repeat in one room | Characters are dealt by the desk each agent first sat at, starting from a point the service picks again whenever the office empties; agents that changed desk keep theirs. With the **All** set there are 14 to deal. |
| Theme looks wrong | Open the browser console: an invalid `theme.json` is rejected with the field name. |

## Resetting

```bash
deskmates disconnect --profile <dir>   # restores the profile's settings minus deskmates hooks
rm ~/.config/deskmates/token           # new token on next start; reopen LAN links
```

Each `connect` leaves `settings.json.bak-deskmates-<timestamp>` next to the profile's settings if you ever need the exact previous file.
