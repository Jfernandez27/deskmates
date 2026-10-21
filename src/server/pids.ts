import { readdir, readFile, readlink } from "node:fs/promises";
import { execFile } from "node:child_process";

export const MAX_DEPTH = 32;

/** Parent pid from the text of /proc/<pid>/stat. The 4th field follows the command name, which may hold spaces and ")". */
export function ppidFromStat(text: string): number | undefined {
  const end = text.lastIndexOf(")");
  if (end < 0) return undefined;
  const fields = text.slice(end + 1).trim().split(/\s+/);
  const n = Number(fields[1]); // fields[0] is the state, fields[1] the ppid
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

export type PpidReader = (pid: number) => Promise<number | undefined>;

export const procReader = (procRoot = "/proc"): PpidReader => async (pid) => {
  try { return ppidFromStat(await readFile(`${procRoot}/${pid}/stat`, "utf8")); } catch { return undefined; }
};

/** macOS and other systems without /proc. */
export const psReader: PpidReader = (pid) => new Promise((ok) => {
  execFile("ps", ["-o", "ppid=", "-p", String(pid)], { timeout: 1000 }, (err, out) => {
    const n = Number(String(out).trim());
    ok(!err && Number.isInteger(n) && n >= 0 ? n : undefined);
  });
});

export const defaultReader = (): PpidReader => (process.platform === "linux" ? procReader() : psReader);

/** `pid` and its ancestors, nearest first, stopping before init (pid 1) or after MAX_DEPTH entries. */
export async function ancestorPids(pid: number, read: PpidReader = defaultReader()): Promise<number[]> {
  const out: number[] = [];
  let cur: number | undefined = pid;
  while (cur !== undefined && cur > 1 && out.length < MAX_DEPTH && !out.includes(cur)) {
    out.push(cur);
    cur = await read(cur);
  }
  return out;
}

/** Parses the x-deskmates-ppid header: a positive integer pid, or undefined. */
export function parsePidHeader(v: string | string[] | undefined): number | undefined {
  if (typeof v !== "string" || !/^\d{1,10}$/.test(v.trim())) return undefined;
  const n = Number(v.trim());
  return n > 1 && n <= 0x7fffffff ? n : undefined;
}

/** Process names of the tools watched through transcripts: matched against the basename of the first arguments. */
export const TOOL_PROCESSES: Record<string, string[]> = { codex: ["codex"], copilot: ["copilot"], cursor: ["cursor-agent"], gemini: ["gemini"] };

export type Proc = { pid: number; ppid: number; args: string[]; cwd?: string };

/** Whether a command line runs one of `names`: `codex …`, `node …/bin/gemini …`, `node --flag …/cursor-agent …`. */
export function runs(args: string[], names: string[]): boolean {
  return args.slice(0, 3).some((a) => names.includes(a.slice(a.lastIndexOf("/") + 1)));
}

/**
 * Whether a session's folder is a process's working directory. Codex and Copilot record the full path; Cursor keeps
 * it as a slug (`/home/j/proj` → `home-j-proj`) and Gemini by its last segment.
 */
export function sameFolder(session: string, procCwd: string): boolean {
  return session === procCwd || session === procCwd.replace(/^\/+/, "").replace(/[/.]/g, "-") || session === procCwd.slice(procCwd.lastIndexOf("/") + 1);
}

/**
 * The process of a `source` session started in `cwd`: the outermost matching process there (a tool may re-exec
 * itself). Two sessions of the same tool in the same folder cannot be told apart, so then there is no answer.
 */
export function findToolPid(source: string, cwd: string, procs: Proc[]): number | undefined {
  const names = TOOL_PROCESSES[source];
  if (!names) return undefined;
  const hits = procs.filter((p) => p.cwd !== undefined && sameFolder(cwd, p.cwd) && runs(p.args, names));
  const pids = new Set(hits.map((p) => p.pid));
  const tops = hits.filter((p) => !pids.has(p.ppid));
  return tops.length === 1 ? tops[0].pid : undefined;
}

export type ProcLister = (names: string[]) => Promise<Proc[]>;

/** Linux: processes from /proc whose command line runs one of `names`, with their working directory. */
export const procLister = (procRoot = "/proc"): ProcLister => async (names) => {
  const out: Proc[] = [];
  let dirs: string[] = [];
  try { dirs = (await readdir(procRoot)).filter((d) => /^\d+$/.test(d)); } catch { return out; }
  for (const d of dirs) {
    try {
      const args = (await readFile(`${procRoot}/${d}/cmdline`, "utf8")).split("\0").filter(Boolean);
      if (!runs(args, names)) continue;
      const ppid = ppidFromStat(await readFile(`${procRoot}/${d}/stat`, "utf8"));
      out.push({ pid: Number(d), ppid: ppid ?? 0, args, cwd: await readlink(`${procRoot}/${d}/cwd`) });
    } catch { /* gone, or not ours */ }
  }
  return out;
};

const run = (cmd: string, args: string[]) => new Promise<string>((ok) => {
  execFile(cmd, args, { timeout: 2000, maxBuffer: 4 << 20 }, (err, out) => ok(err ? "" : String(out)));
});

/** macOS and other systems without /proc: `ps` for the command lines, `lsof` for the working directories. */
export const psLister: ProcLister = async (names) => {
  const procs: Proc[] = [];
  for (const line of (await run("ps", ["-axo", "pid=,ppid=,command="])).split("\n")) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    if (!m) continue;
    const args = m[3].split(/\s+/);
    if (runs(args, names)) procs.push({ pid: Number(m[1]), ppid: Number(m[2]), args });
  }
  if (!procs.length) return procs;
  let pid = 0;
  for (const line of (await run("lsof", ["-a", "-d", "cwd", "-Fn", "-p", procs.map((p) => p.pid).join(",")])).split("\n")) {
    if (line.startsWith("p")) pid = Number(line.slice(1));
    else if (line.startsWith("n")) { const p = procs.find((q) => q.pid === pid); if (p) p.cwd = line.slice(1); }
  }
  return procs;
};

export const defaultLister = (): ProcLister => (process.platform === "linux" ? procLister() : psLister);
