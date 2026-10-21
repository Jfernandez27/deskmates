import { readFileSync, existsSync } from "node:fs";
import { parse } from "smol-toml";
import { packageRoot } from "../root.ts";
import { join } from "node:path";

export const ACCESSORIES = ["beret", "headset", "notebook", "magnifier", "folder", "toolbox", "pen", "book", "globe"] as const;
export type Accessory = (typeof ACCESSORIES)[number];
export const COMPUTERS = ["pc", "laptop", "mac"] as const;
export type Computer = (typeof COMPUTERS)[number];
/** A character sprite of your own: `<name>.png` in ~/.config/deskmates/characters/, served at /v1/characters/<name>.png. */
export const CHARACTER_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;
export type Role = { role: string; match: string[]; color?: string; accessory?: Accessory; computer?: Computer; character?: string };
export type Outfit = { role: string; color?: string; accessory?: Accessory; computer?: Computer; character?: string };

const BUNDLED = join(packageRoot(), "roles.toml");

export function parseRoles(text: string): Role[] {
  const doc = parse(text) as { roles?: Record<string, Record<string, unknown>> };
  return Object.entries(doc.roles ?? {}).map(([name, r]) => {
    const match = r.match;
    if (!Array.isArray(match) || match.length === 0 || !match.every((m) => typeof m === "string"))
      throw new Error(`roles.${name}: "match" must be a non-empty list of names`);
    if (r.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(String(r.color)))
      throw new Error(`roles.${name}: "color" must look like #RRGGBB`);
    if (r.accessory !== undefined && !ACCESSORIES.includes(r.accessory as Accessory))
      throw new Error(`roles.${name}: "accessory" must be one of ${ACCESSORIES.join(", ")}`);
    if (r.computer !== undefined && !COMPUTERS.includes(r.computer as Computer))
      throw new Error(`roles.${name}: "computer" must be one of ${COMPUTERS.join(", ")}`);
    if (r.character !== undefined && !CHARACTER_NAME.test(String(r.character)))
      throw new Error(`roles.${name}: "character" must be a file name without .png: lowercase letters, digits and dashes`);
    return { role: name, match: match as string[], color: r.color as string | undefined, accessory: r.accessory as Accessory | undefined, computer: r.computer as Computer | undefined, character: r.character as string | undefined };
  });
}

/** Bundled roles, overridden role-by-role and extended by the user's file when it exists. */
export function loadRoles(userFile?: string): Role[] {
  const merged = new Map(parseRoles(readFileSync(BUNDLED, "utf8")).map((r) => [r.role, r]));
  if (userFile && existsSync(userFile)) for (const r of parseRoles(readFileSync(userFile, "utf8"))) merged.set(r.role, r);
  return [...merged.values()];
}

export function roleFor(roles: Role[], agent: string | undefined): Outfit | undefined {
  if (!agent) return undefined;
  const bare = agent.includes(":") ? agent.slice(agent.lastIndexOf(":") + 1) : agent;
  const r = roles.find((x) => x.match.includes(agent) || x.match.includes(bare));
  if (!r) return undefined;
  const out: Outfit = { role: r.role };
  if (r.color) out.color = r.color;
  if (r.accessory) out.accessory = r.accessory;
  if (r.computer) out.computer = r.computer;
  if (r.character) out.character = r.character;
  return out;
}
