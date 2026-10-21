# Themes

Pick a theme from the selector at the top right of the page, next to the bell. The choice is remembered per browser. You can also:

- add `?theme=<id>` to the URL (for a shared link or a screen in the office);
- start the service with `deskmates serve --theme <id>` to set the default for browsers that have not chosen.

Bundled: `day`, `night`, `cozy`, `cafe`, `servers`, `library`, `headquarters` (one 48 × 28 floor of six islands of four desks, a café in the middle, a lounge and a meeting table; the default of a shared office, see [shared-office.md](shared-office.md)).

**Auto (by hour)** follows the clock: day from 08:00 to 18:59, night shift otherwise. It switches by itself while the page is open.

## Seasons

Seasonal decor appears on top of any theme once you turn it on: pick **Seasons** in the season selector at the top of the page (remembered per browser), or add `?season=auto`. It is off by default. Festivities come first: `halloween` (10-20 to 11-01), `fiestas-patrias` (09-10 to 09-20), `christmas` (12-10 to 01-06). The rest of the year shows the season of the year: `spring` (flowers, butterflies), `summer` (sun, fans, beach ball), `autumn` (leaves, umbrella stand), `winter` (paper snowflakes, coat rack, a glowing heater).

The seasons of the year carry `"year": true` and dates for the northern hemisphere (spring 03-20 to 06-20, summer 06-21 to 09-22, autumn 09-23 to 12-20, winter 12-21 to 03-19). The browser's time zone decides the hemisphere: in a southern zone such as `America/Santiago`, `Australia/Sydney` or `Africa/Johannesburg` they move six months, so October is spring there.

Force one with `?season=<id>`, or turn them off with `?season=off`; the URL wins over the selector. Test pages (`?demo`) show none unless the URL asks, whatever the browser chose. Dates and decor live in `assets/themes/seasons.json`; the first entry whose dates match wins, so festivities are listed before the seasons of the year. A season's `decor` and `glows` follow the same rules as a theme's.

## Your own themes

Put a theme of your own in `~/.config/deskmates/themes/<id>/theme.json` (or start the service with `deskmates serve --themes <dir>`). It shows up in the selector under **Yours** the next time you load the page, no restart needed, and `?theme=<id>` and `serve --theme <id>` work with it too.

Your folder is served where a bundled theme would be, so you write it the same way: its art is `themes/<id>/<file>.png`, and the bundled art is still at its usual path (`pixel-agents/furniture/...`). This is where paid packs you own (Donarg, LimeZu) go: copy their PNGs into your theme's folder; they never leave your machine.

- The folder name is the id: lowercase letters, digits and `-`, up to 30, and the same as `id` in `theme.json`.
- A folder named like a bundled theme (`cozy`) is ignored; the bundled one wins.
- A theme with a wrong field, or whose room leaves a seat or break spot out of reach of the door or has no drink spot, is left out of the selector, with the reason in the browser console (F12). A missing sprite is skipped with a warning; a missing floor falls back to the default theme.

## Writing a theme

A bundled theme is a folder `assets/themes/<id>/` with a `theme.json`, listed in `assets/themes/index.json`. Paths are relative to `assets/`.

```json
{
  "id": "cozy",
  "label": "Cozy",
  "floor": "pixel-agents/floors/floor_4.png",
  "floorTint": "#c9a27a",
  "wallTint": "#e8d9c4",
  "page": { "bg": "#1d1814", "fg": "#f1e7da", "muted": "#a8978a", "card": "#2a221c", "line": "#3d3229" },
  "night": null,
  "desk": "pixel-agents/furniture/DESK/DESK_FRONT.png",
  "chair": "pixel-agents/furniture/WOODEN_CHAIR/WOODEN_CHAIR_FRONT.png",
  "computer": "laptop",
  "removeDecor": ["pixel-agents/furniture/WHITEBOARD/WHITEBOARD.png"],
  "decor": [
    { "src": "pixel-agents/furniture/SOFA/SOFA_FRONT.png", "c": 19, "r": 11, "w": 2, "h": 1, "blocks": true }
  ],
  "rugs": [{ "c": 2, "r": 4, "w": 15, "h": 3, "color": "#8c3b2e", "border": "#5a2219" }],
  "glows": [{ "c": 5, "r": 3, "color": "#ffcf8a", "radius": 28, "alpha": 0.25 }]
}
```

| Field | Meaning |
|---|---|
| `floor` | 16×16 floor tile, repeated |
| `floorTint`, `wallTint` | colour multiplied over the floor and the wall sheet, or `null` |
| `page` | colours of the page around the office (header, cards, history panel) |
| `night` | `null`, or `{ darkness 0–0.9, screenGlow, machineGlow }`: darkens the room and lights screens in use and the vending machines |
| `desk`, `chair` | replace the desk (drawn centred on its 3×2 tiles) and the chair |
| `computer` | computer for agents whose role does not choose one: `laptop`, `mac`, `pc` |
| `removeDecor` | base furniture to leave out, by `src` (not allowed with `layout`) |
| `layout` | optional: a floor of its own instead of the room, see [A floor of its own](#a-floor-of-its-own) |
| `decor` | extra furniture: `src`, bottom-left tile `c`,`r`, footprint `w`×`h` (default 1×1), `blocks` (agents walk around it), optional `frames` (list of sprites cycled for animation, faster while an agent runs commands), `role` (`machine` and `screen` glow at night, `clock` gets real-time hands) and `spots`: break spots the furniture brings, each `{ c, r, face, act }` with `face` `up`/`down`/`left`/`right` and `act` `drink` (stand; neighbours within two tiles chat), `coffee` (stand holding a cup), `sofa` or `game` (sit; these tiles are seats nobody walks across). A sofa whose spots face `up` is drawn in front of whoever sits on it |
| `rugs` | rectangles drawn on the floor, in tiles |
| `glows` | warm lights, always on; brighter at night |

### The room grid

The room is 24 × 14 tiles of 16 px. Row 1 is the top wall, row 13 the bottom wall with the door at columns 8–9. Desks occupy columns 2–16 (seats at row 4 and 9, desks below them); columns 18–22 are the lounge with the meeting table. The base room's break room is the soda (column 1) and espresso (column 2) by the top-left wall, the snack machine at column 17, and a TV on the top wall over a sofa at columns 19–20, row 3. A theme that puts furniture there lists the base pieces in `removeDecor` and brings its own `spots`. Keep free the meeting seats around the table, every seat and break spot, and a path from the door to all of them; every theme needs at least one `drink` spot. `npm test` checks this for every bundled theme; the page checks it for yours. Every `decor` piece and `rug` must fit inside the floor (the room, or the theme's own `cols` × `rows`): a theme of your own whose furniture runs off the edge is left out with a warning in the browser console; move the piece in.

### A floor of its own

A theme can replace the 24 × 14 room with a floor of its own size and desks under `"layout"`:

```json
"layout": {
  "cols": 48, "rows": 28, "islandSize": 4,
  "seats": [{ "c": 3, "r": 5 }, { "c": 7, "r": 5 }],
  "door": { "c": 23, "r": 27 }, "doorGap": [23, 24],
  "meeting": [{ "c": 38, "r": 11, "face": "right" }]
}
```

| Field | Meaning |
|---|---|
| `cols`, `rows` | size in tiles: 16–96 columns, 10–64 rows. Column 0 and the last column are wall, rows 0–1 the top wall, the last two rows the bottom wall |
| `seats` | the seat of each desk, in desk order; the 3 × 2 desk sits below it (columns `c-1`..`c+1`, rows `r+1`..`r+2`). Seat and desk stay inside columns 1..`cols-2` and rows 2..`rows-3`, and no two desks overlap. The number of seats is the floor's desk count |
| `islandSize` | desks reserved per PC in a shared office (default 4, at most the number of seats) |
| `door` | the tile everyone walks in and out by: on the bottom row (`rows-1`) |
| `doorGap` | the two adjacent columns of the doorway in the bottom wall; one of them is `door.c` |
| `meeting` | seats around the meeting table, in the order they fill, each `{ c, r, face }` with `face` `left`, `right` or `up` |

A theme with a `layout` brings **all** its furniture in `decor` (nothing of the base room is added, so `removeDecor` is rejected), its `decor`, `rugs` and `glows` tiles are checked against its own `cols` and `rows`, and it gets no seasons (their decor is placed for the room). The reachability rules of the room grid apply to it the same way.

The server numbers desks by its theme's floor only for **bundled** themes: your own theme with a `layout` is drawn with its floor, but a server started with it numbers desks 8 to a room, islands of 4, and the page lays those numbers out on your floor. The page picks its theme from `?theme`, then the choice saved in the browser, then the server's theme, so a theme once picked on the page wins over the server's until you pick another.

### Art

Sprites are PNGs with transparency, drawn on a 16 px grid and bottom-aligned in their cell, like the Pixel Agents furniture. Credit every new folder in `ASSETS.md`. The bundled theme and season sprites are drawn by `scripts/draw-theme-art.py` (Python 3 + Pillow); rerun it after editing a sprite. Paid packs you own can be used locally but must not be committed.

`validateTheme` in `web/theme.ts` rejects a theme with a wrong field and names it in the browser console.
