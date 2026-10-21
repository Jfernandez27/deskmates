/** Recolours the shirt of a character sheet: in a shared office each PC's agents wear that PC's colour. */
import type { Sheet } from "./assets.ts";

type RGB = [number, number, number];
const rgb = (hex: string): RGB => { const n = parseInt(hex.replace("#", ""), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const lum = (c: RGB) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
/** towards black by `k` */
const darken = (c: RGB, k: number): RGB => [c[0] * (1 - k), c[1] * (1 - k), c[2] * (1 - k)];
/** towards white by `k` */
const lighten = (c: RGB, k: number): RGB => [c[0] + (255 - c[0]) * k, c[1] + (255 - c[1]) * k, c[2] + (255 - c[2]) * k];

/**
 * Maps each top colour (packed `r<<16|g<<8|b`) onto a ramp of `hex`, from dark to light by brightness, so highlights
 * stay highlights. The twin of `ramp_map` in scripts/draw-characters.py.
 */
export function shirtRamp(tops: string[], hex: string): Map<number, RGB> {
  const base = rgb(hex);
  const d = darken(base, 0.55), l = lighten(base, 0.25);
  const cs = tops.map(rgb);
  const lo = Math.min(...cs.map(lum)), hi = Math.max(...cs.map(lum));
  const out = new Map<number, RGB>();
  for (const c of cs) {
    const t = hi === lo ? 0.5 : (lum(c) - lo) / (hi - lo);
    out.set(c[0] << 16 | c[1] << 8 | c[2], [0, 1, 2].map((i) => Math.round(d[i] + (l[i] - d[i]) * t)) as RGB);
  }
  return out;
}

const cache = new WeakMap<Sheet, Map<string, HTMLCanvasElement>>();
/** A copy of the sheet with its top in `hex`, made once per sheet and colour; transparency is left as it is. */
export function shirted(sheet: Sheet, hex: string): HTMLCanvasElement | Sheet["img"] {
  if (!sheet.top?.length) return sheet.img;
  let byHex = cache.get(sheet);
  if (!byHex) cache.set(sheet, byHex = new Map());
  const have = byHex.get(hex);
  if (have) return have;
  const c = document.createElement("canvas");
  c.width = sheet.img.width; c.height = sheet.img.height;
  const g = c.getContext("2d")!;
  g.drawImage(sheet.img, 0, 0);
  const im = g.getImageData(0, 0, c.width, c.height);
  const px = im.data;
  const ramp = shirtRamp(sheet.top, hex);
  for (let i = 0; i < px.length; i += 4) {
    if (!px[i + 3]) continue;
    const to = ramp.get(px[i] << 16 | px[i + 1] << 8 | px[i + 2]);
    if (to) { px[i] = to[0]; px[i + 1] = to[1]; px[i + 2] = to[2]; }
  }
  g.putImageData(im, 0, 0);
  byHex.set(hex, c);
  return c;
}
