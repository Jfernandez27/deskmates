# deskmates for VS Code

Shows the deskmates office in a panel next to your terminals. The extension only opens a view: the service that watches your agents is `deskmates serve` (see the main README).

1. Run `deskmates serve`.
2. In VS Code: **deskmates: Open office** from the command palette.

Setting: `deskmates.port` (default 47821).

## Click a character to jump to its terminal

Click an agent in the office and VS Code shows the integrated terminal it runs in. The hook sends its parent pid; the service walks that process's ancestors once per session and passes the list to the page (only to pages opened on this machine, never to `--lan` clients). The page forwards the click to the extension, which shows the first terminal whose shell pid is in that list. If none matches you get "Terminal not found for <agent> (it may run outside VS Code)".

Limits:

- Claude Code agents always. Codex, Copilot, Cursor and Gemini send no process, so the service looks for that tool's process running in the session's folder every 5 s; two sessions of the same tool in the same folder cannot be told apart and get no terminal.
- Only inside this panel: in a browser tab a click just shows the card.
- Linux reads `/proc`; macOS uses `ps`. Windows is not supported.
- The extension and the agents must see the same processes: it does not work across a remote/SSH/container window and a service running elsewhere, or for agents in an external terminal, tmux or screen.
- Sessions that started before you updated deskmates get pids on their next hook event.

Build and install locally:

```bash
cd vscode
npm install --no-save typescript @types/vscode@1.105.0 @types/node @vscode/vsce
npx tsc -p .
npx vsce package --allow-missing-repository
code --install-extension deskmates-vscode-0.1.0.vsix
```
