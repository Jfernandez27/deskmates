import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { configDir } from "../root.ts";

export const TOKEN_FILE = join(configDir(), "token");

/** The ingest API token, created on first use with owner-only permissions. */
export function loadOrCreateToken(file = TOKEN_FILE): string {
  if (existsSync(file)) {
    const t = readFileSync(file, "utf8").trim();
    if (t.length >= 32) return t;
  }
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const t = randomBytes(24).toString("base64url");
  writeFileSync(file, t + "\n", { mode: 0o600 });
  chmodSync(file, 0o600);
  return t;
}

export const RELAY_TOKEN_FILE = join(configDir(), "relay-token");

/** The token of the shared office this machine relays to: flag, then DESKMATES_RELAY_TOKEN, then the relay-token file. */
export function readRelayToken(flag: string | undefined, env: NodeJS.ProcessEnv = process.env, file = RELAY_TOKEN_FILE): string | undefined {
  if (flag) return flag;
  if (env.DESKMATES_RELAY_TOKEN) return env.DESKMATES_RELAY_TOKEN;
  if (existsSync(file)) return readFileSync(file, "utf8").trim() || undefined;
  return undefined;
}
