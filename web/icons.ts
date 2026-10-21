/** A 12×12 pixel glyph from rows of `#`/`.`, drawn at `scale` into a canvas. An empty label hides it from assistive tech. */
export function pixelIcon(rows: string[], scale: number, label: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 12 * scale;
  canvas.style.imageRendering = "pixelated";
  canvas.style.display = "block";
  if (label) { canvas.setAttribute("role", "img"); canvas.setAttribute("aria-label", label); }
  else canvas.setAttribute("aria-hidden", "true");
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--fg").trim() || "#e7e7ea";
  rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === "#") ctx.fillRect(x * scale, y * scale, scale, scale); });
  return canvas;
}

export const ICON_QR = [
  "###..#.###..",
  "#.#..#.#.#..",
  "###.#..###..",
  "............",
  "..#.##.#.#..",
  "#.#..#.#.##.",
  "............",
  "###..#.#.#..",
  "#.#.#.#..#..",
  "###.#..##.#.",
  "............",
  "............",
];

export const ICON_EXPAND = [
  "###......###",
  "#..........#",
  "#..........#",
  "............",
  "............",
  "............",
  "............",
  "............",
  "............",
  "#..........#",
  "#..........#",
  "###......###",
];

export const ICON_SHRINK = [
  "............",
  "..###..###..",
  "..#......#..",
  "..#......#..",
  "............",
  "............",
  "............",
  "............",
  "..#......#..",
  "..#......#..",
  "..###..###..",
  "............",
];
