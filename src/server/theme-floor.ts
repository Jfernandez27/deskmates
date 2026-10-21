import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkFloorSpec } from "../core/floor-spec.ts";

export type FloorNumbers = { desksPerRoom: number; islandSize: number };
const TODAY: FloorNumbers = { desksPerRoom: 8, islandSize: 4 };

/**
 * How the bundled theme `themeId` numbers desks: its `layout` block's seat count and island size, checked the way the
 * page checks it. No theme, no layout block, or anything wrong with either gives today's room: 8 desks, islands of 4.
 * Only bundled themes (under `assetsDir`) set the server's numbering: a theme of your own (`--themes`) is read by the
 * page alone, so the server numbers desks 8 to a room, islands of 4, and the page lays them out on its own floor.
 */
export function floorNumbersOf(themeId: string | undefined, assetsDir: string): FloorNumbers {
  if (!themeId || !/^[a-z0-9][a-z0-9-]*$/i.test(themeId)) return { ...TODAY };
  try {
    const theme = JSON.parse(readFileSync(join(assetsDir, "themes", themeId, "theme.json"), "utf8"));
    if (!theme || typeof theme !== "object" || theme.layout === undefined) return { ...TODAY };
    const spec = checkFloorSpec(theme.layout);
    return { desksPerRoom: spec.seats.length, islandSize: spec.islandSize ?? 4 };
  } catch {
    return { ...TODAY };
  }
}
