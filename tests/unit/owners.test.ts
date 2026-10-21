import { test, expect } from "vitest";
import type { Character } from "../../src/types/events.ts";
import { OWNER_COLORS, ownerColor, ownerLabels } from "../../src/core/owners.ts";

test("labels are the name, disambiguated by host, then by number", () => {
  const c = (owner: string, ownerName: string, ownerHost: string) => ({ owner, ownerName, ownerHost }) as Character;
  expect([...ownerLabels([c("a", "Ana", "h1"), c("b", "Beto", "h2")]).values()]).toEqual(["Ana", "Beto"]);
  expect([...ownerLabels([c("a", "Jesús", "id3a-linux"), c("b", "Jesús", "portatil"), c("c", "Ana", "x")]).values()]).toEqual(["Jesús (id3a-linux)", "Jesús (portatil)", "Ana"]);
  expect([...ownerLabels([c("a", "Jesús", "pc"), c("b", "Jesús", "pc")]).values()]).toEqual(["Jesús (pc)", "Jesús (pc) (2)"]);
});

test("a PC without a name is labelled by its host, then by its id; characters without owner are ignored", () => {
  const labels = ownerLabels([{ owner: "a", ownerHost: "box" } as Character, { owner: "b" } as Character, {} as Character]);
  expect([...labels.entries()]).toEqual([["a", "box"], ["b", "b"]]);
});

test("colours follow the order of arrival and wrap", () => {
  const owners = Array.from({ length: 9 }, (_, i) => `o${i}`);
  expect(ownerColor(owners, "o0")).toBe(OWNER_COLORS[0]);
  expect(ownerColor(owners, "o8")).toBe(OWNER_COLORS[0]);
  expect(ownerColor(owners, "nope")).toBeUndefined();
});
