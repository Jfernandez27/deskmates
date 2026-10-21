/**
 * Message the office page (in an iframe) sends when a character is clicked.
 * Pure on purpose: no vscode import, so it runs in tests and is also inlined into the webview script.
 */
export type FocusMessage = { type: "deskmates.focus"; pids: number[]; label: string };

/** Returns a clean copy of a valid focus message, or undefined. Must stay self-contained (it is serialized with toString). */
export function parseFocusMessage(data: unknown): FocusMessage | undefined {
  if (!data || typeof data !== "object") return undefined;
  const d = data as { type?: unknown; pids?: unknown; label?: unknown };
  if (d.type !== "deskmates.focus") return undefined;
  if (!Array.isArray(d.pids) || d.pids.length > 32) return undefined;
  const pids: number[] = [];
  for (const p of d.pids) {
    if (typeof p !== "number" || !Number.isInteger(p) || p <= 1 || p > 0x7fffffff) return undefined;
    pids.push(p);
  }
  if (typeof d.label !== "string" || d.label.length > 200) return undefined;
  return { type: "deskmates.focus", pids, label: d.label };
}
