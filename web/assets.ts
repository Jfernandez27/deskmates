/** Loads the characters, the Pixel Agents art and the role accessories served by the deskmates service at /assets/. */
import { PETS } from "./scene.ts";

export type Img = HTMLImageElement;
/**
 * A character sheet and the first opaque row inside each of its 16x32 cells, [row][frame]. Bundled sheets also know
 * the exact colours of their top (assets/characters/tops.json), so the shirt can be recoloured.
 */
export type Sheet = { img: Img; headTop: number[][]; top?: string[] };
/** Which characters walk in: our own (default), the Pixel Agents ones, or both. */
export const CHARACTER_SETS = { deskmates: "deskmates", "pixel-agents": "Pixel Agents", all: "All" } as const;
export type CharacterSet = keyof typeof CHARACTER_SETS;
const DESKMATES = Array.from({ length: 8 }, (_, i) => `dm${i}`);
const PIXEL_AGENTS = Array.from({ length: 6 }, (_, i) => `pa${i}`);
export function poolFor(set: string): string[] {
  return set === "pixel-agents" ? PIXEL_AGENTS : set === "all" ? [...DESKMATES, ...PIXEL_AGENTS] : DESKMATES;
}

export type Assets = {
  /** bundled sheets by id (dm0-dm7, pa0-pa5) and your own ones by `user:<name>` once loaded */
  sheets: Map<string, Sheet>;
  /** the sheets characters are dealt from */
  pool: string[];
  /** where dealing starts in the pool; the service turns it whenever the office empties */
  deal: number;
  floor: Img; wall: Img; desk: Img; chair: Img; computers: Record<"pc" | "laptop" | "mac", Img>;
  accessories: Record<string, { img: Img; dx: number; dy: number; held?: boolean }>;
  /** pet sheets by pet id */
  pets: Map<string, Img>;
};

const BASE = "/assets/";
const load = (src: string) => new Promise<Img>((ok, fail) => {
  const i = new Image();
  i.onload = () => ok(i); i.onerror = () => fail(new Error(`asset failed to load: ${src}`));
  i.src = BASE + src;
});

export function headTops(sheet: Img): number[][] {
  const c = document.createElement("canvas");
  c.width = sheet.width; c.height = sheet.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(sheet, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  const out: number[][] = [];
  for (let row = 0; row < 3; row++) {
    out.push([]);
    for (let f = 0; f < 7; f++) {
      let top = 0;
      search: for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++)
        if (data[((row * 32 + y) * c.width + f * 16 + x) * 4 + 3] > 0) { top = y; break search; }
      out[row].push(top);
    }
  }
  return out;
}

export async function loadAssets(): Promise<Assets> {
  const pa = (p: string) => load(`pixel-agents/${p}`);
  // a missing file leaves the sheets without `top` (the chest band fallback) instead of breaking the page
  const tops = (await fetch(BASE + "characters/tops.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}))) as Record<string, string[]>;
  const sheet = (id: string, img: Img): Sheet => ({ img, headTop: headTops(img), top: tops[id] });
  const sheets = new Map<string, Sheet>();
  await Promise.all([
    ...DESKMATES.map(async (id, i) => sheets.set(id, sheet(id, await load(`characters/char_${i}.png`)))),
    ...PIXEL_AGENTS.map(async (id, i) => sheets.set(id, sheet(id, await pa(`characters/char_${i}.png`)))),
  ]);
  const anchors = (await (await fetch(BASE + "accessories/accessories.json")).json()).anchors as Record<string, { dx: number; dy: number; held?: boolean }>;
  const accessories: Assets["accessories"] = {};
  for (const [name, a] of Object.entries(anchors)) accessories[name] = { img: await load(`accessories/${name}.png`), ...a };
  return {
    sheets, pool: DESKMATES, deal: 0,
    floor: await pa("floors/floor_1.png"), wall: await pa("walls/wall_0.png"),
    desk: await pa("furniture/DESK/DESK_FRONT.png"), chair: await pa("furniture/WOODEN_CHAIR/WOODEN_CHAIR_FRONT.png"),
    computers: { pc: await pa("furniture/PC/PC_BACK.png"), laptop: await load("computers/LAPTOP_BACK.png"), mac: await load("computers/MAC_BACK.png") },
    accessories,
    pets: new Map(await Promise.all(PETS.map(async (p) => [p.id, await load(p.sheet)] as const))),
  };
}

/** "loading", or when it last failed: a missing sheet is asked for again a minute later (added since, or the service was down) */
const asked = new Map<string, "loading" | number>();
const RETRY_SHEET_MS = 60_000;
/**
 * Your own character for a role (`character = "<name>"` in roles.toml), fetched from the service the first time it is
 * needed. Until it arrives, or when it is missing or not a 112x96 sheet, the character is dealt from the pool.
 */
export function ownSheet(assets: Assets, name: string, loaded: () => void): Sheet | undefined {
  const id = `user:${name}`;
  const have = assets.sheets.get(id);
  const before = asked.get(name);
  if (have || before === "loading" || (typeof before === "number" && Date.now() - before < RETRY_SHEET_MS)) return have;
  asked.set(name, "loading");
  const i = new Image();
  i.onload = () => {
    if (i.width !== 112 || i.height !== 96) { asked.set(name, Date.now()); console.warn(`deskmates: character ${name} must be 112x96`); return; }
    assets.sheets.set(id, { img: i, headTop: headTops(i) });
    loaded();
  };
  i.onerror = () => { asked.set(name, Date.now()); if (before === undefined) console.warn(`deskmates: character ${name} not found in ~/.config/deskmates/characters/`); };
  i.src = `/v1/characters/${encodeURIComponent(name)}.png`;
  return undefined;
}
