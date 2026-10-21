import { test, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ancestorPids, ppidFromStat, procReader, parsePidHeader, MAX_DEPTH } from "../../src/server/pids.ts";

/** A fake /proc: pid → [comm, ppid]. */
function fakeProc(tree: Record<number, [string, number]>) {
  const root = mkdtempSync(join(tmpdir(), "dm-proc-"));
  for (const [pid, [comm, ppid]] of Object.entries(tree)) {
    mkdirSync(join(root, pid));
    writeFileSync(join(root, pid, "stat"), `${pid} (${comm}) S ${ppid} ${pid} ${pid} 34816 0 0 0\n`);
  }
  return root;
}

test("reads the 4th field even when the command name has spaces and parens", () => {
  expect(ppidFromStat("4242 (my (odd) cmd) S 77 4242 4242 0")).toBe(77);
  expect(ppidFromStat("garbage")).toBeUndefined();
});

test("walks the chain up to init, nearest first", async () => {
  const root = fakeProc({ 900: ["sh", 800], 800: ["claude", 700], 700: ["zsh", 600], 600: ["code", 1], 1: ["systemd", 0] });
  expect(await ancestorPids(900, procReader(root))).toEqual([900, 800, 700, 600]);
});

test("stops at a missing process, a loop, or the depth cap", async () => {
  expect(await ancestorPids(900, procReader(fakeProc({ 900: ["sh", 555] })))).toEqual([900, 555]);
  expect(await ancestorPids(10, procReader(fakeProc({ 10: ["a", 11], 11: ["b", 10] })))).toEqual([10, 11]);
  const deep: Record<number, [string, number]> = {};
  for (let p = 2; p < 100; p++) deep[p] = ["x", p + 1];
  expect(await ancestorPids(2, procReader(fakeProc(deep)))).toHaveLength(MAX_DEPTH);
});

test("on this machine, the chain of our own process includes its parent", async () => {
  if (process.platform !== "linux") return;
  const chain = await ancestorPids(process.pid);
  expect(chain[0]).toBe(process.pid);
  expect(chain[1]).toBe(process.ppid);
});

test("the pid header must be a plain positive integer", () => {
  expect(parsePidHeader("1234")).toBe(1234);
  expect(parsePidHeader(" 1234 ")).toBe(1234);
  for (const bad of [undefined, "", "1", "0", "-5", "12a", "1e3", "99999999999", ["12"]]) expect(parsePidHeader(bad as any)).toBeUndefined();
});

test("recognises a tool's process by the first arguments, not by any mention later on", async () => {
  const { runs } = await import("../../src/server/pids.ts");
  expect(runs(["codex"], ["codex"])).toBe(true);
  expect(runs(["node", "/home/j/.nvm/bin/gemini"], ["gemini"])).toBe(true);
  expect(runs(["/home/j/.local/bin/cursor-agent", "--use-system-ca", "/x/index.js"], ["cursor-agent"])).toBe(true);
  expect(runs(["/usr/share/code/copilot-runtime", "--headless"], ["copilot"])).toBe(false);
  expect(runs(["vim", "notes.md", "about", "gemini"], ["gemini"])).toBe(false);
});

test("finds the outermost process of the tool in the session's folder, and gives up when two sessions share it", async () => {
  const { findToolPid } = await import("../../src/server/pids.ts");
  const procs = [
    { pid: 50, ppid: 40, args: ["node", "/bin/gemini"], cwd: "/w/a" },
    { pid: 51, ppid: 50, args: ["node", "--max-old-space-size=1", "/bin/gemini"], cwd: "/w/a" }, // its re-exec
    { pid: 60, ppid: 41, args: ["node", "/bin/gemini"], cwd: "/w/b" },
    { pid: 70, ppid: 42, args: ["node", "/bin/gemini"], cwd: "/w/c" },
    { pid: 71, ppid: 43, args: ["node", "/bin/gemini"], cwd: "/w/c" },
  ];
  expect(findToolPid("gemini", "/w/a", procs)).toBe(50);
  expect(findToolPid("gemini", "/w/b", procs)).toBe(60);
  expect(findToolPid("gemini", "/w/c", procs)).toBeUndefined();
  expect(findToolPid("codex", "/w/a", procs)).toBeUndefined();
  expect(findToolPid("claude", "/w/a", procs)).toBeUndefined();
});

test("lists matching processes with their folder from /proc", async () => {
  const { procLister } = await import("../../src/server/pids.ts");
  const { symlinkSync } = await import("node:fs");
  const root = fakeProc({ 50: ["MainThread", 40], 60: ["zsh", 1] });
  writeFileSync(join(root, "50", "cmdline"), "node\0/bin/gemini\0");
  writeFileSync(join(root, "60", "cmdline"), "zsh\0");
  symlinkSync("/w/a", join(root, "50", "cwd"));
  mkdirSync(join(root, "self"));
  expect(await procLister(root)(["gemini"])).toEqual([{ pid: 50, ppid: 40, args: ["node", "/bin/gemini"], cwd: "/w/a" }]);
});

test("matches the short folder names Cursor and Gemini record", async () => {
  const { sameFolder } = await import("../../src/server/pids.ts");
  expect(sameFolder("/home/j/proj", "/home/j/proj")).toBe(true);
  expect(sameFolder("home-j-proj", "/home/j/proj")).toBe(true);
  expect(sameFolder("tmp-58adb0e2", "/tmp/58adb0e2")).toBe(true);
  expect(sameFolder("proj", "/home/j/proj")).toBe(true);
  expect(sameFolder("other", "/home/j/proj")).toBe(false);
});
