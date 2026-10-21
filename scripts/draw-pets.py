#!/usr/bin/env python3
"""Makes the deskmates pets from the Pixel Agents ones (MIT): Claudio the dog and Gitcat the cat.

Each pet keeps the body, poses and animation of a Pixel Agents pet sheet and gets a new look: the fur recoloured as
ramps that keep the original shading, then per-frame edits anchored on the nose (white muzzles, bibs and socks,
calico patches, a docked tail and shorter legs, longer ears). The pets are original designs, breeds only.

Sheet format: 96x96. Rows 0 and 1 hold six 16x32 frames facing down and up (0-2 walk, 3-5 sit); row 2 holds three
32x32 side-walk frames facing right. Run from the repository root:

    python3 scripts/draw-pets.py            # writes assets/pets/<id>/pet.png and manifest.json
    python3 scripts/draw-pets.py --preview  # also writes enlarged previews to docs/pets-preview/
"""
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "pixel-agents" / "pets"
OUT = ROOT / "assets" / "pets"
PREVIEW = ROOT / "docs" / "pets-preview"
CLEAR = (0, 0, 0, 0)


def rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def rgba(h):
    return rgb(h) + (255,)


# The colours of the two base sheets, by what they are (read off the sheets).
GITCAT = {"outline": "120e14", "fur": "3e3636", "shade": "221e1e", "ear": "c2b1a9", "nose": "ca719f"}
CLAUDIO = {"outline": "694325", "dark": "56361d", "fur": "ec954f", "fur2": "bd7a43", "fur3": "a56837",
           "tan": "a18b65", "muzzle": "b0a084", "ear": "f5c1c1", "ear2": "c5a3a3", "tongue": "cc6e77",
           "eye": "120e14", "nose": "000000"}


def cells():
    """(view, kind, x0, y0, width) of every frame of a sheet."""
    for row, view in ((0, "front"), (1, "back")):
        for f in range(6):
            yield view, "walk" if f < 3 else "sit", f * 16, row * 32, 16
    for f in range(3):
        yield "side", "walk", f * 32, 64, 32


class Cell:
    """One frame of the sheet being drawn, read from the untouched base so edits never feed into each other."""

    def __init__(self, base, im, x0, y0, w):
        self.base, self.im, self.x0, self.y0, self.w = base, im, x0, y0, w

    def get(self, x, y):
        if not (0 <= x < self.w and 0 <= y < 32):
            return CLEAR
        return self.base.getpixel((self.x0 + x, self.y0 + y))

    def now(self, x, y):
        if not (0 <= x < self.w and 0 <= y < 32):
            return CLEAR
        return self.im.getpixel((self.x0 + x, self.y0 + y))

    def put(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < 32:
            self.im.putpixel((self.x0 + x, self.y0 + y), c)

    def find(self, colour):
        """First pixel of a colour, scanning rows top-down and each row from the right (the nose faces right)."""
        c = rgb(colour)
        for y in range(32):
            for x in reversed(range(self.w)):
                p = self.get(x, y)
                if p[3] and p[:3] == c:
                    return x, y
        return None

    def is_(self, x, y, *colours):
        p = self.get(x, y)
        return bool(p[3]) and p[:3] in {rgb(c) for c in colours}


def recolour(im, mapping):
    im = im.copy()
    px = im.load()
    m = {rgb(k): rgb(v) for k, v in mapping.items()}
    for y in range(im.height):
        for x in range(im.width):
            p = px[x, y]
            if p[3] and p[:3] in m:
                px[x, y] = m[p[:3]] + (p[3],)
    return im


def paint(cell, x, y, fur, ramp):
    """Recolours one fur pixel of the base with the ramp ({base colour: new colour}); outlines and eyes stay."""
    p = cell.get(x, y)
    if p[3] and p[:3] in fur:
        cell.put(x, y, rgba(ramp[fur[p[:3]]]))


def socks(cell, fur, ramp, depth, from_y):
    """The lowest `depth` fur pixels of every column below `from_y`: paws (and a belly line between the legs)."""
    for x in range(cell.w):
        n = 0
        for y in reversed(range(from_y, 32)):
            p = cell.get(x, y)
            if not p[3]:
                if n:
                    break
                continue
            if p[:3] in fur:
                paint(cell, x, y, fur, ramp)
                n += 1
                if n == depth:
                    break


def dock(cell, row, base_outline, outline):
    """Side view: everything behind the rump above the back line goes (the tail), and the rump gets its outline."""
    back = next(x for x in range(cell.w) if all(cell.is_(x + i, row, base_outline) for i in range(4)))
    below = next(x for x in range(cell.w) if cell.get(x, row + 2)[3])
    for y in range(row + 2):
        edge = back if y < row else back - 1 if y == row else below
        for x in range(edge):
            cell.put(x, y, CLEAR)
    cell.put(back - 1, row, outline)
    for x in range(below, max(back - 1, below + 1)):
        cell.put(x, row + 1, outline)
    return back


# ---------------------------------------------------------------- Pascal, a tuxedo cat (from Gitcat)

def pascal():
    base = Image.open(SRC / "gitcat" / "pet.png").convert("RGBA")
    g = GITCAT
    im = recolour(base, {g["fur"]: "35302f", g["shade"]: "1e1a1b", g["ear"]: "d8a8a8"})
    fur = {rgb(g["fur"]): "fur", rgb(g["shade"]): "shade"}
    white = {"fur": "f2eee8", "shade": "c4bcb6"}
    for view, kind, x0, y0, w in cells():
        c = Cell(base, im, x0, y0, w)
        if view == "front":
            nx, ny = c.find(g["nose"])
            rows = {0: (-2, 2), 1: (-2, 2), 2: (-2, 2), 3: (-1, 1)} if kind == "walk" else \
                {0: (-2, 2), 1: (-3, 3), 2: (-3, 3), 3: (-3, 3), 4: (-3, 3)}
            for dy, (a, b) in rows.items():
                for dx in range(a, b + 1):
                    if (dx, dy) != (0, 0):
                        paint(c, nx + dx, ny + dy, fur, white)
            if kind == "walk":
                socks(c, fur, white, 2, ny + 4)
        elif view == "back":
            if kind == "walk":
                socks(c, fur, white, 2, 25)
        else:
            nx, ny = c.find(g["nose"])
            for dy, (a, b) in {0: (-2, -1), 1: (-4, -1), 2: (-5, -2), 3: (-6, -3), 4: (-7, -4)}.items():
                for dx in range(a, b + 1):
                    paint(c, nx + dx, ny + dy, fur, white)
            socks(c, fur, white, 2, ny + 4)
    return im


# ---------------------------------------------------------------- Nova, a calico cat (from Gitcat)

def blob(cell, ax, ay, spots, fur, ramp):
    """Patches of fur: ellipses (dx, dy, rx, ry) around the anchor, with soft pixel-art edges."""
    for x in range(cell.w):
        for y in range(32):
            for dx, dy, rx, ry in spots:
                if ((x - ax - dx) / rx) ** 2 + ((y - ay - dy) / ry) ** 2 <= 1.0:
                    paint(cell, x, y, fur, ramp)
                    break


def nova():
    base = Image.open(SRC / "gitcat" / "pet.png").convert("RGBA")
    g = GITCAT
    im = recolour(base, {g["fur"]: "f4efe6", g["shade"]: "cdc3b5", g["outline"]: "2a2224", g["ear"]: "e8b4b0"})
    fur = {rgb(g["fur"]): "fur", rgb(g["shade"]): "shade"}
    orange = {"fur": "e4943f", "shade": "b5682a"}
    black = {"fur": "3c3434", "shade": "282222"}
    for view, kind, x0, y0, w in cells():
        c = Cell(base, im, x0, y0, w)
        if view == "front":
            # the cat's right side (the viewer's left) is orange, its left ear black; an orange tail behind
            nx, ny = c.find(g["nose"])
            blob(c, nx, ny, [(-4, -3, 3.2, 3.2), (-1, -10, 3.5, 4.5)], fur, orange)
            blob(c, nx, ny, [(4, -4, 2.6, 2.2)], fur, black)
            blob(c, nx, ny, [(-1, -13, 2, 1.6)], fur, black)  # tail tip
            if kind == "walk":
                blob(c, nx, ny, [(3, 4, 1.6, 1.4)], fur, black)
            else:
                blob(c, nx, ny, [(3, 3, 1.6, 1.4)], fur, orange)
        elif view == "back":
            top = 11 if kind == "walk" else 14
            blob(c, 7, top, [(4, 2, 3.2, 3.0), (3, 9, 2.6, 2.4)], fur, orange)
            blob(c, 7, top, [(-4, 1, 2.4, 2.0), (-3, 12, 2.4, 2.4)], fur, black)
        else:
            # the side shows its left: black ear and nape, an orange saddle, a black hip and an orange tail
            nx, ny = c.find(g["nose"])
            blob(c, nx, ny, [(-3, -5, 2.6, 2.4)], fur, black)
            blob(c, nx, ny, [(-12, -2, 4.2, 2.2), (-19, -6, 2.2, 5.0)], fur, orange)
            blob(c, nx, ny, [(-17, 1, 2.6, 2.4), (-20, -12, 1.6, 1.6)], fur, black)
    return im


# ---------------------------------------------------------------- Biscuit, a tricolour corgi (from Claudio)

def drop_rows(im, x0, y0, w, rows):
    """Removes rows of a frame and lets everything above slide down, so the feet stay on the ground."""
    cell = im.crop((x0, y0, x0 + w, y0 + 32))
    keep = [y for y in range(32) if y not in rows]
    out = Image.new("RGBA", (w, 32), CLEAR)
    for i, y in enumerate(reversed(keep)):
        out.paste(cell.crop((0, y, w, y + 1)), (0, 31 - i))
    im.paste(out, (x0, y0))


def biscuit():
    base = Image.open(SRC / "claudio" / "pet.png").convert("RGBA")
    k = CLAUDIO
    # a tricolour: a charcoal coat, tan cheeks and muzzle, white blaze, chest and socks, so it never reads as Claudio,
    # whose orange it was recoloured from
    im = recolour(base, {k["fur"]: "3b322d", k["fur2"]: "2c2521", k["fur3"]: "221c19", k["outline"]: "120e14",
                         k["dark"]: "0d0a0b", k["tan"]: "c47a3c", k["muzzle"]: "f8f4ee"})
    fur = {rgb(k["fur"]): "fur", rgb(k["fur2"]): "fur2", rgb(k["fur3"]): "fur3"}
    white = {"fur": "f8f4ee", "fur2": "dcd2c6", "fur3": "dcd2c6"}
    out = rgba("120e14")
    for view, kind, x0, y0, w in cells():
        c = Cell(base, im, x0, y0, w)
        if view == "front":
            # a white blaze up the forehead, white chest and socks
            nx, ny = c.find(k["nose"])
            for dy in (-3, -2):
                paint(c, nx, ny + dy, fur, white)
                paint(c, nx + 1, ny + dy, fur, white)
            for dy, (a, b) in {3: (-2, 3), 4: (-2, 3), 5: (-1, 2)}.items():
                for dx in range(a, b + 1):
                    paint(c, nx + dx, ny + dy, fur, white)
            if kind == "walk":
                socks(c, fur, white, 2, 25)
            else:
                socks(c, fur, white, 1, 28)
        elif view == "back":
            if kind == "walk":
                socks(c, fur, white, 2, 25)
            else:
                # no tail curled on the floor: a docked one
                for y in (28, 29, 30):
                    for x in range(0, 4):
                        p = c.get(x, y)
                        if p[3] and (x < 2 or c.is_(x, y, k["dark"], k["tan"])):
                            c.put(x, y, CLEAR)
                for y in (28, 29):
                    c.put(2, y, out)
                c.put(3, 30, CLEAR)
        else:
            # docked tail
            dock(c, 17, k["outline"], out)
            socks(c, fur, white, 2, 24)
            # white from the chin down the chest
            nx, ny = c.find(k["nose"])
            for dy, (a, b) in {1: (-3, -1), 2: (-4, -2), 3: (-6, -2), 4: (-7, -3), 5: (-8, -4)}.items():
                for dx in range(a, b + 1):
                    paint(c, nx + dx, ny + dy, fur, white)
    # short legs: one row of leg out of every walking frame, one of body from the side
    for view, kind, x0, y0, w in cells():
        if kind == "walk":
            drop_rows(im, x0, y0, w, {26, 28} if view != "side" else {21, 27})
    return im


# ---------------------------------------------------------------- Pip, a lab rabbit (from Gitcat)

def stamp(cell, x0, y0, rows, colours):
    """Draws a small template; '.' leaves the pixel as it is."""
    for dy, line in enumerate(rows):
        for dx, ch in enumerate(line):
            if ch != ".":
                cell.put(x0 + dx, y0 + dy, colours[ch])


EAR_FRONT = [".oo.", "ofpo", "ofpo", "ofpo", "ofpo", "ofpo", "ofpo"]
EAR_BACK = [".oo.", "offo", "offo", "ofso", "ofso", "ofso", "ofso"]
# from the side the ears lean back: (dy, dx) from the nose of each row's left end
EAR_SIDE = [(-15, -7, ".oo."), (-14, -8, "offpo"), (-13, -8, "offpo"), (-12, -7, "offpo"), (-11, -7, "offpo"),
            (-10, -7, "offpo"), (-9, -6, "offpo"), (-8, -6, "offpo"), (-7, -6, "offpo"), (-6, -6, "offpo")]
POMPOM = [".oo.", "owwo", "owso", ".oo."]


def pip():
    base = Image.open(SRC / "gitcat" / "pet.png").convert("RGBA")
    g = GITCAT
    pal = {"fur": "b4aca6", "shade": "857d78", "outline": "3a3032", "ear": "eab4b4"}
    im = recolour(base, {g["fur"]: pal["fur"], g["shade"]: pal["shade"], g["outline"]: pal["outline"], g["ear"]: pal["ear"]})
    col = {"o": rgba(pal["outline"]), "f": rgba(pal["fur"]), "s": rgba(pal["shade"]), "p": rgba(pal["ear"]),
           "w": rgba("f6f2ec"), "W": rgba("d2cac2")}
    pom = dict(col, s=col["W"])
    for view, kind, x0, y0, w in cells():
        c = Cell(base, im, x0, y0, w)
        if view == "front":
            # the tail curled behind the head goes; two long ears stand up instead of the short ones
            top = next(y for y in range(32) if any(c.is_(x, y, g["ear"]) for x in range(w)))
            for y in range(top):
                for x in range(w):
                    c.put(x, y, CLEAR)
            for y in (top, top + 1):
                for x in (2, 3, 4, 10, 11, 12):
                    paint(c, x, y, {rgb(g["ear"]): "ear"}, {"ear": pal["fur"]})
            n = len(EAR_FRONT)
            stamp(c, 2, top - n, EAR_FRONT, col)
            stamp(c, 9, top - n, [line[::-1] for line in EAR_FRONT], col)
        elif view == "back":
            top = next(y for y in range(32) if all(c.get(x, y)[3] for x in range(5, 10)))
            for y in range(top):
                for x in range(w):
                    c.put(x, y, CLEAR)
            n = len(EAR_BACK)
            stamp(c, 2, top - n, EAR_BACK, col)
            stamp(c, 9, top - n, EAR_BACK, col)
            # the tail drawn down the back becomes plain fur, with a round white tail at the bottom
            bottom = max(y for y in range(32) for x in range(4, 11) if c.get(x, y)[3])
            for y in range(top + 3, bottom - 1):
                for x in range(4, 11):
                    if c.is_(x, y, g["outline"], g["shade"]) and c.get(x - 1, y)[3] and c.get(x + 1, y)[3] \
                            and not (kind == "walk" and y > bottom - 7):
                        c.put(x, y, col["s"] if c.is_(x, y, g["shade"]) and x in (4, 10) else col["f"])
            stamp(c, 6, bottom - (8 if kind == "walk" else 6), POMPOM, pom)
        else:
            back = dock(c, 17, g["outline"], col["o"])
            stamp(c, back - 4, 15, POMPOM, pom)
            nx, ny = c.find(g["nose"])
            far = dict(col, f=col["s"], p=col["s"])
            for dy, dx, line in EAR_SIDE:  # the far ear peeks out behind the near one
                stamp(c, nx + dx - 2, ny + dy + 1, [line], far)
            for dy, dx, line in EAR_SIDE:
                stamp(c, nx + dx, ny + dy, [line], col)
            for dy in range(-7, -4):
                for dx in range(-6, -1):
                    paint(c, nx + dx, ny + dy, {rgb(g["ear"]): "ear"}, {"ear": pal["fur"]})
    return im


PETS = [
    {"id": "pascal", "name": "Pascal", "base": "gitcat", "about": "a tuxedo cat: white muzzle, bib and socks", "make": pascal},
    {"id": "nova", "name": "Nova", "base": "gitcat", "about": "a calico cat: white with orange and black patches", "make": nova},
    {"id": "biscuit", "name": "Biscuit", "base": "claudio", "about": "a tricolour corgi: charcoal coat, tan cheeks, white blaze, chest and socks, docked tail, short legs", "make": biscuit},
    {"id": "pip", "name": "Pip", "base": "gitcat", "about": "a grey lab rabbit: long ears and a round white tail", "make": pip},
]


def enlarge(im, scale=8, grid=True):
    bg = Image.new("RGBA", im.size, (214, 226, 210, 255))
    bg.alpha_composite(im)
    big = bg.resize((im.width * scale, im.height * scale), Image.NEAREST)
    if grid:
        d = ImageDraw.Draw(big)
        for y in (32, 64):
            d.line([(0, y * scale), (big.width, y * scale)], fill=(160, 170, 160, 255))
        for x in range(16, 96, 16):
            d.line([(x * scale, 0), (x * scale, 64 * scale)], fill=(160, 170, 160, 255))
        for x in (32, 64):
            d.line([(x * scale, 64 * scale), (x * scale, big.height)], fill=(160, 170, 160, 255))
    return big


def lineup(scale=6):
    """Every pet side by side: walking towards you, sitting, from behind and from the side."""
    names = [("claudio", "Claudio", SRC), ("gitcat", "Gitcat", SRC)] + [(p["id"], p["name"], OUT) for p in PETS]
    cols = [(0, 0, 16), (48, 0, 16), (0, 32, 16), (0, 64, 32)]
    cw = sum(w for _, _, w in cols) + 4 * (len(cols) - 1)
    im = Image.new("RGBA", (len(names) * (cw + 12) + 12, 32 + 14), (214, 226, 210, 255))
    d = ImageDraw.Draw(im)
    for i, (pid, name, src) in enumerate(names):
        sheet = Image.open(src / pid / "pet.png").convert("RGBA")
        x = 12 + i * (cw + 12)
        for sx, sy, w in cols:
            im.alpha_composite(sheet.crop((sx, sy, sx + w, sy + 32)), (x, 2))
            x += w + 4
        d.text((12 + i * (cw + 12), 34), name, fill=(40, 48, 40, 255))
    return im.resize((im.width * scale, im.height * scale), Image.NEAREST)


def main():
    preview = "--preview" in sys.argv
    for spec in PETS:
        im = spec["make"]()
        assert im.size == (96, 96)
        d = OUT / spec["id"]
        d.mkdir(parents=True, exist_ok=True)
        im.save(d / "pet.png")
        (d / "manifest.json").write_text(json.dumps({"id": spec["id"], "name": spec["name"]}) + "\n")
        print(f"assets/pets/{spec['id']}/pet.png ({spec['about']}) from Pixel Agents {spec['base']}")
        if preview:
            PREVIEW.mkdir(parents=True, exist_ok=True)
            enlarge(im).save(PREVIEW / f"{spec['id']}.png")
    if preview:
        lineup().save(PREVIEW / "lineup.png")


if __name__ == "__main__":
    main()
