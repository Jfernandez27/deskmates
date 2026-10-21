# Assets

Every image bundled with deskmates, where it comes from and its licence.

| Path | Author | Source | Licence |
|---|---|---|---|
| `assets/pixel-agents/` (characters, floors, walls, furniture, the pets Claudio and Gitcat) | Pablo De Lucca and Pixel Agents contributors | https://github.com/pixel-agents-hq/pixel-agents, commit `d1e007a9fdf3003c252d2973abe1999ae59aec33`, `webview-ui/public/assets/` | MIT — see `assets/pixel-agents/LICENSE` |
| `assets/accessories/` (beret, headset, notebook, magnifier, folder, toolbox, pen, book, globe, the coffee cup) | deskmates | drawn for this project; the hand-held ones (notebook, magnifier, folder, toolbox, pen, book, globe, cup) by `scripts/draw-accessories.py` | MIT — see `LICENSE` |
| `assets/computers/` (laptop, silver laptop) | deskmates | drawn for this project | MIT — see `LICENSE` |
| `assets/breakroom/` (soda and snack machines, the TV) | deskmates | drawn for this project; the TV by `scripts/draw-theme-art.py` | MIT — see `LICENSE` |
| `assets/themes/cozy/` (floor lamp) | deskmates | drawn for this project (`scripts/draw-theme-art.py`) | MIT — see `LICENSE` |
| `assets/themes/cafe/` (espresso machine, pastry counter, menu board, café table) | deskmates | drawn for this project (`scripts/draw-theme-art.py`) | MIT — see `LICENSE` |
| `assets/themes/servers/` (server racks with blinking LEDs) | deskmates | drawn for this project (`scripts/draw-theme-art.py`) | MIT — see `LICENSE` |
| `assets/themes/library/` (tall bookshelves) | deskmates | drawn for this project (`scripts/draw-theme-art.py`) | MIT — see `LICENSE` |
| `assets/seasons/` (Halloween, Fiestas Patrias, Christmas and the four seasons of the year) | deskmates | drawn for this project (`scripts/draw-theme-art.py`) | MIT — see `LICENSE` |
| `assets/pets/` (Pascal, Biscuit, Nova and Pip) | deskmates, derived from the Pixel Agents pets (Claudio and Gitcat) | `scripts/draw-pets.py` recolours the Pixel Agents pet sheets and edits every frame: white muzzles, bibs and socks, calico patches, a docked tail and shorter legs, long ears and a round tail | MIT — see `LICENSE` and `assets/pixel-agents/LICENSE` |
| `assets/characters/` (the eight deskmates characters) | deskmates, derived from the Pixel Agents characters | `scripts/draw-characters.py` recolours the Pixel Agents sheets (skin, hair, clothes) and adds glasses and beards | MIT — see `LICENSE` and `assets/pixel-agents/LICENSE` |

The Pixel Agents characters are based on the [Metro City character pack](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack) by JIK-A-4, released under CC0.

`scripts/fetch-pa-assets.sh` re-downloads the Pixel Agents files from the pinned commit. To use a different look, replace these folders with another pack of the same layout; paid packs you own (for example Donarg's Office Interior Tileset or LimeZu's Modern Office) can be used locally but must not be committed, because their licences forbid redistribution.
