export type Dir = "down" | "up" | "right" | "left";
export type Pose = "walk" | "typing" | "reading" | "idle" | "waiting" | "sleeping" | "break" | "coffee" | "lounge" | "game" | "meeting" | "handover";
export type Frame = { row: number; frame: number; mirror: boolean };

const ROW: Record<Dir, number> = { down: 0, up: 1, right: 2, left: 2 };

/** Which cell of a 7x3 Pixel Agents character sheet to draw. */
export function frameFor(pose: Pose, dir: Dir, t: number): Frame {
  const mirror = dir === "left";
  switch (pose) {
    case "walk": return { row: ROW[dir], frame: [0, 1, 2, 1][Math.floor(t / 150) % 4], mirror };
    case "typing": return { row: 0, frame: 3 + (Math.floor(t / 250) % 2), mirror: false };
    case "reading": return { row: 0, frame: 5 + (Math.floor(t / 600) % 2), mirror: false };
    case "waiting": return { row: 0, frame: 0, mirror: false };
    // on the sofa, from behind: sat still watching, or bobbing over a game
    case "lounge": return { row: dir === "up" ? 1 : 0, frame: 3, mirror: false };
    case "game": return { row: 1, frame: 3 + (Math.floor(t / 300) % 2), mirror: false };
    // standing still, facing whoever they talk to: the middle walk frame is the one with both feet together
    case "break":
    case "coffee":
    case "meeting":
    case "handover": return { row: ROW[dir], frame: 1, mirror };
    case "idle":
    case "sleeping": return { row: 0, frame: 3, mirror: false };
  }
}

/** Which cell of a 96x96 pet sheet to draw: rows 0 and 1 hold 16x32 walk (0-2) and sit (3-5) frames facing down and up; row 2 three 32x32 side-walk frames facing right. */
export type PetFrame = { sx: number; sy: number; w: number; mirror: boolean };
export function petFrame(walking: boolean, dir: Dir, t: number): PetFrame {
  const cycle = [0, 1, 2, 1];
  if (walking && (dir === "left" || dir === "right")) return { sx: cycle[Math.floor(t / 180) % 4] * 32, sy: 64, w: 32, mirror: dir === "left" };
  const sy = dir === "up" ? 32 : 0;
  if (walking) return { sx: cycle[Math.floor(t / 180) % 4] * 16, sy, w: 16, mirror: false };
  return { sx: (3 + cycle[Math.floor(t / 700) % 4]) * 16, sy, w: 16, mirror: false };
}

export function dirBetween(a: { c: number; r: number }, b: { c: number; r: number }): Dir {
  if (b.c > a.c) return "right";
  if (b.c < a.c) return "left";
  return b.r < a.r ? "up" : "down";
}

/** Paper-stack height on the desk by tokens written (input + output + cache writes). */
export function paperTier(t?: { input: number; output: number; cacheWrite?: number }): number {
  if (!t) return 0;
  const n = t.input + t.output + (t.cacheWrite ?? 0);
  return n >= 5_000_000 ? 4 : n >= 1_000_000 ? 3 : n >= 100_000 ? 2 : n > 0 ? 1 : 0;
}

export function fmtTokens(n: number): string {
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n);
}

export function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : m ? `${m}m ${s % 60}s` : `${s}s`;
}

/** Stable small hash for picking a character sheet per session. */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
