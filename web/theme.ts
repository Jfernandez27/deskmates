import { deskAt, walkable, breakSpots, ROOM, BASE_DECOR, type Decor, type Floor } from "./layout.ts";
import { checkFloorSpec, type FloorSpec } from "../src/core/floor-spec.ts";
import { findPath } from "./path.ts";

export type Rug = { c: number; r: number; w: number; h: number; color: string; border: string };
export type Glow = { c: number; r: number; color: string; radius: number; alpha: number };
/** Office themes: tiles, tints, page colours, furniture and lights from assets/themes/<id>/theme.json. */
export type Theme = {
  id: string;
  label: string;
  floor: string;
  floorTint: string | null;
  wallTint: string | null;
  page: { bg: string; fg: string; muted: string; card: string; line: string };
  night: { darkness: number; screenGlow: string; machineGlow: string } | null;
  /** extra furniture; `frames` animates it (server LEDs) */
  decor?: Decor[];
  /** base furniture to leave out, by src; not allowed with `layout` */
  removeDecor?: string[];
  /** a floor of its own instead of the room; such a theme brings all its furniture in `decor` and gets no seasons */
  layout?: FloorSpec;
  /** desk and chair sprites instead of the Pixel Agents ones; the computer when the role does not choose */
  desk?: string; chair?: string; computer?: "pc" | "laptop" | "mac";
  rugs?: Rug[];
  /** warm lights that are always on (lamps); at night they add to the darkness */
  glows?: Glow[];
};

/** Decor switched on by date, on top of any theme. */
/** `year`: a season of the year, its dates given for the northern hemisphere and moved six months in the southern one. */
export type Season = { id: string; label: string; from: string; to: string; year?: boolean; decor: Decor[]; glows?: Glow[] };

const HEX = /^#[0-9a-fA-F]{6}$/;
const PAGE_KEYS = ["bg", "fg", "muted", "card", "line"] as const;

/** Throws with the field that is wrong, so a broken theme fails loudly instead of rendering garbage. */
export function validateTheme(t: any): Theme {
  const bad = (f: string) => { throw new Error(`theme ${t?.id ?? "?"}: invalid ${f}`); };
  if (!t || typeof t.id !== "string" || !/^[a-z0-9-]{1,30}$/.test(t.id)) bad("id");
  if (typeof t.label !== "string" || !t.label) bad("label");
  if (typeof t.floor !== "string" || !/^[\w./-]+\.png$/.test(t.floor) || t.floor.includes("..")) bad("floor");
  for (const k of ["floorTint", "wallTint"]) if (t[k] !== null && !HEX.test(t[k])) bad(k);
  for (const k of PAGE_KEYS) if (!HEX.test(t.page?.[k])) bad(`page.${k}`);
  const src = (v: unknown) => typeof v === "string" && /^[\w./-]+\.png$/.test(v) && !v.includes("..");
  const int = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
  let layout: FloorSpec | undefined;
  if (t.layout !== undefined) {
    try { layout = checkFloorSpec(t.layout); } catch (e) { throw new Error(`theme ${t.id}: invalid ${(e as Error).message}`); }
    if (t.removeDecor !== undefined) bad("removeDecor (a theme with a layout brings all its furniture)");
  }
  // tile fields are checked against the theme's own floor
  const { cols, rows } = layout ?? ROOM;
  const C = cols - 1, R = rows - 1;
  for (const [i, d] of (t.decor ?? []).entries()) {
    if (!src(d.src) || !int(d.c, 0, C) || !int(d.r, 0, R) || typeof d.blocks !== "boolean") bad(`decor[${i}]`);
    // bottom-left tile c,r with a footprint w×h that stays on the floor
    if ((d.w !== undefined && !int(d.w, 1, cols)) || (d.h !== undefined && !int(d.h, 1, rows)) || d.c + (d.w ?? 1) > cols || d.r - (d.h ?? 1) + 1 < 0) bad(`decor[${i}]`);
    if (d.frames && (!Array.isArray(d.frames) || !d.frames.every(src))) bad(`decor[${i}].frames`);
    // break spots a theme brings: a tile, which way the agent faces there and what it does
    if (d.spots !== undefined && (!Array.isArray(d.spots) || !d.spots.every((s: { c?: unknown; r?: unknown; face?: unknown; act?: unknown }) => int(s?.c, 0, C) && int(s?.r, 0, R)
      && ["up", "down", "left", "right"].includes(s.face as string) && ["drink", "coffee", "sofa", "game"].includes(s.act as string)))) bad(`decor[${i}].spots`);
  }
  if (t.removeDecor && (!Array.isArray(t.removeDecor) || !t.removeDecor.every(src))) bad("removeDecor");
  for (const k of ["desk", "chair"]) if (t[k] !== undefined && !src(t[k])) bad(k);
  if (t.computer !== undefined && !["pc", "laptop", "mac"].includes(t.computer)) bad("computer");
  for (const [i, r] of (t.rugs ?? []).entries()) if (!int(r.c, 0, C) || !int(r.r, 0, R) || !int(r.w, 1, C) || !int(r.h, 1, R - 1) || r.c + r.w > cols || r.r + r.h > rows || !HEX.test(r.color) || !HEX.test(r.border)) bad(`rugs[${i}]`);
  for (const [i, g] of (t.glows ?? []).entries()) if (!int(g.c, 0, C) || !int(g.r, 0, R) || !HEX.test(g.color) || !(g.radius > 0 && g.radius <= 80) || !(g.alpha > 0 && g.alpha <= 1)) bad(`glows[${i}]`);
  if (t.night !== null) {
    const n = t.night;
    if (!n || typeof n.darkness !== "number" || n.darkness < 0 || n.darkness > 0.9) bad("night.darkness");
    if (!HEX.test(n.screenGlow)) bad("night.screenGlow");
    if (!HEX.test(n.machineGlow)) bad("night.machineGlow");
  }
  return (layout ? { ...t, layout } : t) as Theme;
}

/**
 * The floor a theme is drawn on, with all its furniture: its `layout` and its own decor, or else the room with the base
 * furniture minus `removeDecor` plus the theme's decor.
 */
export function floorOf(t: Theme): Floor {
  if (t.layout) {
    const { cols, rows, islandSize = 4, seats, door, doorGap, meeting } = t.layout;
    return { cols, rows, desksPerRoom: seats.length, islandSize, seats, door, doorGap, decor: t.decor ?? [], meeting };
  }
  const removed = new Set(t.removeDecor ?? []);
  return { ...ROOM, decor: [...BASE_DECOR.filter((d) => !removed.has(d.src)), ...(t.decor ?? [])] };
}

/**
 * What keeps a theme's floor `f` (`floorOf(theme)`, whose decor is all the furniture) from working, with a season's decor on
 * top: a seat, break spot or meeting spot that cannot be reached from the door, no drink spot, two spots on one tile. Empty
 * when the room works.
 */
export function layoutProblems(f: Floor, season?: Season): string[] {
  const decor = [...f.decor, ...(season?.decor ?? [])];
  const g = walkable(f, decor);
  const spots = breakSpots(decor);
  const out: string[] = [];
  const targets = [...Array.from({ length: f.desksPerRoom }, (_, i) => deskAt(f, i).seat), ...spots, ...f.meeting];
  for (const to of targets) if (!findPath(g, f.door, to).length) out.push(`tile ${to.c},${to.r} cannot be reached from the door`);
  if (!spots.some((s) => s.act === "drink")) out.push("no drink spot");
  if (new Set(spots.map((s) => `${s.c},${s.r}`)).size !== spots.length) out.push("two break spots on one tile");
  return out;
}

const KEY = "deskmates.theme";
export function savedTheme(): string | null { try { return localStorage.getItem(KEY); } catch { return null; } }
export function saveTheme(id: string) { try { localStorage.setItem(KEY, id); } catch { /* private mode */ } }

export function applyPage(t: Theme) {
  const s = document.documentElement.style;
  for (const k of PAGE_KEYS) s.setProperty(`--${k}`, t.page[k]);
}

/**
 * "MM-DD" ranges, which may wrap the year end; the first match wins, so festivities listed first beat the season of
 * the year. In the southern hemisphere a season of the year is looked up six months on.
 */
export function seasonFor(seasons: Season[], when: Date, south = false): Season | undefined {
  const md = (m: number) => `${String(m + 1).padStart(2, "0")}-${String(when.getDate()).padStart(2, "0")}`;
  return seasons.find((s) => {
    const d = md(s.year && south ? (when.getMonth() + 6) % 12 : when.getMonth());
    return s.from <= s.to ? d >= s.from && d <= s.to : d >= s.from || d <= s.to;
  });
}

const SOUTH_ZONES = /^(Australia|Antarctica)\/|^America\/(Argentina\/.*|Buenos_Aires|Santiago|Punta_Arenas|Sao_Paulo|Montevideo|Asuncion|La_Paz|Lima|Cuiaba|Campo_Grande|Porto_Velho|Rio_Branco|Maceio|Recife|Bahia|Araguaina|Fortaleza|Belem|Noronha)$|^Pacific\/(Auckland|Chatham|Easter|Galapagos|Fiji|Tongatapu|Noumea|Efate|Apia|Tahiti|Rarotonga|Port_Moresby|Guadalcanal|Norfolk|Pago_Pago|Niue)$|^Africa\/(Johannesburg|Maputo|Harare|Lusaka|Windhoek|Gaborone|Maseru|Mbabane|Blantyre|Lubumbashi|Kinshasa|Luanda|Dar_es_Salaam|Kigali|Bujumbura)$|^Indian\/(Antananarivo|Mauritius|Reunion|Mayotte|Comoro|Kerguelen|Chagos|Cocos)$|^Asia\/(Jakarta|Makassar|Jayapura|Dili)$|^Atlantic\/(St_Helena|Stanley|South_Georgia)$|^Chile\//;

/** Whether an IANA time zone lies in the southern hemisphere, so the seasons of the year are flipped. */
export function isSouthern(timeZone: string | undefined): boolean {
  return !!timeZone && SOUTH_ZONES.test(timeZone);
}

/** "auto" follows the clock: day from 08:00 to 18:59, night otherwise. */
export function resolveAuto(id: string, when: Date): string {
  if (id !== "auto") return id;
  const h = when.getHours();
  return h >= 8 && h < 19 ? "day" : "night";
}
