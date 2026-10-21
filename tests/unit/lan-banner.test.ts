import { test, expect } from "vitest";
import { lanBanner, linkFor, WARNING, NO_ADDRESS, HINT_OFF } from "../../src/cli/lan-banner.ts";

const T = "t".repeat(32);
const base = { lan: true, port: 47821, token: T, tty: true };

test("without --lan: one hint line, nothing else", () => {
  expect(lanBanner({ ...base, lan: false, addresses: { primary: "192.168.1.9", alternatives: [] } })).toEqual([HINT_OFF]);
});

test("with --lan on a TTY: primary link, QR, alternatives, warning, in that order", () => {
  const lines = lanBanner({ ...base, addresses: { primary: "192.168.1.9", alternatives: ["10.0.0.5"] } });
  expect(lines[0]).toBe(`on your network: ${linkFor("192.168.1.9", 47821, T)}`);
  const qrLines = lines.filter((l) => /[▀▄█]/.test(l));
  expect(qrLines.length).toBeGreaterThan(10);
  expect(qrLines.every((l) => l.startsWith("\x1b[30;107m") && l.endsWith("\x1b[0m"))).toBe(true);
  // quiet zone of 4 modules: two coloured blank rows come first, so the first glyph row is at index 3
  expect(lines[1]!.replace(/\x1b\[[\d;]*m/g, "").trim()).toBe("");
  expect(lines[2]!.replace(/\x1b\[[\d;]*m/g, "").trim()).toBe("");
  expect(lines.indexOf(qrLines[0]!)).toBe(3);
  expect(lines.slice(-2)).toEqual([`also: ${linkFor("10.0.0.5", 47821, T)}`, WARNING]);
});

test("not a TTY: the same without the QR", () => {
  const lines = lanBanner({ ...base, tty: false, addresses: { primary: "192.168.1.9", alternatives: [] } });
  expect(lines.some((l) => /[▀▄█]/.test(l))).toBe(false);
  expect(lines).toEqual([`on your network: ${linkFor("192.168.1.9", 47821, T)}`, WARNING]);
});

test("no address: says so, still warns, no QR", () => {
  expect(lanBanner({ ...base, addresses: { primary: null, alternatives: [] } })).toEqual([NO_ADDRESS, WARNING]);
});

test("a link too long for a QR falls back to text", () => {
  const lines = lanBanner({ ...base, token: "x".repeat(300), addresses: { primary: "192.168.1.9", alternatives: [] } });
  expect(lines.some((l) => /[▀▄█]/.test(l))).toBe(false);
  expect(lines[1]).toMatch(/too long for a QR/);
});

test("names the shared office it relays to", () => {
  const lines = lanBanner({ lan: false, port: 47821, token: "x".repeat(32), addresses: { primary: null, alternatives: [] }, tty: false, relay: { url: "http://lab:47821", ownerName: "Jesús" } });
  expect(lines).toContain("relaying to http://lab:47821 as Jesús");
  expect(lines[lines.length - 1]).toBe(HINT_OFF);
});
