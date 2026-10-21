import { open, stat } from "node:fs/promises";

/** Reads a growing text file line by line, holding back an incomplete last line. Restarts if the file shrinks. */
export class LineTail {
  offset = 0;
  private rest = "";
  readonly path: string;
  constructor(path: string, fromEnd = 0) { this.path = path; this.offset = fromEnd; }

  /** New complete lines since the last call; `reset` is true when the file was truncated or replaced. */
  async read(): Promise<{ lines: string[]; reset: boolean }> {
    let size: number;
    try { size = (await stat(this.path)).size; } catch { return { lines: [], reset: false }; }
    let reset = false;
    if (size < this.offset) { this.offset = 0; this.rest = ""; reset = true; }
    if (size === this.offset) return { lines: [], reset };
    const fh = await open(this.path, "r");
    try {
      const buf = Buffer.alloc(size - this.offset);
      await fh.read(buf, 0, buf.length, this.offset);
      this.offset = size;
      const lines = (this.rest + buf.toString("utf8")).split("\n");
      this.rest = lines.pop() ?? "";
      return { lines: lines.filter((l) => l.trim()), reset };
    } finally {
      await fh.close();
    }
  }
}
