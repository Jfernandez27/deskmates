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
