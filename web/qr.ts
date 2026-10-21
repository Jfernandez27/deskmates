const QUIET = 4;

/** The largest whole px per module so the code with its quiet zone fits in `maxSide`, at least 4. */
export function moduleSize(modules: number, maxSide: number): number {
  return Math.max(4, Math.floor(maxSide / (modules + 2 * QUIET)));
}

/** Draws the matrix with `px` CSS pixels per module and a 4-module quiet zone, in black on white. Returns the canvas. */
export function qrCanvas(matrix: boolean[][], px: number): HTMLCanvasElement {
  const n = matrix.length;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = (n + 2 * QUIET) * px;
  canvas.style.imageRendering = "pixelated";
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "QR code with the link to this office");
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff"; // black on white whatever the theme: every scanner reads it
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000000";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (matrix[y][x]) ctx.fillRect((x + QUIET) * px, (y + QUIET) * px, px, px);
  return canvas;
}
