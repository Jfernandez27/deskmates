import { ownSheet, type Assets, type Sheet } from "./assets.ts";
import { shirted } from "./shirt.ts";
import { NameBook, BANK_OF } from "./names.ts";
import { textSprite, ABOVE, BELOW } from "./font.ts";
import { seedOf, type Scene, type Actor, type Bubble } from "./scene.ts";
import { TILE, SITTING, deskAt, isWall, wallMask, bottomOf, type Decor, type Floor } from "./layout.ts";
import { frameFor, petFrame, paperTier } from "./anim.ts";
import type { Theme, Season, Glow } from "./theme.ts";

/** A room of the floor, in source pixels. */
export const roomW = (f: Floor) => f.cols * TILE;
export const roomH = (f: Floor) => f.rows * TILE;
/** desks are drawn this many pixels higher so they cover the legs of whoever sits at them */
const DESK_LIFT = 10;
/** computers sit a bit left of the desk's right edge, closer to whoever uses them */
const PC_SHIFT = 3;

/**
 * Where a computer sits on its desk. Laptops are low, so they go in the middle, resting on the desk, in front of
 * the agent. A tower is tall and would hide the face, so it stays at the side.
 */
export function computerSpot(k: { seat: { c: number }; pc: { c: number }; desk: { r: number } }, kind: "pc" | "laptop" | "mac") {
  return kind === "pc"
    ? { x: k.pc.c * TILE - PC_SHIFT, y: (k.desk.r + 1) * TILE - 18 - DESK_LIFT }
    : { x: k.seat.c * TILE, y: (k.desk.r + 1) * TILE - 15 - DESK_LIFT };
}

/** The role decides (designers get a silver laptop, `computer = "pc"` gives a tower); everyone else works on a laptop. */
export function computerFor(sitter: Actor | undefined, _desk: number, fallback: "pc" | "laptop" | "mac" = "laptop"): "pc" | "laptop" | "mac" {
  return sitter?.ch.outfit?.computer ?? fallback;
}
export type Hit = { actor: Actor; x: number; y: number; w: number; h: number };

/** How the rooms are arranged on the page and the whole-number scale they are drawn at. */
export type Layout = { cols: number; rows: number; scale: number };

/**
 * The grid of rooms that fits the most pixels into a `width` x `height` area: every number of columns is tried and
 * the largest whole-number scale at which the grid fits both ways wins. On a tie the wider grid wins, so rooms stay
 * side by side as long as that costs nothing. Never below 1: when the rooms do not fit even at 1× (many rooms in a
 * small window) they stack in a single column, because a page scrolls down far more naturally than sideways.
 */
export function layoutFor(width: number, height: number, rooms: number, f: Floor): Layout {
  let best: Layout = { cols: rooms, rows: 1, scale: 0 };
  for (let cols = rooms; cols >= 1; cols--) {
    const rows = Math.ceil(rooms / cols);
    if (rows > 1 && (rows - 1) * cols >= rooms) continue; // a row would be empty: same as fewer columns
    const scale = Math.floor(Math.min(width / (cols * roomW(f)), height / (rows * roomH(f))));
    if (scale > best.scale) best = { cols, rows, scale };
  }
  return best.scale ? best : { cols: 1, rows: rooms, scale: 1 };
}

/**
 * The layout for a `cssW` x `cssH` area on a screen with `dpr` device pixels per CSS pixel: the whole-number scale is
 * picked in device pixels, so a 1280x720 window at 1.5 dppx has 1920x1080 pixels to fill. At 1 dppx it is `layoutFor`.
 */
export const deviceLayout = (cssW: number, cssH: number, dpr: number, rooms: number, f: Floor): Layout =>
  layoutFor(cssW * dpr, cssH * dpr, rooms, f);

/** The largest `w` x `h` that fits an `availW` x `availH` area keeping the aspect of a `backingW` x `backingH` canvas. */
export function fitCss(backingW: number, backingH: number, availW: number, availH: number): { w: number; h: number } {
  // the side that limits is the area's side exactly, the other follows the aspect
  return availW / backingW <= availH / backingH
    ? { w: availW, h: backingH * availW / backingW }
    : { w: backingW * availH / backingH, h: availH };
}

/** Top-left corner of a room, in source pixels: rooms fill the grid row by row. */
export const roomOrigin = (room: number, cols: number, f: Floor) => ({ x: (room % cols) * roomW(f), y: Math.floor(room / cols) * roomH(f) });

/** Draws the whole office. Sprites are blitted at integer scales with smoothing off. Returns hit boxes in canvas (backing) pixels. */
/** Everything the current theme needs: tinted floor and wall, the furniture list and the season on top. */
export type ThemeArt = { theme: Theme; floor: CanvasImageSource; wall: CanvasImageSource; decor: Decor[]; season?: Season };

/**
 * prefers-reduced-motion: everything that moves only to look alive holds still (the bouncing ?, screen flicker,
 * typing and reading, animated decor, the z's, the minute hand's creep). Walking still animates: it says where
 * someone is going.
 */
let calm = false;
export function setCalm(v: boolean) { calm = v; }

/** Images by path under /assets/, loaded once. draw() skips anything not loaded yet. */
const IMAGES = new Map<string, HTMLImageElement>();
export function preload(srcs: Iterable<string>): Promise<void[]> {
  return Promise.all([...new Set(srcs)].filter((s) => !IMAGES.has(s)).map((src) => new Promise<void>((ok) => {
    const i = new Image();
    i.onload = () => { IMAGES.set(src, i); ok(); };
    i.onerror = () => { console.warn(`deskmates: missing asset ${src}`); ok(); };
    i.src = `/assets/${src}`;
  })));
}
const img = (src?: string) => (src ? IMAGES.get(src) : undefined);

/** Multiplies a sprite by a colour, keeping its transparency. */
export function tint(img: CanvasImageSource & { width: number; height: number }, hex: string | null): CanvasImageSource {
  if (!hex) return img;
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const g = c.getContext("2d")!;
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = "multiply"; g.fillStyle = hex; g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = "destination-in"; g.drawImage(img, 0, 0);
  return c;
}

const DIAL: [number, number, number][] = [[13, 6, 9], [14, 4, 11], [15, 3, 12], [16, 3, 12], [17, 3, 12], [18, 4, 11], [19, 6, 9]];
/** Repaints the clock face (source pixels) and draws hands for the given time. */
function paintClock(ctx: CanvasRenderingContext2D, x: number, y: number, when: Date) {
  ctx.fillStyle = "#f4f4f2";
  for (const [r, a, b] of DIAL) ctx.fillRect(x + a, y + r, b - a + 1, 1);
  const cx = 7.5, cy = 16;
  const hand = (turns: number, len: number, color: string) => {
    ctx.fillStyle = color;
    const ang = turns * 2 * Math.PI;
    for (let d = 0; d <= len; d += 0.5) ctx.fillRect(x + Math.round(cx + Math.sin(ang) * d - 0.5), y + Math.round(cy - Math.cos(ang) * d), 1, 1);
  };
  const m = when.getMinutes() + (calm ? 0 : when.getSeconds() / 60);
  hand(((when.getHours() % 12) + m / 60) / 12, 2.2, "#2b2530");
  hand(m / 60, 3.4, "#55505a");
  ctx.fillStyle = "#c0392b"; ctx.fillRect(x + 7, y + 16, 1, 1);
}

export function draw(ctx: CanvasRenderingContext2D, assets: Assets, scene: Scene, rooms: number, layout: Layout, t: number, art?: ThemeArt, clock = new Date(), dpr = 1): Hit[] {
  const floorImg = art?.floor ?? assets.floor, wallImg = art?.wall ?? assets.wall;
  const { cols, scale } = layout;
  const f = scene.floor, bottom = bottomOf(f);
  const W = cols * roomW(f), H = layout.rows * roomH(f);
  const at = (room: number) => roomOrigin(room, cols, f);
  if (ctx.canvas.width !== W * scale || ctx.canvas.height !== H * scale) {
    ctx.canvas.width = W * scale; ctx.canvas.height = H * scale;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = art?.theme.page.bg ?? "#16171d";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  type Item = { y: number; order: number; paint: () => void };
  const items: Item[] = [];
  const occupied = new Map<number, Actor>();
  // a desk belongs to whoever is assigned to it, even while still walking there, so its computer does not change on arrival
  for (const a of scene.actors.values()) if (a.ch.desk !== null && !a.leaving) occupied.set(a.ch.desk, a);

  for (let room = 0; room < rooms; room++) {
    const { x: ox, y: oy } = at(room);
    for (let r = 2; r < f.rows; r++) for (let c = 0; c < f.cols; c++)
      if (!isWall(f, c, r) && (r < bottom || f.doorGap.includes(c))) ctx.drawImage(floorImg, ox + c * TILE, oy + r * TILE);
    for (const rug of art?.theme.rugs ?? []) paintRug(ctx, ox + rug.c * TILE, oy + rug.r * TILE, rug.w * TILE, rug.h * TILE, rug.color, rug.border);
    for (let r = 0; r < f.rows; r++) for (let c = 0; c < f.cols; c++) if (isWall(f, c, r)) {
      const m = wallMask(f, c, r);
      ctx.drawImage(wallImg, (m % 4) * 16, Math.floor(m / 4) * 32, 16, 32, ox + c * TILE, oy + (r + 1) * TILE - 32, 16, 32);
    }
    const busy = [...scene.actors.values()].some((a) => a.ch.status === "working" && a.ch.tool === "Bash");
    for (const d of [...(art?.decor ?? []), ...(art?.season?.decor ?? [])]) {
      const frames = d.frames ?? [d.src];
      const im = img(frames[calm ? 0 : Math.floor(t / (busy ? 120 : 600)) % frames.length]) ?? img(d.src);
      if (!im) continue;
      const x = ox + d.c * TILE, y = oy + (d.r + 1) * TILE - im.height;
      const paint = () => {
        ctx.drawImage(im, x, y);
        if (d.role === "clock") paintClock(ctx, x, y, clock);
      };
      // a sofa sat on from behind (facing the TV) is drawn after whoever sits on it, so its back hides their legs
      const seat = d.spots?.some((s) => SITTING.has(s.act) && s.face === "up");
      if (d.blocks || seat) items.push({ y: oy + (d.r + 1) * TILE, order: seat ? 1.6 : 1, paint }); else paint();
    }
    for (let i = 0; i < f.desksPerRoom; i++) {
      const g = room * f.desksPerRoom + i;
      const k = deskAt(f, g);
      const seatY = oy + (k.seat.r + 1) * TILE;
      const chair = img(art?.theme.chair) ?? assets.chair;
      items.push({ y: seatY, order: 0, paint: () => ctx.drawImage(chair, ox + k.seat.c * TILE, seatY - chair.height) });
      const deskY = oy + (k.desk.r + 2) * TILE;
      const desk = img(art?.theme.desk) ?? assets.desk;
      items.push({ y: deskY, order: 1, paint: () => ctx.drawImage(desk, ox + k.desk.c * TILE + Math.floor((48 - desk.width) / 2), deskY - desk.height - DESK_LIFT) });
      const sitter = occupied.get(g);
      items.push({ y: deskY, order: 2, paint: () => {
        const kind = computerFor(sitter, g, art?.theme.computer);
        const spot = computerSpot(k, kind);
        ctx.drawImage(assets.computers[kind], ox + spot.x, oy + spot.y);
        const tier = paperTier(sitter?.ch.tokens);
        for (let s = 0; s < tier; s++) {
          ctx.fillStyle = s % 2 ? "#e9e6dc" : "#fbf9f2";
          ctx.fillRect(ox + k.desk.c * TILE + 3, oy + (k.desk.r + 1) * TILE + 6 - DESK_LIFT - s * 2, 9, 3);
        }
      } });
    }
  }

  names.keep(scene.actors.keys());
  const hits: Hit[] = [];
  for (const a of scene.actors.values()) {
    const o = at(a.room);
    const x = o.x + a.x * TILE, foot = o.y + (a.y + 1) * TILE;
    items.push({ y: foot, order: 1.5, paint: () => paintActor(ctx, assets, scene, a, x, foot - 32, scale, t) });
    hits.push({ actor: a, x: x * scale, y: (foot - 32) * scale, w: 16 * scale, h: 32 * scale });
  }

  for (const p of scene.pets) {
    const sheet = assets.pets.get(p.name);
    if (!sheet || p.room >= rooms) continue;
    const f = petFrame(p.path.length > 0, p.dir, t);
    const o = at(p.room);
    const foot = Math.round(o.y + (p.y + 1) * TILE), x = Math.round(o.x + p.x * TILE + 8 - f.w / 2);
    items.push({ y: foot, order: 1.4, paint: () => {
      if (!f.mirror) { ctx.drawImage(sheet, f.sx, f.sy, f.w, 32, x, foot - 32, f.w, 32); return; }
      ctx.save(); ctx.translate(x + f.w, foot - 32); ctx.scale(-1, 1);
      ctx.drawImage(sheet, f.sx, f.sy, f.w, 32, 0, 0, f.w, 32);
      ctx.restore();
    } });
  }

  items.sort((p, q) => p.y - q.y || p.order - q.order);
  for (const it of items) it.paint();

  const glow = (x: number, y: number, r: number, hex: string, a: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",");
    g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  };
  const lamps: Glow[] = [...(art?.theme.glows ?? []), ...(art?.season?.glows ?? [])];
  const night = art?.theme.night;
  if (night) {
    // the lights are off: darken everything, then let screens in use and the vending machines glow
    ctx.fillStyle = `rgba(6,8,20,${night.darkness})`;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.globalCompositeOperation = "lighter";
  for (let room = 0; room < rooms; room++) {
    const { x: ox, y: oy } = at(room);
    for (const l of lamps) glow(ox + l.c * TILE + 8, oy + l.r * TILE + 8, l.radius, l.color, l.alpha * (night ? 1.3 : 1));
  }
  ctx.globalCompositeOperation = "source-over";
  if (night) {
    ctx.globalCompositeOperation = "lighter";
    for (let room = 0; room < rooms; room++) {
      const { x: ox, y: oy } = at(room);
      for (const d of art?.decor ?? []) if (d.role === "machine") glow(ox + d.c * TILE + 8, oy + (d.r + 1) * TILE - 14, 20, night.machineGlow, 0.35);
      // the TV in the break room lights the sofa like a screen in use
      for (const d of art?.decor ?? []) if (d.role === "screen") glow(ox + d.c * TILE + 16, oy + (d.r + 1) * TILE - 12, 30, night.screenGlow, 0.45);
    }
    for (const [g, a] of occupied) {
      if (a.path.length || a.onBreak || a.meeting || (a.ch.status !== "working" && a.ch.status !== "waiting")) continue;
      const k = deskAt(f, g), o = at(k.room);
      const spot = computerSpot(k, computerFor(a, g, art?.theme.computer));
      glow(o.x + spot.x + 8, o.y + spot.y + 10, 26, night.screenGlow, 0.45);
    }
    ctx.globalCompositeOperation = "source-over";
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // labels of agents standing close (at the machines, round the table) would cover each other: the one in front keeps its place
  const placed: Rect[] = [];
  // bubbles go on top, lifted above any label they would hide
  const bubbles = [...scene.actors.values()].sort((p, q) => at(q.room).y + q.y * TILE - (at(p.room).y + p.y * TILE) || p.x - q.x)
    .map((a) => paintOverlay(ctx, assets, scene, a, at(a.room), scale, t, placed, dpr));
  for (const b of bubbles) b();
  return hits;
}

/** The role's own character when it has one and it loaded, else one dealt from the pool by its first desk, from where the deal starts. */
function sheetOf(assets: Assets, a: Actor): Sheet {
  const own = a.ch.outfit?.character ? ownSheet(assets, a.ch.outfit.character, redraw) : undefined;
  return own ?? assets.sheets.get(dealtSheet(assets, a))!;
}
/** The pool sheet dealt to an agent: by its first desk, from where the deal starts. */
const dealtSheet = (assets: Pick<Assets, "pool" | "deal">, a: Actor) => assets.pool[(a.deal + assets.deal) % assets.pool.length];
/** Called when a sheet of your own arrives; main.ts sets it to draw a frame on static pages. */
export let redraw = () => {};
export function onSheetLoaded(f: () => void) { redraw = f; }

/** A rug with a one-pixel border and a simple woven pattern, drawn procedurally (no art needed). */
function paintRug(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, border: string) {
  ctx.fillStyle = border; ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
  ctx.fillStyle = color; ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
  ctx.fillStyle = border;
  for (let i = x + 8; i < x + w - 8; i += 6) { ctx.fillRect(i, y + 6, 2, 1); ctx.fillRect(i, y + h - 7, 2, 1); }
}

/** On the canvas only the role or project name fits; the card shows the full label. */
export function shortLabel(a: Actor, character?: string): string {
  return shortName(a.ch, character);
}

/** The label an agent gets in the office: its own name or role, else the character's name, from the dealt sheet. */
export function labelOf(assets: Assets, a: Actor): string {
  const label = shortLabel(a, characterName(assets, a));
  // in a shared office the PC's name goes first
  return a.ch.ownerLabel ? `${a.ch.ownerLabel} · ${label}` : label;
}

/** The names handed out in this page, kept while each agent is in the office. */
export const names = new NameBook();

/** A name from the bank that suits the dealt character; a role's own character sheet gets none, and keeps the folder. */
export function characterName(assets: Pick<Assets, "pool" | "deal">, a: Actor, book = names): string | undefined {
  if (a.ch.outfit?.character) return undefined;
  const bank = BANK_OF[dealtSheet(assets, a)];
  return bank && book.nameFor(a.key, a.ch.session, bank);
}

/**
 * The chosen name; else the role without its plugin prefix; else the character's name; else the label's last part
 * (the project folder). Non-Claude tools say who they are.
 */
export function shortName(c: { source: string; agent?: string; name?: string; label: string }, character?: string): string {
  let name = c.name ?? (c.agent ? c.agent.slice(c.agent.lastIndexOf(":") + 1) : character ?? c.label.split(" · ").pop() ?? c.label);
  if (c.source !== "claude") name = `${c.source}: ${name}`; // Claude is the default; other tools say who they are
  return name.length > 18 ? name.slice(0, 17) + "…" : name;
}

function paintActor(ctx: CanvasRenderingContext2D, assets: Assets, scene: Scene, a: Actor, x: number, y: number, scale: number, now: number) {
  const pose = scene.pose(a);
  const t = calm && pose !== "walk" ? 0 : now;
  const f = frameFor(pose, a.dir, t);
  const sheet = sheetOf(assets, a);
  // in a shared office the shirt is the PC's colour
  const owner = a.ch.ownerColor;
  const img = owner && sheet.top ? shirted(sheet, owner) : sheet.img;
  // a subagent is drawn at full scale, like everyone, so the office keeps one pixel density; its team colour tells it apart
  const px = scale;
  const dx = Math.round(x * scale);
  const dy = Math.round(y * scale);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (pose === "sleeping") ctx.globalAlpha = 0.85;
  if (f.mirror) { ctx.translate(dx + 16 * px, dy); ctx.scale(-1, 1); ctx.drawImage(img, f.frame * 16, f.row * 32, 16, 32, 0, 0, 16 * px, 32 * px); }
  else ctx.drawImage(img, f.frame * 16, f.row * 32, 16, 32, dx, dy, 16 * px, 32 * px);
  ctx.restore();

  const top = sheet.headTop[f.row][f.frame];
  const o = a.ch.outfit;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (pose === "typing" && !calm && Math.floor(t / 180) % 2) { // light from the screen on the face
    ctx.fillStyle = "rgba(140,200,255,0.16)";
    ctx.fillRect(dx + 3 * px, dy + (top + 5) * px, 10 * px, 6 * px);
  }
  // a sheet of your own has no known shirt colours: a band across the chest says which PC instead
  if (owner && !sheet.top) { ctx.fillStyle = owner; ctx.fillRect(dx + 4 * px, dy + (top + 16) * px, 8 * px, 3 * px); }
  // the chest badge: the role's colour, else a subagent wears its parent's
  const badge = o?.color ?? (a.ch.parent ? teamColor(scene, a) : undefined);
  if (badge) { ctx.fillStyle = badge; ctx.fillRect(dx + 6 * px, dy + (top + 17) * px, 3 * px, 3 * px); }
  // on a coffee break the cup takes the hand
  const acc = pose === "coffee" ? assets.accessories.cup : o?.accessory ? assets.accessories[o.accessory] : undefined;
  if (acc && (!acc.held || f.row === 0)) {
    const ax = f.mirror ? 16 - acc.dx - acc.img.width : acc.dx;
    ctx.drawImage(acc.img, dx + ax * px, dy + (top + acc.dy) * px, acc.img.width * px, acc.img.height * px);
  }
  ctx.restore();
}

type Rect = { x: number; y: number; w: number; h: number };
const overlaps = (p: Rect, q: Rect) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;

/** Team colours, far from the status colours (yellow waiting, green done). */
export const TEAM = ["#5b8fd9", "#e0833c", "#b46bd6", "#3fb8a8", "#d95f9a", "#8a9bd6"];
/**
 * The colour that ties an agent to its subagents: the lead's role colour, else one picked by its key. Only teams have
 * one: an agent alone has none.
 */
export function teamColor(scene: Pick<Scene, "actors">, a: Actor): string | undefined {
  const lead = a.ch.parent ?? ([...scene.actors.values()].some((o) => o.ch.parent === a.key) ? a.key : undefined);
  if (!lead) return undefined;
  return scene.actors.get(lead)?.ch.outfit?.color ?? TEAM[seedOf(lead) % TEAM.length];
}

/**
 * Device pixels per font pixel for labels at a scale: half the art's at most, so labels don't bury the office; whole so
 * it stays crisp; and never under one CSS pixel (`dpr` device pixels, rounded), so a dense screen keeps them readable.
 */
export const labelUnit = (scale: number, dpr = 1) => Math.max(Math.round(dpr) || 1, Math.floor(scale / 2));

/** Paints the label and returns a function that paints the bubble above it. */
function paintOverlay(ctx: CanvasRenderingContext2D, assets: Assets, scene: Scene, a: Actor, o: { x: number; y: number }, scale: number, now: number, placed: Rect[], dpr: number): () => void {
  const pose = scene.pose(a);
  const t = calm && pose !== "walk" ? 0 : now;
  const f = frameFor(pose, a.dir, t);
  const top = sheetOf(assets, a).headTop[f.row][f.frame];
  const cx = Math.round((o.x + a.x * TILE + 8) * scale);
  const headY = Math.round((o.y + (a.y + 1) * TILE - 32 + top) * scale);
  // the label is set in the pixel font at a whole-number size (u device pixels per font pixel)
  const u = labelUnit(scale, dpr);
  const H = (BELOW + 2) * u; // a pixel above the cap line, the descenders, a pixel below
  // whoever waits for you has a yellow label too, so it stands out among the others
  const asking = scene.bubble(a) === "ask";
  const text = textSprite((a.ch.parent ? "↳ " : "") + labelOf(assets, a), asking ? "#16171d" : "#e7e7ea");
  const w = text.width * u + 4 * u;
  // centred over the head, but never past the canvas edge, where it would be cut off
  const left = Math.round(Math.min(Math.max(cx - w / 2, 0), ctx.canvas.width - w));
  let ly = headY - 4;
  for (let i = 0; i < 4 && placed.some((r) => overlaps(r, { x: left, y: ly - H, w, h: H })); i++) ly -= H + 2;
  placed.push({ x: left, y: ly - H, w, h: H });
  ctx.fillStyle = asking ? "#ffd75e" : "rgba(20,20,26,0.78)";
  ctx.fillRect(left, ly - H, w, H);
  // the stripe: the team's colour, shared by an agent and its subagents, else the role's
  const stripe = teamColor(scene, a) ?? a.ch.outfit?.color;
  if (stripe) { ctx.fillStyle = stripe; ctx.fillRect(left, ly - H, 2 * u, H); }
  ctx.drawImage(text, left + 2 * u, ly - H + u - ABOVE * u, text.width * u, text.height * u);

  const bubble = scene.bubble(a);
  return () => {
    let lift = 0;
    const box = (): Rect => ({ x: cx + 4 * scale, y: ly - H - 2 - 14 * scale - lift, w: 13 * scale, h: 14 * scale });
    if (bubble) for (let i = 0; i < 4 && placed.some((r) => overlaps(r, box())); i++) lift += H + 2;
    if (bubble === "ask") { // the "?" follows the agent, even to the vending machines, and wins over any other bubble
      const bounce = Math.round(Math.abs(Math.sin(t / 220)) * 3) * scale;
      paintAsk(ctx, cx + 4 * scale, ly - H - 2 - bounce - lift, scale);
    } else if (bubble) {
      paintBubble(ctx, bubble, cx + 6 * scale, ly - H - 2 - lift, scale);
    } else if (pose === "sleeping") {
      const k = calm ? 1 : Math.floor(t / 500) % 3;
      const z = textSprite("z".repeat(k + 1), "#cfd3ff");
      ctx.drawImage(z, cx + 6 * scale, ly - H - (ABOVE + BELOW) * u, z.width * u, z.height * u);
    }
  };
}

/** 9x8 pixel icons drawn inside speech bubbles (no emoji fonts). */
const ICON_COLORS: Record<string, string> = { o: "#2b2530", s: "#f2b880", w: "#fffbe8", l: "#7d8bb0", r: "#d95763", b: "#5b8fd9", g: "#4fae6a" };
export const ICONS: Record<Exclude<Bubble, "ask">, string[]> = {
  talk: [
    ".........",
    ".........",
    ".........",
    ".oo.oo.oo",
    ".oo.oo.oo",
    ".........",
    ".........",
    ".........",
  ],
  chart: [
    "......gg.",
    "......gg.",
    "...bb.gg.",
    "...bb.gg.",
    "rr.bb.gg.",
    "rr.bb.gg.",
    "ooooooooo",
    ".........",
  ],
  doc: [
    ".ooooo...",
    ".owwwoo..",
    ".ollwwwo.",
    ".owwwwwo.",
    ".olllllo.",
    ".owwwwwo.",
    ".olllllo.",
    ".ooooooo.",
  ],
  done: [
    ".........",
    ".......gg",
    "......gg.",
    ".....gg..",
    "gg..gg...",
    ".gggg....",
    "..gg.....",
    ".........",
  ],
  wave: [
    ".o.o.o...",
    "osososo..",
    "osososo..",
    "osssssoo.",
    "osssssoso",
    "ossssssso",
    ".osssssso",
    "..oooooo.",
  ],
};

/** The "?" glyph, 5x8, drawn pixel by pixel like the other icons. */
const ASK = [
  ".ooo.",
  "oo.oo",
  "...oo",
  "..oo.",
  "..oo.",
  ".....",
  "..oo.",
  "..oo.",
];
/** The permission bubble: yellow, bigger than the others and outlined, so it is the first thing you see. Bottom-left at (x, y). */
function paintAsk(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  const W = 11, H = 12, top = y - (H + 2) * scale;
  const px = (c: number, r: number, w = 1, h = 1) => ctx.fillRect(x + c * scale, top + r * scale, w * scale, h * scale);
  ctx.fillStyle = "#2b2530";
  px(1, 0, W - 2); px(1, H - 1, W - 2); px(0, 1, 1, H - 2); px(W - 1, 1, 1, H - 2);
  px(1, H, 2); px(1, H + 1, 1); // tail
  ctx.fillStyle = "#ffd75e";
  px(1, 1, W - 2, H - 2); px(2, H - 1, 1);
  ctx.fillStyle = "#2b2530";
  for (let r = 0; r < ASK.length; r++) for (let c = 0; c < ASK[r].length; c++) if (ASK[r][c] === "o") px(3 + c, 2 + r);
}

/** A small white speech bubble with a tail, its bottom-left corner at (x, y) in device pixels. */
function paintBubble(ctx: CanvasRenderingContext2D, kind: Exclude<Bubble, "ask">, x: number, y: number, scale: number) {
  const W = 13, H = 11, top = y - (H + 2) * scale;
  const px = (c: number, r: number, w = 1, h = 1) => ctx.fillRect(x + c * scale, top + r * scale, w * scale, h * scale);
  ctx.fillStyle = "#2b2530";
  px(1, 0, W - 2); px(1, H - 1, W - 2); px(0, 1, 1, H - 2); px(W - 1, 1, 1, H - 2);
  px(1, H, 2); px(1, H + 1, 1); // tail
  ctx.fillStyle = "#f4f4f2";
  px(1, 1, W - 2, H - 2); px(2, H - 1, 1);
  const icon = ICONS[kind];
  for (let r = 0; r < icon.length; r++) for (let c = 0; c < icon[r].length; c++) {
    const col = ICON_COLORS[icon[r][c]];
    if (col) { ctx.fillStyle = col; px(2 + c, 2 + r); }
  }
}
