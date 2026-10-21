"""Draws the hand-held role accessories: notebook, magnifier, folder, toolbox, red pen, book and globe.

The beret and headset are worn, not held, and stay hand-drawn. These come from the pixel maps below so they can be
redrawn and tuned. Each map is one row per line: "." is transparent, any other letter a colour of PALETTE. Every
sprite ends up with a dark outline, so it reads against a character's clothes at small scales: the newer maps draw
their own, the first three (drawn by hand before) get a one-pixel ring added around them (RINGED).

    python3 scripts/draw-accessories.py      # writes assets/accessories/<name>.png
"""
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "assets" / "accessories"

PALETTE = {
    "o": (43, 37, 48),     # outline, the same ink as the speech-bubble icons
    "r": (217, 87, 99),    # red
    "y": (242, 201, 76),   # brass, pencil wood
    "b": (91, 143, 217),   # blue
    "g": (79, 174, 106),   # green
    "w": (244, 244, 242),  # paper, cup
    # the first three accessories' own colours
    "n": (224, 131, 43),   # notebook cover
    "p": (250, 244, 230),  # notebook page
    "l": (90, 80, 70),     # notebook lines
    "k": (20, 16, 24),     # magnifier rim
    "c": (170, 215, 240),  # lens
    "h": (240, 250, 255),  # lens glint
    "d": (110, 70, 40),    # handle
    "f": (120, 90, 20),    # folder edge
    "e": (236, 196, 80),   # folder
}

SPRITES = {
    # content-creator: an orange notebook with written lines
    "notebook": [
        "nnnnnn",
        "nppppn",
        "nlllpn",
        "nppppn",
        "nllppn",
        "nppppn",
        "nnnnnn",
    ],
    # Explore: a magnifier
    "magnifier": [
        ".kkk...",
        "kccck..",
        "kchck..",
        "kccck..",
        ".kkkd..",
        "....dd.",
        ".....dd",
    ],
    # Plan: a folder
    "folder": [
        "fff....",
        "feeffff",
        "feeeeef",
        "feeeeef",
        "feeeeef",
        "fffffff",
    ],
    # a coffee break: a white cup with coffee in it (not a role accessory; the break pose holds it)
    "cup": [
        "owwwo.",
        "odddo.",
        "owwwoo",
        "owwwow",
        "owwwoo",
        ".ooo..",
    ],
    # general-purpose: a red toolbox with a handle and a brass latch
    "toolbox": [
        "..ooo..",
        ".o...o.",
        "ooooooo",
        "orrrrro",
        "oryyyro",
        "orrrrro",
        "ooooooo",
    ],
    # reviewer: a red pen, nib down
    "pen": [
        "......o",
        ".....or",
        "....oro",
        "...oro.",
        "..oro..",
        ".oyo...",
        "oo.....",
    ],
    # guide, docs: a blue book with its pages showing
    "book": [
        "ooooo..",
        "obbbbo.",
        "obbbbow",
        "obyybow",
        "obbbbow",
        "obbbbow",
        "oooooo.",
    ],
    # web research: a globe
    "globe": [
        "..ooo..",
        ".obgbo.",
        "obggbbo",
        "obbgggo",
        "oggbbbo",
        ".obbgo.",
        "..ooo..",
    ],
}


RINGED = {"notebook", "magnifier", "folder"}


def ring(img):
    """Adds a one-pixel outline around the sprite's silhouette: 1 px larger on every side."""
    w, h = img.size
    out = Image.new("RGBA", (w + 2, h + 2), (0, 0, 0, 0))
    ink = PALETTE["o"] + (255,)
    for y in range(h):
        for x in range(w):
            if img.getpixel((x, y))[3]:
                for dx in (0, 1, 2):
                    for dy in (0, 1, 2):
                        out.putpixel((x + dx, y + dy), ink)
    out.alpha_composite(img, (1, 1))
    return out


def draw(rows):
    img = Image.new("RGBA", (len(rows[0]), len(rows)), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != ".":
                img.putpixel((x, y), PALETTE[ch] + (255,))
    return img


if __name__ == "__main__":
    for name, rows in SPRITES.items():
        assert all(len(r) == len(rows[0]) for r in rows), name
        img = draw(rows)
        (ring(img) if name in RINGED else img).save(OUT / f"{name}.png")
        print(f"assets/accessories/{name}.png")
