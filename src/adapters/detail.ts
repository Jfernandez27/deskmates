/** Short, content-free description of a tool call, shared by every adapter. Never prompts, file contents or outputs. */
export const MAX_DETAIL = 120;

const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : undefined);
export const clip = (s: string) => (s.length > MAX_DETAIL ? s.slice(0, MAX_DETAIL - 1) + "…" : s);
const base = (p: string) => p.replace(/\/+$/, "").split("/").pop() || p;

export function detailOf(tool: string | undefined, input: unknown): string | undefined {
  let i = input;
  if (typeof i === "string") { try { i = JSON.parse(i); } catch { return undefined; } }
  if (!i || typeof i !== "object") return undefined;
  const o = i as Record<string, unknown>;
  const path = str(o.file_path) ?? str(o.notebook_path) ?? str(o.absolute_path) ?? str(o.path) ?? str(o.target_file);
  if (path) return clip(base(path));
  const cmd = Array.isArray(o.cmd) ? o.cmd.join(" ") : Array.isArray(o.command) ? o.command.join(" ") : str(o.command) ?? str(o.cmd);
  if (cmd) return clip(cmd.split("\n")[0]);
  const pat = str(o.pattern) ?? str(o.glob_pattern) ?? str(o.query);
  if (pat) return clip(pat);
  if (str(o.url)) { try { return new URL(String(o.url)).host; } catch { return undefined; } }
  if (tool === "Agent" || tool === "Task") return str(o.description) && clip(String(o.description));
  if (tool === "invoke_agent") return str(o.agent_name);
  return undefined;
}
