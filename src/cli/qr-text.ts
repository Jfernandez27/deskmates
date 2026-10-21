/** Two module rows per text line with ▀ ▄ █ and space, a quiet zone of `quiet` modules all round (default 2). */
export function qrText(matrix: boolean[][], quiet = 2): string {
  const width = Math.max(0, ...matrix.map((row) => row.length)) + 2 * quiet;
  let height = matrix.length + 2 * quiet;
  if (height % 2 !== 0) height += 1; // the last line gets a light bottom half

  const dark = (r: number, c: number): boolean => {
    const row = matrix[r - quiet];
    return row !== undefined && row[c - quiet] === true;
  };

  const lines: string[] = [];
  for (let r = 0; r < height; r += 2) {
    let line = "";
    for (let c = 0; c < width; c++) {
      const top = dark(r, c);
      const bottom = dark(r + 1, c);
      line += top && bottom ? "█" : top ? "▀" : bottom ? "▄" : " ";
    }
    lines.push(line);
  }
  return lines.join("\n");
}
