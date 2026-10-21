import { mkdirSync, readFileSync, renameSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { defaultHistoryDir } from "./history-store.ts";

/** $XDG_STATE_HOME/deskmates/shared.json, beside the history directory. */
export function defaultOwnersFile(env: NodeJS.ProcessEnv = process.env): string {
  return join(dirname(defaultHistoryDir(env)), "shared.json");
}

/** Missing, unreadable or malformed files all read as "no owners yet". */
export function loadOwners(file: string): string[] {
  try {
    const o = JSON.parse(readFileSync(file, "utf8"))?.owners;
    return Array.isArray(o) && o.every((x) => typeof x === "string") ? o : [];
  } catch { return []; }
}

/** Atomic: written to a temporary file next to the target, then renamed over it. */
export function saveOwners(file: string, owners: string[]): void {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify({ owners }), { mode: 0o600 });
    renameSync(tmp, file);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
}
