import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The package root (the folder holding package.json), whether running from source or from dist/cli. */
export function packageRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(dir, "package.json"))) {
    const up = dirname(dir);
    if (up === dir) throw new Error("deskmates: package root not found");
    dir = up;
  }
  return dir;
}

/** Where your deskmates files live (token, roles.toml, themes, characters): $XDG_CONFIG_HOME/deskmates, or ~/.config/deskmates. */
export function configDir(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.XDG_CONFIG_HOME?.startsWith("/") ? env.XDG_CONFIG_HOME : join(homedir(), ".config");
  return join(base, "deskmates");
}
