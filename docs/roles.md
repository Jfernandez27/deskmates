# Roles and outfits

A role gives a character an accessory, a colour and a computer, based on the agent's name.

```toml
[roles.designer]
match = ["designer"]       # agent names; "id3a:designer" also matches "designer"
color = "#7A4FD6"          # badge on the chest, label and card accent (#RRGGBB)
accessory = "beret"        # beret | headset | notebook | magnifier | folder | toolbox | pen | book | globe
computer = "mac"           # laptop (default) | mac (silver laptop) | pc (tower)
```

Bundled roles (`roles.toml`): designer (beret, silver laptop), community-manager (headset), content-creator (notebook, laptop), Explore and cavecrew-investigator (magnifier), Plan (folder), general-purpose and cavecrew-builder (toolbox), code-reviewer, cavecrew-reviewer and reviewer (red pen), claude-code-guide (book), researcher and deep-research (globe).

## Your own roles

Create `~/.config/deskmates/roles.toml`. A role with the same name replaces the bundled one; new names are added. Restart `deskmates serve` to load changes.

```toml
[roles.reviewer]
match = ["code-reviewer", "reviewer"]
color = "#C0392B"
accessory = "magnifier"
computer = "pc"
```

Invalid values stop the service with a message naming the field, instead of drawing something wrong.

## Characters

Characters are dealt by session from a set, starting from a different one each time the office fills up from empty, chosen with the **Characters** selector in the page header (remembered per browser) or `?chars=deskmates|pixel-agents|all`:

- **deskmates** (default): eight characters of an original group of lab friends — a theorist, an experimentalist, an engineer, an astronomer, the neighbour, a neuroscientist, a microbiologist and the comic shop owner. They keep the bodies and animations of the Pixel Agents characters (the head dips while typing and reading, the desk hides them when seated) with new skin, hair, clothes, glasses and beards, made by `scripts/draw-characters.py`.
- **Pixel Agents**: the six characters of Pixel Agents.
- **All**: both sets together.

### A character of your own

Give a role its own character: put a sheet in `~/.config/deskmates/characters/<name>.png` and name it in the role.

```toml
[roles.designer]
match = ["designer"]
character = "my-designer"   # ~/.config/deskmates/characters/my-designer.png
```

The sheet uses the same format as the bundled ones: a 112x96 PNG with 7 frames of 16x32 in 3 rows (facing down, up, right; left is the right row mirrored). Frames 0-2 walk, 3-4 type at the desk, 5-6 read. The name takes lowercase letters, digits and dashes. Accessories and the colour badge are still drawn on top. A missing file, or one of another size, falls back to a character from the set (the browser console says why). The sheet is served at `/v1/characters/<name>.png`, to `--lan` clients too.

## Where names come from

| Source | Name |
|---|---|
| Claude Code `--agent plugin:name` | `plugin:name` |
| Claude Code subagents | their type: `Explore`, `Plan`, `general-purpose`, custom agents |
| Ingest API | the `agent` field |
| Other tools | no role; the label shows a name that suits the character (see [usage.md](usage.md)) |
