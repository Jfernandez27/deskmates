import { test, expect } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync, renameSync, symlinkSync, lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect, disconnect, HOOK_EVENTS, status } from "../../src/cli/connect.ts";

const HOOK = "/opt/deskmates/bin/deskmates-hook.sh";
const existing = {
  env: { ANTHROPIC_BASE_URL: "http://127.0.0.1:8787/w/claude" },
  hooks: {
    PreToolUse: [
      { matcher: "Bash", hooks: [{ type: "command", command: "caveman shrink" }] },
      { _pixtuoid: true, matcher: ".*", hooks: [{ type: "command", command: "PIXTUOID_SOURCE=claude-code 'pixtuoid-hook'" }] },
    ],
    PreCompact: [{ hooks: [{ type: "command", command: "caveman compact" }] }],
  },
  enabledPlugins: { "id3a@claude-skills": true },
};
function profile(content: unknown = existing, indent = 4) {
  const dir = mkdtempSync(join(tmpdir(), "dm-prof-"));
  const text = JSON.stringify(content, null, indent) + "\n";
  writeFileSync(join(dir, "settings.json"), text);
  return { dir, text, file: join(dir, "settings.json") };
}
const ours = (s: any) => Object.values(s.hooks as Record<string, any[]>).flat().filter((h) => h._deskmates);

test("connect adds one marked entry per event and leaves everything else alone", () => {
  const p = profile();
  connect(p.dir, HOOK);
  const after = JSON.parse(readFileSync(p.file, "utf8"));
  expect(ours(after)).toHaveLength(HOOK_EVENTS.length);
  for (const ev of HOOK_EVENTS) expect(after.hooks[ev].at(-1)).toMatchObject({ _deskmates: true, hooks: [{ type: "command", command: `'${HOOK}'` }] });
  const stripped = structuredClone(after);
  for (const ev of Object.keys(stripped.hooks)) {
    stripped.hooks[ev] = stripped.hooks[ev].filter((h: any) => !h._deskmates);
    if (stripped.hooks[ev].length === 0) delete stripped.hooks[ev];
  }
  expect(stripped).toEqual(existing);
  expect(readFileSync(p.file, "utf8")).toMatch(/^\{\n {4}"env"/);
  expect(readdirSync(p.dir).filter((f) => f.startsWith("settings.json.bak-deskmates-"))).toHaveLength(1);
});

test("connect is idempotent and disconnect restores the original text exactly", () => {
  const p = profile();
  connect(p.dir, HOOK);
  connect(p.dir, HOOK);
  expect(ours(JSON.parse(readFileSync(p.file, "utf8")))).toHaveLength(HOOK_EVENTS.length);
  disconnect(p.dir);
  expect(readFileSync(p.file, "utf8")).toBe(p.text);
});

test("works on a profile without settings.json or without hooks", () => {
  const p = profile({ model: "opus" }, 2);
  connect(p.dir, HOOK);
  disconnect(p.dir);
  expect(readFileSync(p.file, "utf8")).toBe(p.text);
  const empty = mkdtempSync(join(tmpdir(), "dm-prof-"));
  connect(empty, HOOK);
  expect(status(empty, HOOK)).toMatchObject({ connected: true, entries: HOOK_EVENTS.length });
  disconnect(empty);
  expect(status(empty, HOOK).connected).toBe(false);
});

test("refuses to touch a settings.json it cannot parse", () => {
  const dir = mkdtempSync(join(tmpdir(), "dm-prof-"));
  writeFileSync(join(dir, "settings.json"), "{ broken");
  expect(() => connect(dir, HOOK)).toThrow(/settings.json/);
  expect(readFileSync(join(dir, "settings.json"), "utf8")).toBe("{ broken");
  expect(existsSync(join(dir, "settings.json"))).toBe(true);
});

test("status reports a stale hook path", () => {
  const p = profile();
  connect(p.dir, HOOK);
  expect(status(p.dir, "/new/path/deskmates-hook.sh")).toMatchObject({ connected: true, stale: true });
});

test("entries that lost their mark (Claude Code rewrote settings.json) are still ours: no duplicates, and disconnect removes them", () => {
  const unmarked = { matcher: ".*", hooks: [{ type: "command", command: "'/old/node/lib/node_modules/deskmates/bin/deskmates-hook.sh'" }] };
  const hooks: Record<string, unknown[]> = { ...existing.hooks };
  for (const ev of HOOK_EVENTS) hooks[ev] = [...(hooks[ev] ?? []), unmarked];
  const p = profile({ ...existing, hooks });
  expect(status(p.dir, HOOK)).toMatchObject({ connected: true, entries: HOOK_EVENTS.length, stale: true });
  connect(p.dir, HOOK);
  const after = JSON.parse(readFileSync(p.file, "utf8"));
  for (const ev of HOOK_EVENTS) expect(after.hooks[ev].filter((h: any) => JSON.stringify(h).includes("deskmates-hook.sh"))).toHaveLength(1);
  expect(disconnect(p.dir)).toBe(true);
  expect(JSON.parse(readFileSync(p.file, "utf8"))).toEqual(existing);
});

test("a settings.json that is a symlink (stow, home-manager) stays a symlink; its target is edited and backed up", () => {
  const p = profile();
  const real = join(mkdtempSync(join(tmpdir(), "dm-dotfiles-")), "settings.json");
  renameSync(p.file, real);
  symlinkSync(real, p.file);
  const backup = connect(p.dir, HOOK);
  expect(lstatSync(p.file).isSymbolicLink()).toBe(true);
  expect(ours(JSON.parse(readFileSync(real, "utf8")))).toHaveLength(HOOK_EVENTS.length);
  expect(backup && readFileSync(backup, "utf8")).toBe(p.text);
  expect(disconnect(p.dir)).toBe(true);
  expect(lstatSync(p.file).isSymbolicLink()).toBe(true);
  expect(readFileSync(real, "utf8")).toBe(p.text);
});
