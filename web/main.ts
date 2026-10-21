import type { StateMessage, ViewCharacter } from "../src/server/server.ts";
import { loadAssets, poolFor, CHARACTER_SETS } from "./assets.ts";
import { Scene, PETS, PET_CHOICES, type PetChoice } from "./scene.ts";
import { draw, deviceLayout, fitCss, labelUnit, labelOf, setCalm, tint, preload, onSheetLoaded, type Hit, type ThemeArt } from "./render.ts";
import { roomsNeeded, type Floor } from "./layout.ts";
import { validateTheme, layoutProblems, floorOf, applyPage, savedTheme, saveTheme, seasonFor, isSouthern, resolveAuto, type Theme, type Season } from "./theme.ts";
import { Alerts, deliver, isMuted, setMuted } from "./notify.ts";
import { fmtElapsed, fmtTokens } from "./anim.ts";
import { HistoryPanel } from "./history.ts";
import { ShareDialog, type LanInfo } from "./share.ts";
import { pixelIcon, ICON_QR, ICON_EXPAND, ICON_SHRINK } from "./icons.ts";
import { Kiosk, KIOSK_KEY } from "./kiosk.ts";
import type { HistoryView } from "../src/core/history.ts";
import { quietMode } from "./quiet.ts";

const params = new URLSearchParams(location.search);
const demo = params.has("demo");
const fixedT = params.has("t") ? Number(params.get("t")) : undefined;
const canvas = document.getElementById("office") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const card = document.getElementById("card")!;
const conn = document.getElementById("conn")!;
const count = document.getElementById("count")!;
const mute = document.getElementById("mute") as HTMLButtonElement;
const themeSelect = document.getElementById("theme") as HTMLSelectElement;
const petSelect = document.getElementById("pets") as HTMLSelectElement;
const charSelect = document.getElementById("chars") as HTMLSelectElement;

const history = new HistoryPanel(document.getElementById("history-btn") as HTMLButtonElement, document.getElementById("history")!, !demo);
const shareBtn = document.getElementById("share-btn") as HTMLButtonElement;
shareBtn.append(pixelIcon(ICON_QR, 2, ""));
const lanOff: LanInfo = { lan: false, port: 0, primary: null, alternatives: [], token: null };
new ShareDialog(shareBtn, document.getElementById("share") as HTMLDialogElement,
  () => (demo ? Promise.resolve(lanOff) : fetch("/v1/lan", { cache: "no-store" }).then((r) => r.json())));
// demo and static pages snap everyone into place; `?demo&walk` lets agents walk and take breaks, driven by __deskmates.advance()
// pets: ?pets= wins, then this browser's choice; two per open room by default
const PETS_KEY = "deskmates.pets";
const savedPets = (() => { try { return localStorage.getItem(PETS_KEY); } catch { return null; } })();
const scene = new Scene((demo && !params.has("walk")) || params.has("static"));
scene.setPets((params.get("pets") ?? savedPets ?? "auto") as PetChoice);
const alerts = new Alerts();
// kiosk: the office alone, no bar, no padding, centred. The button owns it (saved in this browser; ?kiosk wins; ?demo never
// saves); full screen is only something turning it on asks for. A tap on the office brings the bar back for a few seconds.
const kiosk = new Kiosk({ urlKiosk: params.has("kiosk"), demo,
  storage: { get: () => { try { return localStorage.getItem(KIOSK_KEY); } catch { return null; } },
    set: (v) => { try { localStorage.setItem(KIOSK_KEY, v); } catch { /* private mode */ } } },
  now: () => performance.now() });
const kioskBtn = document.getElementById("kiosk-btn") as HTMLButtonElement;
let kioskShown = "";
/** puts the kiosk state on the page; cheap to call every frame, it only touches the DOM when something changed */
function applyKiosk() {
  const on = kiosk.state.on, peek = on && kiosk.barVisible();
  const key = `${on}|${peek}`;
  if (key === kioskShown) return;
  kioskShown = key;
  document.body.classList.toggle("kiosk", on);
  document.body.classList.toggle("peek", peek);
  kioskBtn.setAttribute("aria-pressed", String(on));
  kioskBtn.replaceChildren(pixelIcon(on ? ICON_SHRINK : ICON_EXPAND, 2, ""));
}
kioskBtn.addEventListener("click", () => {
  if (kiosk.toggle()) void document.documentElement.requestFullscreen?.().catch(() => {});
  else if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  applyKiosk();
  if (fixedT !== undefined) frame(performance.now());   // static pages only draw when asked
});
// browsers only allow full screen from a click
addEventListener("dblclick", () => { if (kiosk.state.on && !document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => {}); });
// a key press brings the bar back too, so the keyboard (Tab) can reach the kiosk button and leave it
addEventListener("keydown", () => { if (kiosk.state.on) { kiosk.tap(); applyKiosk(); } });
// losing full screen (Escape, a system gesture, the screen locking) leaves kiosk as it was
addEventListener("fullscreenchange", () => { if (!document.fullscreenElement) kiosk.fullscreenLost(); });
applyKiosk();
/** the page's own padding around the office (`main` in style.css), both sides */
const pad = () => (kiosk.state.on ? 0 : 32);
const header = document.querySelector("header")!;
let rooms = 1;
let chars: ViewCharacter[] = [];
/** hit boxes from the last draw, in canvas (backing) pixels; map them to the screen with `onScreen` */
let hits: Hit[] = [];
/**
 * The canvas box on screen and the CSS pixels per canvas pixel each way (`kx`, `ky`): 1/devicePixelRatio normally,
 * more in kiosk, which stretches the canvas. Every mapping between the screen and the hit boxes goes through this.
 */
function onScreen() {
  const r = canvas.getBoundingClientRect();
  const kx = canvas.width && r.width ? r.width / canvas.width : 1, ky = canvas.height && r.height ? r.height / canvas.height : 1;
  return {
    /** a hit box in CSS pixels relative to the canvas's top-left corner */
    box: (h: { x: number; y: number; w: number; h: number }) => ({ x: h.x * kx, y: h.y * ky, w: h.w * kx, h: h.h * ky }),
    /** a canvas point to viewport (client) coordinates */
    toClient: (x: number, y: number) => ({ x: r.left + x * kx, y: r.top + y * ky }),
    /** viewport (client) coordinates to a canvas point */
    toCanvas: (cx: number, cy: number) => ({ x: (cx - r.left) / kx, y: (cy - r.top) / ky }),
  };
}

// prefers-reduced-motion holds the office still; followed live, in case it changes while the page is open
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
setCalm(reduced.matches);
reduced.addEventListener("change", () => setCalm(reduced.matches));

// the canvas says nothing to a screen reader: a hidden list of who is in and what they do, and a polite live line
// for the moments worth an interruption (someone needs you, someone finished)
const roster = document.getElementById("roster")!;
const announce = document.getElementById("announce")!;
function stateText(c: ViewCharacter): string {
  if (c.status === "waiting") return "waiting for you";
  if (c.status === "idle") return "done";
  if (c.status === "sleeping") return "asleep";
  const doing = [c.tool, c.detail].filter(Boolean).join(" ");
  return doing ? `working, ${doing}` : "working";
}
function renderRoster() {
  const lines = [...scene.actors.values()].filter((a) => !a.leaving).map((a) => `${labelOf(assets, a)}: ${stateText(a.ch)}`);
  if (roster.dataset.text === lines.join("\n")) return;
  roster.dataset.text = lines.join("\n");
  roster.replaceChildren(...lines.map((l) => Object.assign(document.createElement("li"), { textContent: l })));
}

// the bar sums the office up by state; each count is a button that shows the next agent in that state
const SUMMARY: [ViewCharacter["status"], string][] = [["waiting", "waiting"], ["working", "working"], ["idle", "done"], ["sleeping", "asleep"]];
const turn = new Map<string, number>();
/** a shared office is quiet: decided once, right after /v1/config */
let quiet = false;
function renderSummary() {
  const parts = SUMMARY.map(([status, word]) => ({ status, text: `${chars.filter((c) => c.status === status).length} ${word}` }))
    .filter((p) => !p.text.startsWith("0 ") && !(quiet && p.status === "waiting"));
  const key = parts.map((p) => p.text).join(" · ");
  if (count.dataset.text === key) return;
  count.dataset.text = key;
  if (!parts.length) { count.textContent = "0 agents"; return; }
  count.replaceChildren(...parts.flatMap((p, i) => {
    const b = Object.assign(document.createElement("button"), { type: "button", textContent: p.text, className: `sum ${p.status}` });
    b.addEventListener("click", () => jumpTo(p.status));
    return i ? [document.createTextNode(" · "), b] : [b];
  }));
}
/** Shows the card of the next agent in a state, next to it, as a click on it would (focusing its terminal in VS Code). */
function jumpTo(status: string) {
  const there = hits.filter((h) => h.actor.ch.status === status && !h.actor.leaving);
  if (!there.length) return;
  const i = (turn.get(status) ?? -1) + 1;
  turn.set(status, i);
  const h = there[i % there.length];
  const p = onScreen().toClient(h.x + h.w, h.y);
  showCard(h, p.x, p.y);
  const c = h.actor.ch;
  if (window.parent !== window) window.parent.postMessage({ type: "deskmates.focus", pids: c.pids ?? [], label: c.label }, "*");
}

/**
 * Desks are laid out by this page's own floor, so the rooms drawn come from the desks in use, not from the server's
 * `state.rooms`, which counts rooms of the server's floor.
 */
function syncRooms() {
  rooms = roomsNeeded(chars, scene.floor.desksPerRoom);
  scene.setRooms(rooms);
}

function apply(msg: StateMessage) {
  chars = msg.state.characters;
  assets.deal = msg.state.deal ?? 0;
  syncRooms();
  scene.update(chars);
  renderSummary();
  renderRoster();
  if (!quiet && (!demo || params.has("alerts"))) for (const a of alerts.next(chars)) { deliver(a); announce.textContent = `${a.title}.`; }
}

function connect(delay = 500) {
  const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  ws.onopen = () => { conn.textContent = "live"; conn.classList.remove("off"); delay = 500; };
  ws.onmessage = (e) => { try { apply(JSON.parse(e.data)); } catch { /* ignore malformed frame */ } };
  ws.onclose = () => { conn.textContent = "offline"; conn.classList.add("off"); setTimeout(() => connect(Math.min(delay * 2, 10_000)), delay); };
}

function renderMute() { const m = isMuted(); mute.setAttribute("aria-pressed", String(m)); mute.textContent = m ? "🔕" : "🔔"; }
mute.addEventListener("click", () => {
  setMuted(!isMuted()); renderMute();
  if (!isMuted() && typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission();
});
renderMute();

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
function showCard(h: Hit | undefined, px: number, py: number) {
  if (!h) { card.hidden = true; return; }
  const c = h.actor.ch;
  const tok = c.tokens ? `${fmtTokens(c.tokens.input + c.tokens.output)} in/out · ${fmtTokens(c.tokens.cacheRead ?? 0)} cache read` : "—";
  const sw = c.outfit?.color ? `<span class="swatch" style="background:${esc(c.outfit.color)}"></span>` : "";
  card.innerHTML = `<div class="title">${sw}${esc(labelOf(assets, h.actor))}</div>
    <div class="row">session <b>${esc(c.label)}</b></div>
    <div class="row">model <b>${esc(c.model ?? "—")}</b></div>
    <div class="row">status <b>${esc(c.status)}</b></div>
    <div class="row">doing <b>${esc([c.tool, c.detail].filter(Boolean).join(" · ") || "—")}</b></div>
    <div class="row">folder <b>${esc(c.cwd ?? "—")}</b></div>
    <div class="row">time <b>${fmtElapsed(Date.now() - Date.parse(c.startedAt))}</b></div>
    <div class="row">tokens <b>${tok}</b></div>`;
  card.hidden = false;
  card.style.left = `${Math.min(px + 14, innerWidth - card.offsetWidth - 8)}px`;
  card.style.top = `${Math.min(py + 14, innerHeight - card.offsetHeight - 8)}px`;
}
function hitAt(e: PointerEvent | MouseEvent) {
  const { x, y } = onScreen().toCanvas(e.clientX, e.clientY);
  return hits.find((h) => x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h);
}
canvas.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") showCard(hitAt(e), e.clientX, e.clientY); });
canvas.addEventListener("pointerleave", () => { card.hidden = true; });
canvas.addEventListener("click", (e) => {
  kiosk.tap(); applyKiosk();
  const h = hitAt(e);
  showCard(h, e.clientX, e.clientY);
  // inside the VS Code panel: ask the extension to focus the terminal this agent runs in
  const c = h?.actor.ch;
  if (c && window.parent !== window) window.parent.postMessage({ type: "deskmates.focus", pids: c.pids ?? [], label: c.label }, "*");
});

const assets = await loadAssets();

// themes: ?theme= wins, then this browser's choice, then the server default (serve --theme), then the bundled default
// `user`: themes of your own from ~/.config/deskmates/themes/, after the bundled ones
const index = await (await fetch("/assets/themes/index.json")).json() as { default: string; themes: string[]; user?: string[] };
const themes = new Map<string, Theme>();
for (const id of index.themes) {
  try {
    const t = validateTheme(await (await fetch(`/assets/themes/${id}/theme.json`)).json());
    if (t.id !== id) throw new Error(`theme ${id}: its id is "${t.id}", it must be the folder's name`);
    // a room where agents cannot reach their seats would leave them stuck: such a theme is left out
    const problems = layoutProblems(floorOf(t));
    if (problems.length) throw new Error(`theme ${id}: ${problems.join("; ")}`);
    themes.set(id, t);
  } catch (e) { console.warn("deskmates:", e instanceof Error ? e.message : e); }
}
let serverTheme: string | undefined;
let serverShared: boolean | undefined;
try { const cfg = await (await fetch("/v1/config")).json(); serverTheme = cfg.theme; serverShared = cfg.shared === true; } catch { /* older service */ }
quiet = quietMode(params, { shared: serverShared });
if (quiet) { mute.hidden = true; renderSummary(); }
let seasons: Season[] = [];
try { seasons = (await (await fetch("/assets/themes/seasons.json")).json()).seasons ?? []; } catch { seasons = []; }
/** the browser's time zone decides the hemisphere: in Santiago autumn starts in March */
const south = (() => { try { return isSouthern(Intl.DateTimeFormat().resolvedOptions().timeZone); } catch { return false; } })();
// seasonal decor is opt-in: ?season=<id>|auto|off wins, then this browser's choice; off by default.
// Test pages (?demo) stay plain unless the URL asks, whatever the browser chose.
const SEASON_KEY = "deskmates.season";
const savedSeason = (() => { try { return localStorage.getItem(SEASON_KEY); } catch { return null; } })();
const seasonSelect = document.getElementById("season") as HTMLSelectElement;
seasonSelect.add(new Option("No seasons", "off"));
seasonSelect.add(new Option("Seasons", "auto"));
seasonSelect.value = savedSeason === "auto" ? "auto" : "off";
const seasonChoice = () => params.get("season") ?? (params.has("demo") ? "off" : seasonSelect.value);
const seasonNow = (when: Date) => {
  const choice = seasonChoice();
  if (choice === "off") return undefined;
  return choice === "auto" ? seasonFor(seasons, when, south) : seasons.find((s) => s.id === choice);
};

let art: ThemeArt | undefined;
let chosen = "";
let applied = "";
const now = () => (fixedT !== undefined ? new Date(2026, 9, 14, 10, 10) : new Date());
/** Two floors that differ at most in their furniture. */
const sameGround = (a: Floor, b: Floor) => JSON.stringify({ ...a, decor: [] }) === JSON.stringify({ ...b, decor: [] });
async function useTheme(id: string) {
  chosen = id;
  const resolved = resolveAuto(id, now());
  const theme = themes.get(resolved) ?? themes.get(index.default)!;
  // season decor is placed for the room, so a theme with a floor of its own gets none
  const season = theme.layout ? undefined : seasonNow(now());
  const f = floorOf(theme);
  const decor = f.decor;
  await preload([theme.floor, theme.desk, theme.chair, ...decor.flatMap((d) => [d.src, ...(d.frames ?? [])]), ...(season?.decor ?? []).flatMap((d) => [d.src, ...(d.frames ?? [])])].filter((x): x is string => !!x));
  let floor: HTMLImageElement;
  try {
    floor = await new Promise<HTMLImageElement>((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = `/assets/${theme.floor}`; });
  } catch {
    console.warn(`deskmates: theme ${theme.id}: floor ${theme.floor} not found`);
    if (theme.id !== index.default) return useTheme(index.default);
    throw new Error(`deskmates: the default theme's floor ${theme.floor} is missing`);
  }
  art = { theme, floor: tint(floor, theme.floorTint), wall: tint(assets.wall, theme.wallTint), decor, season };
  // the same ground with other furniture only re-routes whoever is walking (setDecor); another ground moves everyone
  const furniture = [...decor, ...(season?.decor ?? [])];
  if (sameGround(scene.floor, f)) scene.setDecor(furniture); else scene.setFloor(f, furniture);
  syncRooms();
  applyPage(theme);
  applied = theme.id;
  themeSelect.value = id;
  if (fixedT !== undefined) frame(performance.now());
}
// characters: ?chars= wins, then this browser's choice; our own set by default
const CHARS_KEY = "deskmates.chars";
const savedChars = (() => { try { return localStorage.getItem(CHARS_KEY); } catch { return null; } })();
const pickChars = (v: string | null) => (v && v in CHARACTER_SETS ? v : "deskmates");
for (const [id, label] of Object.entries(CHARACTER_SETS)) charSelect.add(new Option(label, id));
charSelect.value = pickChars(params.get("chars") ?? savedChars);
assets.pool = poolFor(charSelect.value);
charSelect.addEventListener("change", () => {
  try { localStorage.setItem(CHARS_KEY, charSelect.value); } catch { /* private mode */ }
  assets.pool = poolFor(charSelect.value);
  if (fixedT !== undefined) frame(performance.now());
});
onSheetLoaded(() => { if (fixedT !== undefined) frame(performance.now()); });
const PET_LABELS: Record<string, string> = { auto: "2 pets/room", all: "All pets", off: "No pets", ...Object.fromEntries(PETS.map((p) => [p.id, p.name])) };
for (const c of PET_CHOICES) petSelect.add(new Option(PET_LABELS[c] ?? c, c));
petSelect.value = scene.petChoice;
petSelect.addEventListener("change", () => {
  try { localStorage.setItem(PETS_KEY, petSelect.value); } catch { /* private mode */ }
  scene.setPets(petSelect.value as PetChoice);
  if (fixedT !== undefined) frame(performance.now());
});
seasonSelect.addEventListener("change", () => {
  try { localStorage.setItem(SEASON_KEY, seasonSelect.value); } catch { /* private mode */ }
  void useTheme(chosen);
});
themeSelect.add(new Option("Auto (by hour)", "auto"));
const yours = document.createElement("optgroup");
yours.label = "Yours";
for (const t of themes.values()) (index.user?.includes(t.id) ? yours : themeSelect).append(new Option(t.label, t.id));
if (yours.children.length) themeSelect.append(yours);
themeSelect.addEventListener("change", () => { saveTheme(themeSelect.value); void useTheme(themeSelect.value); });
// "auto" switches between day and night on its own
setInterval(() => { if (chosen === "auto" && resolveAuto("auto", now()) !== applied) void useTheme("auto"); }, 60_000);
await useTheme(params.get("theme") ?? savedTheme() ?? serverTheme ?? index.default);
let prev = performance.now();
/** device pixels per font pixel of the labels in the last draw (read by the tests) */
let lastUnit = 1;
function frame(ms: number) {
  // fixed-time renders (screenshots) only move the scene through __deskmates.advance(), so they are reproducible
  scene.step(fixedT === undefined ? ms - prev : 0);
  prev = ms;
  applyKiosk();
  const t = fixedT ?? ms;
  // fixed-time renders (screenshots) show 10:10 so reference images do not change with the clock
  const clock = now();
  // the whole-number scale is picked in device pixels and the canvas holds that many; CSS shows it at its device size,
  // except kiosk, which stretches it (pixelated, keeping its aspect) to fill the screen
  const dpr = devicePixelRatio || 1;
  const availW = innerWidth - pad(), availH = innerHeight - (kiosk.state.on ? 0 : header.offsetHeight) - pad();
  const layout = deviceLayout(availW, availH, dpr, rooms, scene.floor);
  lastUnit = labelUnit(layout.scale, dpr);
  hits = draw(ctx, assets, scene, rooms, layout, t, art, clock, dpr);
  // outside kiosk the CSS size is exactly the backing size in device pixels (a whole number of them), so nothing resamples
  const css = kiosk.state.on ? fitCss(canvas.width, canvas.height, availW, availH) : { w: canvas.width / dpr, h: canvas.height / dpr };
  canvas.style.width = `${css.w}px`;
  canvas.style.height = `${css.h}px`;
  if (fixedT === undefined) requestAnimationFrame(frame);
}
// live pages redraw every frame; static ones (screenshots) redraw when the window or its pixel density changes.
// A change of devicePixelRatio (zoom, a move to another screen) fires no resize everywhere, so it is watched itself.
if (fixedT !== undefined) addEventListener("resize", () => frame(performance.now()));
(function watchDpr() {
  const q = matchMedia(`(resolution: ${devicePixelRatio || 1}dppx)`);
  q.addEventListener("change", () => { if (fixedT !== undefined) frame(performance.now()); watchDpr(); }, { once: true });
})();

if (demo) {
  (window as any).__deskmates = {
    setState(msg: StateMessage) { apply(msg); frame(performance.now()); },
    setHistory(v: HistoryView) { history.set(v); },
    /** hit boxes in CSS pixels from the canvas's top-left corner, ready for a click `position` */
    labelUnit: () => lastUnit,
    hits: () => { const s = onScreen(); return hits.map((h) => s.box(h)); },
    /** Steps the scene clock by `ms` in 50 ms ticks (walking, breaks, meetings, pets), then draws. */
    advance(ms: number) { for (let left = ms; left > 0; left -= 50) scene.step(Math.min(50, left)); frame(performance.now()); },
  };
  document.body.dataset.ready = "1";
} else {
  connect();
}
requestAnimationFrame(frame);
