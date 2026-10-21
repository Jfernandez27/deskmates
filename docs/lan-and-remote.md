# Other devices and other machines

## See the office on your phone or another computer

```bash
deskmates serve --lan
```

It prints a link like `http://192.168.1.20:47821/?token=…` and a QR of it. Scan the QR with the other device's camera, or open the link once: a cookie (HttpOnly, 30 days) keeps you in, so later visits need only `http://192.168.1.20:47821`.

The **Share** button in the bar of the page (a QR glyph, before the bell) shows the same QR and link in a dialog. When the office is not in LAN mode it says how to turn it on.

- The link uses the first non-virtual IPv4 in a private range, wifi or wired first; the other addresses are listed as text (`also:`).
- The QR is not printed when the output is not a terminal, and the link is always printed as text too.
- The office is plain HTTP, so on the other device system notifications are unavailable (browsers allow them only on secure pages). Sounds and the **?** still work after one tap on the page. deskmates does not keep the screen awake, so raise the device's display timeout for a kiosk (see [usage.md](usage.md#on-a-tablet)). A `--https` flag, a self-signed certificate that would allow notifications and a screen wake lock, is a later project.
- Without `--lan` the office listens only on `127.0.0.1`.
- Anyone with the link sees your agents, folders and file names. Use it only on networks you trust.
- The token lives in `~/.config/deskmates/token` (owner-only). Delete the file and restart to rotate it; every device must open the new link.
- Hooks from Claude Code are accepted only from the machine itself, even in LAN mode.

## Agents on other machines

With `--lan`, any machine on your network can put agents in the office through the [ingest API](ingest-api.md) with the same token.

`scripts/remote-agent.sh` is a ready-made sender for shell scripts. It never fails and gives up after one second, so it is safe inside CI and deploy scripts:

```bash
export DESKMATES_URL=http://192.168.1.20:47821
export DESKMATES_TOKEN=…                         # or put it in ~/.config/deskmates/token
remote-agent.sh start deploy "deploy-$$" releaser /srv/atlas
remote-agent.sh tool  deploy "deploy-$$" releaser /srv/atlas Bash "docker compose pull"
remote-agent.sh end   deploy "deploy-$$"
```

## GitHub Actions self-hosted runner

Each job appears as a `ci` character while it runs.

1. Copy `scripts/remote-agent.sh`, `scripts/github-runner/job-started.sh` and `job-completed.sh` into one folder on the runner machine, e.g. `~/deskmates-runner/`, and make them executable.
2. Put the office token in `~/.config/deskmates/token` of the runner's user (`chmod 600`).
3. Add to the runner's `.env` (in the runner folder):
   ```
   ACTIONS_RUNNER_HOOK_JOB_STARTED=/home/<user>/deskmates-runner/job-started.sh
   ACTIONS_RUNNER_HOOK_JOB_COMPLETED=/home/<user>/deskmates-runner/job-completed.sh
   DESKMATES_URL=http://<office-machine>:47821
   ```
4. Restart the runner service while it has no job running.

The character is named after the job (`ci · tests`) and shows the workflow name. The hooks always exit 0: if the office is off, jobs run exactly as before. To remove it, delete those lines and restart the runner.
