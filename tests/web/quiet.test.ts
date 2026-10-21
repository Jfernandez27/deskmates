import { test, expect } from "vitest";
import { quietMode } from "../../web/quiet.ts";

test("quiet: ?quiet wins, then ?alerts, then the server's shared flag", () => {
  expect(quietMode(new URLSearchParams("quiet&alerts"), { shared: false })).toBe(true);
  expect(quietMode(new URLSearchParams("alerts"), { shared: true })).toBe(false);
  expect(quietMode(new URLSearchParams(""), { shared: true })).toBe(true);
  expect(quietMode(new URLSearchParams(""), {})).toBe(false);
});
