# Roadmap

## Done

- **Core** — Claude Code via hooks (several profiles), office with Pixel Agents art, roles and outfits, tokens, notifications, break room.
- **Other tools** — Codex, Copilot CLI, Cursor and Gemini CLI via transcripts; token-protected ingest API.
- **Reach** — LAN mode, VS Code panel, npm package build.
- **More pets** — Pascal (tuxedo cat), Biscuit (corgi), Nova (calico cat) and Pip (lab rabbit), derived from the Pixel Agents pets by `scripts/draw-pets.py` in the same sheet format; two pets per open room by default, all six, one or none from the pet selector. Previews in [pets-preview/](pets-preview/). **Done 2026-10-14.**

## Themes

A theme is `assets/themes/<id>/theme.json`: floor tile, tints for floor and walls, page colours, optional night lighting. Pick it from the selector in the page header (remembered per browser), with `?theme=<id>` in the URL, or set the default with `deskmates serve --theme <id>`.

1. **Day / Night shift** — theme engine; night darkens the office and only screens in use and the vending machines glow. **Done 2026-10-14.**
2. **Automatic by hour** — follow the real clock: day from 08:00 to 19:00, night otherwise (`--theme auto`). **Done 2026-10-14.**
3. **Cozy, Café / cowork, Server room, Library** — bundled themes with their own furniture, rugs, lamps and animated server racks. **Done 2026-10-14.**
4. **Brand** — a theme from a palette: id3a (ink and orange) as an example; label and card colours from the brand.
5. **Seasonal** — Halloween, Christmas, Fiestas Patrias decor on top of any theme, switched on by date. **Done 2026-10-14.**
   Seasons of the year (spring, summer, autumn, winter) between festivities, by the hemisphere of the browser's time zone. **Done 2026-10-14.**
6. **User themes** — shipped: `~/.config/deskmates/themes/`, see [themes.md](themes.md#your-own-themes).

7. **Headquarters theme** — a larger single floor for the shared office: six islands of four desks, one per PC, a café in the middle, a lounge and a meeting table; the default of `serve --shared`. **Done 2026-10-21.**

## Later

See [BACKLOG.md](BACKLOG.md).
