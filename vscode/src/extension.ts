import * as vscode from "vscode";
import { randomBytes } from "node:crypto";
import { parseFocusMessage, type FocusMessage } from "./focus";

/** Shows the terminal whose shell is one of the agent's ancestor processes. */
async function focusTerminal(m: FocusMessage) {
  for (const t of vscode.window.terminals) {
    const pid = await t.processId;
    if (pid !== undefined && m.pids.includes(pid)) { t.show(false); return; }
  }
  void vscode.window.showInformationMessage(`Terminal not found for ${m.label} (it may run outside VS Code)`);
}

/** Opens the office served by `deskmates serve` in a webview panel. All logic lives in the service. */
export function activate(context: vscode.ExtensionContext) {
  let panel: vscode.WebviewPanel | undefined;

  context.subscriptions.push(vscode.commands.registerCommand("deskmates.open", async () => {
    if (panel) { panel.reveal(); return; }
    const port = vscode.workspace.getConfiguration("deskmates").get<number>("port", 47821);
    const local = vscode.Uri.parse(`http://127.0.0.1:${port}/`);
    // works in remote and Codespaces windows too: VS Code forwards the port
    const url = (await vscode.env.asExternalUri(local)).toString(true);

    let up = false;
    try { up = (await fetch(new URL("/healthz", url), { signal: AbortSignal.timeout(1500) })).ok; } catch { up = false; }

    panel = vscode.window.createWebviewPanel("deskmates", "deskmates", vscode.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: true });
    panel.onDidDispose(() => { panel = undefined; }, null, context.subscriptions);
    panel.webview.onDidReceiveMessage((raw) => { const m = parseFocusMessage(raw); if (m) void focusTerminal(m); }, null, context.subscriptions);
    const origin = new URL(url).origin;
    const nonce = randomBytes(16).toString("base64");
    // relays clicks from the office iframe to the extension: only from that iframe and its origin, only well-formed messages
    const relay = `const vscode = acquireVsCodeApi();
const frame = document.querySelector("iframe");
const ORIGIN = ${JSON.stringify(origin)};
const parse = ${parseFocusMessage.toString()};
window.addEventListener("message", (e) => {
  if (e.origin !== ORIGIN || !frame || e.source !== frame.contentWindow) return;
  const m = parse(e.data);
  if (m) vscode.postMessage(m);
});`;
    panel.webview.html = up
      ? `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${origin}; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>html,body,iframe{margin:0;padding:0;width:100%;height:100%;border:0;background:#16171d}</style></head>
<body><iframe src="${url}" title="deskmates office"></iframe>
<script nonce="${nonce}">${relay}</script></body></html>`
      : `<!doctype html><html><body style="font-family:var(--vscode-font-family);color:var(--vscode-foreground);padding:24px">
<h3>deskmates is not running</h3><p>Start it in a terminal, then run <b>deskmates: Open office</b> again:</p>
<pre>deskmates serve</pre><p>Port: ${port} (setting <code>deskmates.port</code>).</p></body></html>`;
  }));
}

export function deactivate() {}
