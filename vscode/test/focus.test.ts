import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseFocusMessage } from "../src/focus.ts";

test("accepts a well-formed focus message and returns a clean copy", () => {
  expect(parseFocusMessage({ type: "deskmates.focus", pids: [900, 800], label: "claude-work · S", extra: 1 }))
    .toEqual({ type: "deskmates.focus", pids: [900, 800], label: "claude-work · S" });
  expect(parseFocusMessage({ type: "deskmates.focus", pids: [], label: "codex" })).toEqual({ type: "deskmates.focus", pids: [], label: "codex" });
});

test("rejects anything else", () => {
  const ok = { type: "deskmates.focus", pids: [900], label: "x" };
  for (const bad of [
    null, undefined, "deskmates.focus", 42, [],
    { ...ok, type: "other" },
    { ...ok, pids: "900" }, { ...ok, pids: [900.5] }, { ...ok, pids: [1] }, { ...ok, pids: [-3] }, { ...ok, pids: ["900"] },
    { ...ok, pids: Array.from({ length: 33 }, (_, i) => i + 2) }, { ...ok, pids: [2 ** 40] },
    { ...ok, label: 7 }, { ...ok, label: "x".repeat(201) }, { pids: [900], label: "x" },
  ]) expect(parseFocusMessage(bad)).toBeUndefined();
});

test("is self-contained, so the webview can inline it with toString", () => {
  const fn = new Function(`return (${parseFocusMessage.toString()})`)() as typeof parseFocusMessage;
  expect(fn({ type: "deskmates.focus", pids: [900], label: "x" })).toEqual({ type: "deskmates.focus", pids: [900], label: "x" });
  expect(readFileSync(new URL("../src/focus.ts", import.meta.url), "utf8")).not.toMatch(/from "vscode"/);
});
