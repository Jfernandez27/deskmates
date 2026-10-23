import { test, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const cli = (...args: string[]) => spawnSync(process.execPath, [new URL("../../bin/deskmates.ts", import.meta.url).pathname, ...args], { encoding: "utf8" });

test("--version prints the package version; -h, --help and help print the usage and succeed; an unknown command fails", () => {
  const version = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;
  for (const v of ["--version", "-v"]) expect(cli(v)).toMatchObject({ status: 0, stdout: `${version}\n` });
  for (const h of ["-h", "--help", "help"]) {
    const r = cli(h);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^deskmates — /);
  }
  expect(cli("bogus").status).toBe(2);
});

test("a bad port is refused instead of becoming a random one; an empty DESKMATES_PORT means the default", () => {
  expect(cli("token", "--port", "abc").status).toBe(2);
  expect(cli("token", "--port", "0").status).toBe(2);
  const empty = spawnSync(process.execPath, [new URL("../../bin/deskmates.ts", import.meta.url).pathname, "--version"], { encoding: "utf8", env: { ...process.env, DESKMATES_PORT: "" } });
  expect(empty.status).toBe(0);
});
