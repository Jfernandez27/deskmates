import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { homedir, hostname, userInfo } from "node:os";
import { dirname, join } from "node:path";

export const MACHINE_ID_FILE = join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "deskmates", "machine-id");

const ID_RE = /^[a-z0-9]{8}$/;

/** A stable random id for this PC, created on first use with owner-only permissions. */
export function loadOrCreateMachineId(file = MACHINE_ID_FILE): string {
  if (existsSync(file)) {
    const t = readFileSync(file, "utf8").trim();
    if (ID_RE.test(t)) return t;
  }
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  let id = "";
  while (id.length < 8) id += randomBytes(8).readBigUInt64BE().toString(36);
  id = id.slice(0, 8);
  writeFileSync(file, id + "\n", { mode: 0o600 });
  chmodSync(file, 0o600);
  return id;
}

/** The name shown on this PC's characters: flag, DESKMATES_NAME, then the OS user. */
export function displayName(flag: string | undefined, env: NodeJS.ProcessEnv = process.env): string {
  let raw = flag ?? env.DESKMATES_NAME;
  if (raw === undefined) {
    try { raw = userInfo().username; } catch { raw = ""; }
  }
  // eslint-disable-next-line no-control-regex
  const clean = raw.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim().slice(0, 40).trim();
  return clean || "someone";
}

/** This machine's host name, restricted to what the ingest validator accepts. */
export function hostName(): string {
  const h = hostname().toLowerCase().replace(/[^a-z0-9.-]/g, "-").slice(0, 64);
  return h || "localhost";
}
