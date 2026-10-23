import { open, stat } from "node:fs/promises";

/** At most this much is read per call; a bigger backlog is read over the next calls. */
const MAX_READ = 16 * 1024 * 1024;

/** Reads a growing text file line by line, holding back an incomplete last line. Restarts if the file shrinks or is replaced. */
export class LineTail {
  offset = 0;
  /** an incomplete last line, as bytes: a character split across two reads is decoded only once whole */
  private rest = Buffer.alloc(0);
  private ino?: number;
  readonly path: string;
  constructor(path: string, fromEnd = 0) { this.path = path; this.offset = fromEnd; }

  /**
   * New complete lines since the last call; `reset` is true when the file was truncated or replaced.
   * A file it cannot stat, open or read (gone, root-owned) gives no lines and is tried again next call.
   */
  async read(): Promise<{ lines: string[]; reset: boolean }> {
    let size: number, ino: number;
    try { ({ size, ino } = await stat(this.path)); } catch { return { lines: [], reset: false }; }
    let reset = false;
    // a file written anew under the same name (an atomic save) is another file, even when it is not shorter
    if (size < this.offset || (this.ino !== undefined && ino !== this.ino)) { this.offset = 0; this.rest = Buffer.alloc(0); reset = true; }
    this.ino = ino;
    if (size === this.offset) return { lines: [], reset };
    let fh;
    try { fh = await open(this.path, "r"); } catch { return { lines: [], reset }; }
    try {
      const buf = Buffer.alloc(Math.min(size - this.offset, MAX_READ));
      const { bytesRead } = await fh.read(buf, 0, buf.length, this.offset);
      this.offset += bytesRead;
      const data = Buffer.concat([this.rest, buf.subarray(0, bytesRead)]);
      const lines: string[] = [];
      let start = 0;
      for (let nl = data.indexOf(10); nl >= 0; start = nl + 1, nl = data.indexOf(10, start)) {
        const line = data.toString("utf8", start, nl);
        if (line.trim()) lines.push(line);
      }
      this.rest = data.subarray(start);
      return { lines, reset };
    } catch {
      return { lines: [], reset };
    } finally {
      await fh.close();
    }
  }
}

/** The first line of a file, read in chunks up to `max` bytes; undefined when there is none, it is longer, or the file cannot be read. */
export async function firstLine(path: string, max = 1 << 20): Promise<string | undefined> {
  let fh;
  try { fh = await open(path, "r"); } catch { return undefined; }
  try {
    const chunks: Buffer[] = [];
    let total = 0;
    while (total < max) {
      const buf = Buffer.alloc(Math.min(64 * 1024, max - total));
      const { bytesRead } = await fh.read(buf, 0, buf.length, total);
      if (bytesRead === 0) return undefined;
      const nl = buf.subarray(0, bytesRead).indexOf(10);
      if (nl >= 0) { chunks.push(buf.subarray(0, nl)); return Buffer.concat(chunks).toString("utf8"); }
      chunks.push(buf.subarray(0, bytesRead));
      total += bytesRead;
    }
    return undefined;
  } catch {
    return undefined;
  } finally {
    await fh.close();
  }
}
