// QR Code encoder (ISO/IEC 18004): byte mode, error correction level M, versions 1-10.
// Pure: no Node imports, so the web page can bundle it too.

/** Version 10, level M, byte mode: 216 data codewords minus 4 mode bits and 16 count bits. */
export const MAX_BYTES = 213;

export class TooLongError extends Error {}

// Level M, per version 1..10: EC codewords per block, then [blocks, data codewords per block] groups.
const BLOCKS: { ec: number; groups: [number, number][] }[] = [
  { ec: 10, groups: [[1, 16]] },
  { ec: 16, groups: [[1, 28]] },
  { ec: 26, groups: [[1, 44]] },
  { ec: 18, groups: [[2, 32]] },
  { ec: 24, groups: [[2, 43]] },
  { ec: 16, groups: [[4, 27]] },
  { ec: 18, groups: [[4, 31]] },
  { ec: 22, groups: [[2, 38], [2, 39]] },
  { ec: 22, groups: [[3, 36], [2, 37]] },
  { ec: 26, groups: [[4, 43], [1, 44]] },
];
const ALIGN: number[][] = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

const dataCodewords = (v: number) => BLOCKS[v - 1]!.groups.reduce((a, [n, k]) => a + n * k, 0);

// GF(256), primitive polynomial 0x11d.
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x; LOG[x] = i;
  x <<= 1; if (x & 0x100) x ^= 0x11d;
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]!;
const mul = (a: number, b: number) => (a && b ? EXP[LOG[a]! + LOG[b]!]! : 0);

function rsRemainder(data: number[], ecLen: number): number[] {
  let gen = [1];
  for (let i = 0; i < ecLen; i++) {
    const next = new Array<number>(gen.length + 1).fill(0);
    gen.forEach((c, j) => { next[j] ^= c; next[j + 1]! ^= mul(c, EXP[i]!); });
    gen = next;
  }
  const rem = new Array<number>(ecLen).fill(0);
  for (const b of data) {
    const f = b ^ rem.shift()!;
    rem.push(0);
    for (let i = 0; i < ecLen; i++) rem[i]! ^= mul(gen[i + 1]!, f);
  }
  return rem;
}

function makeCodewords(bytes: Uint8Array, v: number): number[] {
  const bits: number[] = [];
  const put = (val: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  put(0b0100, 4);
  put(bytes.length, v >= 10 ? 16 : 8);
  for (const b of bytes) put(b, 8);
  const capBits = dataCodewords(v) * 8;
  put(0, Math.min(4, capBits - bits.length));
  while (bits.length % 8) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  for (let pad = 0xec; data.length < dataCodewords(v); pad ^= 0xec ^ 0x11) data.push(pad);

  const { ec, groups } = BLOCKS[v - 1]!;
  const blocks: number[][] = [];
  let pos = 0;
  for (const [n, k] of groups) for (let i = 0; i < n; i++) { blocks.push(data.slice(pos, pos + k)); pos += k; }
  const ecs = blocks.map((b) => rsRemainder(b, ec));
  const out: number[] = [];
  const maxLen = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < maxLen; i++) for (const b of blocks) if (i < b.length) out.push(b[i]!);
  for (let i = 0; i < ec; i++) for (const e of ecs) out.push(e[i]!);
  return out;
}

function bch(value: number, poly: number, polyBits: number, valueBits: number): number {
  let r = value << polyBits;
  for (let i = valueBits - 1; i >= 0; i--) if ((r >> (i + polyBits)) & 1) r ^= poly << i;
  return (value << polyBits) | r;
}

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function penalty(m: boolean[][]): number {
  const n = m.length;
  let score = 0;
  const lines = [...m, ...m.map((_, c) => m.map((row) => row[c]!))];
  for (const line of lines) {
    let run = 1;
    for (let i = 1; i <= n; i++) {
      if (i < n && line[i] === line[i - 1]) run++;
      else { if (run >= 5) score += 3 + (run - 5); run = 1; }
    }
    // 1:1:3:1:1 finder-like pattern with four light modules on either side
    for (let i = 0; i + 7 <= n; i++) {
      const p = [true, false, true, true, true, false, true];
      if (!p.every((d, j) => line[i + j] === d)) continue;
      const light = (a: number, b: number) => { for (let j = a; j < b; j++) if (j >= 0 && j < n && line[j]) return false; return true; };
      if (light(i - 4, i) || light(i + 7, i + 11)) score += 40;
    }
  }
  for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) {
    const c = m[y]![x]!;
    if (c === m[y]![x + 1] && c === m[y + 1]![x] && c === m[y + 1]![x + 1]) score += 3;
  }
  const dark = m.reduce((a, row) => a + row.filter(Boolean).length, 0);
  const total = n * n;
  score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return score;
}

/** Byte mode, error correction M, versions 1-10, mask chosen by the four penalty rules. Rows of modules, true = dark. */
export function encode(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  let v = 1;
  // mode + count + data must fit in the data codewords
  const fits = (ver: number) => 4 + (ver >= 10 ? 16 : 8) + bytes.length * 8 <= dataCodewords(ver) * 8;
  while (v <= 10 && !fits(v)) v++;
  if (v > 10) throw new TooLongError(`Text is ${bytes.length} bytes; a QR code of ours holds at most ${MAX_BYTES}`);

  const n = 17 + 4 * v;
  const modules: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const isFn: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const set = (x: number, y: number, dark: boolean) => { modules[y]![x] = dark; isFn[y]![x] = true; };

  for (let i = 0; i < n; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [n - 4, 3], [3, n - 4]] as const) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= n || y >= n) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      set(x, y, d !== 2 && d !== 4);
    }
  }
  const al = ALIGN[v - 1]!;
  for (const cy of al) for (const cx of al) {
    if ((cx === 6 && cy === 6) || (cx === 6 && cy === al[al.length - 1]) || (cx === al[al.length - 1] && cy === 6)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  // Reserve the format areas and the dark module; the real bits are written per mask below.
  writeFormat(isFn, n, 0, true);
  writeFormat(modules, n, 0);
  if (v >= 7) {
    const bits = bch(v, 0x1f25, 12, 6);
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >> i) & 1) === 1;
      const a = n - 11 + (i % 3), b = Math.floor(i / 3);
      set(a, b, dark); set(b, a, dark);
    }
  }

  // Zigzag placement of the interleaved codewords.
  const cw = makeCodewords(bytes, v);
  const total = cw.length * 8;
  let bit = 0;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < n; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j;
      const y = ((right + 1) & 2) === 0 ? n - 1 - vert : vert;
      if (isFn[y]![x]) continue;
      if (bit < total) { modules[y]![x] = ((cw[bit >> 3]! >> (7 - (bit & 7))) & 1) === 1; bit++; }
    }
  }

  let best: boolean[][] = modules, bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const trial = modules.map((row) => row.slice());
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!isFn[y]![x] && MASKS[mask]!(x, y)) trial[y]![x] = !trial[y]![x];
    writeFormat(trial, n, mask);
    const s = penalty(trial);
    if (s < bestScore) { bestScore = s; best = trial; }
  }
  return best;
}

/** Format information for level M (indicator 00) and the mask, written twice, plus the dark module. */
function writeFormat(m: boolean[][], n: number, mask: number, mark = false): void {
  const bits = bch((0b00 << 3) | mask, 0x537, 10, 5) ^ 0x5412;
  const b = (i: number) => mark || ((bits >> i) & 1) === 1;
  const set = (x: number, y: number, d: boolean) => { m[y]![x] = d; };
  for (let i = 0; i <= 5; i++) set(8, i, b(i));
  set(8, 7, b(6)); set(8, 8, b(7)); set(7, 8, b(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, b(i));
  for (let i = 0; i < 8; i++) set(n - 1 - i, 8, b(i));
  for (let i = 8; i < 15; i++) set(8, n - 15 + i, b(i));
  set(8, n - 8, true);
}
