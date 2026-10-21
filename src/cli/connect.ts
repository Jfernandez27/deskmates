import { readFileSync, writeFileSync, existsSync, copyFileSync, renameSync, statSync, chmodSync } from "node:fs";
import { join } from "node:path";

/** Claude Code hook events deskmates listens to. */
export const HOOK_EVENTS = [
  "SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PermissionRequest",
  "Notification", "Stop", "SessionEnd", "SubagentStart", "SubagentStop",
] as const;

const MARK = "_deskmates";
type Entry = Record<string, unknown> & { hooks?: { type: string; command: string }[] };
type Settings = Record<string, unknown> & { hooks?: Record<string, Entry[]> };

const quote = (p: string) => `'${p.replace(/'/g, `'\\''`)}'`;

function read(file: string): { data: Settings; indent: string | number; exists: boolean } {
  if (!existsSync(file)) return { data: {}, indent: 2, exists: false };
  const text = readFileSync(file, "utf8");
  let data: Settings;
  try { data = JSON.parse(text); } catch { throw new Error(`${file}: not valid JSON, refusing to edit settings.json`); }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(`${file}: settings.json is not a JSON object`);
  const m = text.match(/^\{\s*\n([ \t]+)"/);
  return { data, indent: m ? m[1] : 2, exists: true };
}

function write(file: string, data: Settings, indent: string | number) {
  const tmp = `${file}.deskmates-tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, indent) + "\n");
  if (existsSync(file)) chmodSync(tmp, statSync(file).mode);
  renameSync(tmp, file);
}

function strip(data: Settings): Settings {
  if (!data.hooks) return data;
  const hooks: Record<string, Entry[]> = {};
  for (const [ev, list] of Object.entries(data.hooks)) {
    const kept = Array.isArray(list) ? list.filter((h) => !h?.[MARK]) : list;
    if (!Array.isArray(kept) || kept.length > 0) hooks[ev] = kept;
  }
  const out: Settings = { ...data, hooks };
  if (Object.keys(hooks).length === 0) delete out.hooks;
  return out;
}

/** Adds one marked hook entry per event to <profile>/settings.json. Backs the file up first. */
export function connect(profileDir: string, hookPath: string): string | undefined {
  const file = join(profileDir, "settings.json");
  const { data, indent, exists } = read(file);
  const clean = strip(data);
  const hooks: Record<string, Entry[]> = { ...(clean.hooks ?? {}) };
  for (const ev of HOOK_EVENTS)
    hooks[ev] = [...(hooks[ev] ?? []), { [MARK]: true, matcher: ".*", hooks: [{ type: "command", command: quote(hookPath) }] }];
  const next = { ...clean, hooks };
  if (JSON.stringify(next) === JSON.stringify(data)) return undefined;
  let backup: string | undefined;
  if (exists) {
    backup = `${file}.bak-deskmates-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    copyFileSync(file, backup);
  }
  write(file, next, indent);
  return backup;
}

/** Removes only the entries deskmates added. */
export function disconnect(profileDir: string): boolean {
  const file = join(profileDir, "settings.json");
  if (!existsSync(file)) return false;
  const { data, indent } = read(file);
  const next = strip(data);
  if (JSON.stringify(next) === JSON.stringify(data)) return false;
  write(file, next, indent);
  return true;
}

export function status(profileDir: string, hookPath: string) {
  const file = join(profileDir, "settings.json");
  if (!existsSync(file)) return { connected: false, entries: 0, stale: false };
  const { data } = read(file);
  const ours = Object.values(data.hooks ?? {}).flat().filter((h) => h?.[MARK]);
  const stale = ours.some((h) => h.hooks?.[0]?.command !== quote(hookPath));
  return { connected: ours.length > 0, entries: ours.length, stale };
}
