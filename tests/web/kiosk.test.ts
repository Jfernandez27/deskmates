import { test, expect } from "vitest";
import { Kiosk, PEEK_MS } from "../../web/kiosk.ts";

const mem = (init: string | null = null) => { let v = init; return { get: () => v, set: (x: string) => { v = x; }, value: () => v }; };
const make = (o: Partial<{ urlKiosk: boolean; demo: boolean; saved: string | null }> = {}) => {
  let now = 1_000;
  const storage = mem(o.saved ?? null);
  const k = new Kiosk({ urlKiosk: o.urlKiosk ?? false, demo: o.demo ?? false, storage, now: () => now });
  return { k, storage, tick: (ms: number) => { now += ms; } };
};

test("off by default, the bar visible; the button turns it on, hides the bar and saves", () => {
  const { k, storage } = make();
  expect(k.state.on).toBe(false); expect(k.barVisible()).toBe(true);
  expect(k.toggle()).toBe(true);
  expect(k.state.on).toBe(true); expect(k.barVisible()).toBe(false);
  expect(storage.value()).toBe("1");
  expect(k.toggle()).toBe(false);
  expect(storage.value()).toBe("0");
});

test("a saved choice restores kiosk; ?kiosk wins over a saved off", () => {
  expect(make({ saved: "1" }).k.state.on).toBe(true);
  expect(make({ saved: "0", urlKiosk: true }).k.state.on).toBe(true);
});

test("?demo ignores the saved choice and never writes it", () => {
  const { k, storage } = make({ demo: true, saved: "1" });
  expect(k.state.on).toBe(false);
  k.toggle();
  expect(storage.value()).toBe("1");           // untouched
});

test("a tap peeks the bar for 4 s; another tap extends from the last tap", () => {
  const { k, tick } = make({ saved: "1" });
  k.tap(); expect(k.barVisible()).toBe(true);
  tick(3_000); k.tap();
  tick(3_000); expect(k.barVisible()).toBe(true);     // 6 s after the first tap, 3 s after the second
  tick(PEEK_MS - 3_000); expect(k.barVisible()).toBe(false);
});

test("the button during a peek turns kiosk off and ends the peek", () => {
  const { k } = make({ saved: "1" });
  k.tap(); k.toggle();
  expect(k.state).toEqual({ on: false, peekUntil: 0 });
});

test("losing full screen changes nothing, saved or shown", () => {
  const { k, storage } = make({ saved: "1" });
  k.fullscreenLost();
  expect(k.state.on).toBe(true); expect(storage.value()).toBe("1");
});

test("a tap when off does nothing", () => {
  const { k } = make(); k.tap(); expect(k.state.peekUntil).toBe(0);
});
