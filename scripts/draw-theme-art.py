#!/usr/bin/env python3
"""Draws the theme and season sprites (drawn for this project, MIT).

Style follows the Pixel Agents furniture: 16 px grid, one-pixel dark outline, a small palette,
transparent background, bottom-aligned in the cell. Run from the repository root:

    python3 scripts/draw-theme-art.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / "assets"
INK = (43, 37, 48, 255)


def rgb(h, a=255):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


class S:
    """A sprite canvas with a few primitives and an automatic outline pass."""

    def __init__(self, w, h):
        self.im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        self.w, self.h = w, h

    def px(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.im.putpixel((x, y), rgb(c) if isinstance(c, str) else c)

    def rect(self, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.px(x, y, c)

    def hline(self, x0, x1, y, c):
        self.rect(x0, y, x1, y, c)

    def vline(self, x, y0, y1, c):
        self.rect(x, y0, x, y1, c)

    def rows(self, x0, y0, art, pal):
        """ASCII art: one char per pixel, '.' transparent."""
        for dy, line in enumerate(art):
            for dx, ch in enumerate(line):
                if ch != ".":
                    self.px(x0 + dx, y0 + dy, pal[ch])

    def filled(self, x, y):
        return 0 <= x < self.w and 0 <= y < self.h and self.im.getpixel((x, y))[3] > 0

    def outline(self, c=INK):
        pts = [(x, y) for y in range(self.h) for x in range(self.w) if not self.filled(x, y)
               and any(self.filled(x + dx, y + dy) and self.im.getpixel((x + dx, y + dy)) != c
                       for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
        for p in pts:
            self.im.putpixel(p, c)
        return self

    def save(self, rel):
        p = ROOT / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        self.im.save(p)
        print(rel, self.im.size)


def mirrored(s):
    out = S(s.w, s.h)
    out.im = s.im.transpose(Image.FLIP_LEFT_RIGHT)
    return out


# ---------------------------------------------------------------- break room
def tv(frame):
    """A TV on the wall with a console under it, showing a platform game; three frames of it playing."""
    s = S(32, 24)
    s.rect(1, 1, 30, 17, "#26262e")             # bezel
    s.rect(3, 3, 28, 15, "#6cb6ff")             # sky
    s.rect(3, 13, 28, 15, "#4fae6a")            # ground
    s.hline(3, 28, 13, "#3b8a52")
    for x in (6, 18):                           # clouds drift with the frames
        cx = 3 + (x + frame * 3) % 24
        s.rect(cx, 5, cx + 3, 6, "#f4f4f2")
    px = 7 + frame * 5                          # the player runs right and jumps on the middle frame
    py = 9 if frame == 1 else 11
    s.rect(px, py, px + 1, py + 1, "#d95763")
    s.px(px, py - 1, "#f2b880")
    cx = 22 - frame * 2                         # a coin, then gone
    if frame < 2:
        s.rect(cx, 8, cx + 1, 9, "#f2c94c")
    s.rect(14, 18, 17, 19, "#3a3a44")           # mount
    s.rect(9, 20, 22, 22, "#2b2b33")            # console
    s.hline(10, 21, 20, "#4a4a56")
    s.px(20, 21, "#4fae6a" if frame != 2 else "#2a5a3a")  # power light
    return s.outline()


# ---------------------------------------------------------------- cozy
def floor_lamp():
    s = S(16, 32)
    shade = ["#f7dc94", "#f3cf7a", "#efc46a", "#e8b65a", "#e0a84a", "#d69a3e", "#b9772e"]
    for i, c in enumerate(shade):  # trapezoid shade, rows 6..12
        s.hline(6 - i // 2, 9 + i // 2, 6 + i, c)
    s.hline(5, 6, 8, "#fbe7b0")
    s.vline(7, 13, 28, "#7a604a")
    s.vline(8, 13, 28, "#5a4636")
    s.rect(5, 28, 10, 29, "#5a4636")
    s.hline(6, 9, 28, "#7a604a")
    s.hline(4, 11, 30, "#4a3a2e")
    return s.outline()


# ---------------------------------------------------------------- cafe
def cabinet(s):
    """Counter cabinet, rows 17..31, shared by the espresso machine and the pastry counter."""
    s.rect(1, 17, 14, 18, "#efe9dd")   # marble top
    s.hline(1, 14, 18, "#d6cfc0")
    s.rect(1, 19, 14, 30, "#9a6a43")   # wood front
    s.rect(1, 19, 14, 19, "#7c5235")
    for x in (2, 8):
        s.rect(x, 21, x + 5, 28, "#b07c4f")
        s.hline(x, x + 5, 21, "#c8925f")
        s.px(x + 4, 25, "#e6c27a")      # knob
    s.hline(1, 14, 30, "#6e4a30")


def espresso():
    s = S(16, 32)
    cabinet(s)
    s.rect(3, 3, 5, 4, "#f4f1ea"); s.rect(10, 3, 12, 4, "#f4f1ea")      # cups warming on top
    s.rect(2, 5, 13, 16, "#c3c8d0")     # chrome body
    s.rect(2, 5, 13, 6, "#8d939e")
    s.vline(2, 7, 16, "#e3e6ea")
    s.hline(2, 13, 7, "#a41f2a")        # brand stripe
    s.rect(6, 8, 9, 10, "#3b3f47"); s.rect(7, 9, 8, 9, "#f4f1ea")       # pressure gauge
    s.rect(2, 13, 13, 15, "#8d939e")    # recess under the group heads
    s.rect(3, 11, 5, 12, "#3b3f47"); s.rect(10, 11, 12, 12, "#3b3f47")  # group heads
    s.rect(3, 14, 5, 15, "#f4f1ea"); s.px(6, 14, "#f4f1ea"); s.hline(3, 5, 14, "#6b3f24")  # espresso cup
    s.hline(2, 13, 16, "#5a5f69")       # drip tray
    return s.outline()


def cafe_table():
    """48x32 bistro table: wide wooden top on dark iron legs, same footprint as the Pixel Agents desk."""
    s = S(48, 32)
    s.rect(3, 12, 44, 23, "#b98552")    # top
    s.hline(3, 44, 12, "#d8a870")
    s.hline(3, 44, 23, "#8a5a3c")
    for x in range(6, 44, 9):           # plank seams
        s.vline(x, 13, 22, "#a6744a")
    s.rect(3, 24, 44, 25, "#6e4430")    # apron
    for x in (5, 41):                   # iron legs
        s.rect(x, 26, x + 1, 30, "#3a3640")
    s.hline(7, 40, 28, "#3a3640")       # foot rail
    s.outline()
    return s


def pastry_counter():
    s = S(16, 32)
    cabinet(s)
    s.rect(2, 8, 13, 16, "#cfe6ee")     # glass case
    s.hline(2, 13, 8, "#e9f6fa")
    s.vline(2, 8, 16, "#e9f6fa")
    s.rect(2, 16, 13, 16, "#9aa6ad")    # base
    # croissants and a muffin on two shelves
    for x in (3, 8):
        s.rect(x, 13, x + 3, 15, "#d89a45"); s.hline(x + 1, x + 2, 13, "#f0bd6a"); s.px(x, 15, "#a86c2c")
    s.hline(2, 13, 12, "#9aa6ad")
    s.rect(4, 10, 6, 11, "#7a4a2a"); s.hline(4, 6, 9, "#f2e2c4")
    s.rect(9, 10, 11, 11, "#c25b7a"); s.hline(9, 11, 9, "#f2e2c4")
    s.px(5, 9, "#d33a3a"); s.px(10, 9, "#d33a3a")
    s.rect(6, 5, 9, 7, "#f4f1ea")       # cup stack on top
    s.hline(6, 9, 6, "#d9d4c8")
    s.px(7, 4, "#f4f1ea"); s.px(8, 4, "#f4f1ea")
    return s.outline()


def menu_board():
    s = S(32, 32)
    s.rect(3, 9, 28, 23, "#6e4a30")     # frame
    s.rect(4, 10, 27, 22, "#2f4a3a")    # chalkboard
    chalk = "#e8efe8"
    s.hline(6, 15, 12, chalk)           # "MENU" bar
    for i, y in enumerate((15, 17, 19)):
        s.hline(6, 13 - i, y, "#b8c8b8"); s.hline(17, 19, y, "#f2d57a")
    # cup doodle
    s.rect(21, 13, 24, 16, chalk); s.px(25, 14, chalk); s.px(25, 15, chalk)
    s.rect(22, 14, 23, 15, "#2f4a3a")
    s.px(22, 11, "#b8c8b8"); s.px(23, 12, "#b8c8b8")
    s.hline(20, 25, 18, chalk)
    s.rect(8, 23, 23, 23, "#6e4a30")    # chalk ledge
    s.px(10, 22, chalk); s.px(11, 22, chalk)
    return s.outline()


# ---------------------------------------------------------------- servers
def rack(on):
    """16x32 server rack; `on` is the list of lit LED indexes per unit (frame dependent)."""
    s = S(16, 32)
    s.rect(1, 3, 14, 30, "#2c313c")
    s.hline(1, 14, 3, "#454c5c")
    leds = ["#5df07a", "#ffb84a", "#6cc4ff", "#5df07a", "#5df07a", "#6cc4ff"]
    dim = {"#5df07a": "#2b5a39", "#ffb84a": "#6a4c22", "#6cc4ff": "#2b4a66"}
    for u in range(6):
        y = 5 + u * 4
        s.rect(2, y, 13, y + 2, "#4c5262")
        s.hline(2, 13, y, "#5f6678")
        for x in (8, 10, 12):              # vents
            s.vline(x, y + 1, y + 2, "#383d4a")
        c = leds[u]
        s.px(3, y + 1, c if (u in on) else dim[c])
        s.px(5, y + 1, "#5df07a" if ((u + len(on)) % 2 == 0) == (0 in on) else "#2b5a39")
    s.hline(2, 4, 29, "#454c5c"); s.hline(11, 13, 29, "#454c5c")  # feet
    return s.outline()


# ---------------------------------------------------------------- library
BOOKS = ["#8e3b2f", "#3f5f7a", "#5f7a3a", "#b98a3a", "#6b4a7a", "#a5583a", "#2f5a55", "#c9b48a"]


def tall_bookshelf(seed):
    s = S(32, 32)
    s.rect(1, 4, 30, 30, "#5e3b22")     # carcass
    s.hline(1, 30, 4, "#7a4e2e")
    s.rect(3, 6, 28, 28, "#3e2716")     # back
    k = seed
    for top in (6, 13, 20):            # three shelves of books
        x = 3
        while x < 28:
            k = (k * 7 + 3) % 97
            w = 1 + (k % 2)
            h = 4 + (k % 3)
            if x + w > 28:
                break
            if k % 11 == 0:
                x += 2
                continue
            c = BOOKS[k % len(BOOKS)]
            s.rect(x, top + 6 - h, x + w - 1, top + 5, c)
            s.px(x, top + 6 - h, "#e8dcc0" if k % 3 == 0 else c)
            x += w
        s.hline(3, 28, top + 6, "#7a4e2e")
    s.hline(1, 30, 30, "#4a2e1a")
    return s.outline()


# ---------------------------------------------------------------- seasons
def pumpkin(face):
    s = S(16, 16)
    body = ["....oooooo....",
            "..oOOoooOOoo..",
            ".oOOoooooOOoo.",
            "ooOoooooooOooo",
            "ooOoooooooOooo",
            "ooOoooooooOooo",
            ".oOOoooooOOoo.",
            "..ooooooooooo.",
            "...dddddddd..."]
    s.rows(1, 6, body, {"o": "#e8731e", "O": "#f39a3a", "d": "#b5541a"})
    s.rect(7, 3, 8, 5, "#5d7a2a"); s.px(9, 4, "#7da43a")
    if face:
        g = "#ffe27a"
        s.px(5, 9, g); s.px(4, 10, g); s.px(5, 10, g)
        s.px(10, 9, g); s.px(10, 10, g); s.px(11, 10, g)
        s.hline(4, 11, 12, g); s.px(6, 13, g); s.px(9, 13, g)
        s.px(5, 12, "#b5541a"); s.px(8, 12, "#b5541a")
    return s.outline()


def ghost():
    s = S(16, 32)
    art = ["....wwwwww....",
           "..wwwwwwwwww..",
           ".wwwwwwwwwwww.",
           ".wwwwwwwwwwww.",
           "wwwwwwwwwwwwww",
           "wwwwwwwwwwwwww",
           "wwwwwwwwwwwwww",
           "wwwwwwwwwwwwww",
           "wwwwwwwwwwwwww",
           "wwwwwwwwwwwwww",
           "swwwwwwwwwwwws",
           "swwwwwwwwwwwws",
           "sswwwwwwwwwwss",
           "sswwwwwwwwwwss",
           "ssswwwswwwwsss",
           "s.sws.sws.sws.",
           "...s...s...s.."]
    s.rows(1, 8, art, {"w": "#f4f4fb", "s": "#c9cbe0"})
    s.outline()
    s.rect(5, 12, 5, 14, INK); s.rect(9, 12, 9, 14, INK)
    s.rect(6, 16, 8, 17, INK)
    s.px(3, 15, "#f2a6b8"); s.px(11, 15, "#f2a6b8")
    return s


def bats():
    s = S(16, 32)
    bat = [".k.....k.",
           "kkk.k.kkk",
           "kkkkkkkkk",
           ".kk.k.kk.",
           "....k...."]
    s.rows(1, 10, bat, {"k": "#3a2b4a"})
    s.rows(7, 17, bat, {"k": "#3a2b4a"})
    s.px(5, 11, "#ffcc4a"); s.px(11, 18, "#ffcc4a")
    return s


def cobweb():
    s = S(16, 32)
    c = "#d8d8e4"
    for i in range(12):                 # radial threads from the top-left corner
        s.px(i, 8 + i, c)
        s.px(i, 8, c)
        s.px(0, 8 + i, c)
        s.px(i, 8 + i // 2, c)
        s.px(i // 2, 8 + i, c)
    for r in (4, 8):                    # arcs
        for t in range(r + 1):
            s.px(t, 8 + r - t // 2 if t < r else 8 + r // 2, c)
            s.px(r - t // 2 if t < r else r // 2, 8 + t, c)
    s.rect(8, 16, 9, 17, "#2a2430"); s.vline(8, 9, 15, "#9a9aa8")
    return s


CL_RED, CL_WHITE, CL_BLUE = "#d52b1e", "#f4f4f4", "#0039a6"


def bunting(colors):
    s = S(16, 32)
    tri = ["cccccc", ".cccc.", ".cccc.", "..cc.."]
    for i, col in enumerate(colors):
        x = 1 + i * 8
        for dy, line in enumerate(tri):
            for dx, ch in enumerate(line):
                if ch == "c":
                    s.px(x + dx, 8 + dy, col)
    # outline only the flags, not the string
    flags = S(16, 32)
    flags.im = s.im.copy()
    for x in range(16):
        flags.im.putpixel((x, 7), (0, 0, 0, 0))
    flags.outline()
    flags.hline(0, 15, 7, "#4a3a2e")
    return flags


def flag_cl():
    s = S(16, 48)
    s.rect(6, 41, 9, 44, "#5a4636")     # stand
    s.rect(4, 45, 11, 46, "#4a3a2e")
    s.vline(2, 5, 44, "#8a8f99")
    s.vline(3, 5, 44, "#b9bec7")
    s.rect(2, 4, 3, 4, "#e6c27a")
    s.rect(4, 6, 8, 11, CL_BLUE)        # canton
    s.px(6, 8, CL_WHITE); s.px(5, 9, CL_WHITE); s.px(6, 9, CL_WHITE); s.px(7, 9, CL_WHITE); s.px(6, 10, CL_WHITE)
    s.rect(9, 6, 14, 11, CL_WHITE)
    s.rect(4, 12, 14, 17, CL_RED)
    s.hline(10, 14, 6, "#dcdcdc")
    s.hline(4, 14, 17, "#a81f15")
    s.outline()
    s.rect(4, 46, 11, 46, INK)
    return s


def volantin():
    s = S(16, 32)
    # diamond kite, two halves, hanging on the wall with a tail
    for i in range(6):
        s.hline(7 - i, 8 + i, 9 + i, CL_RED if i < 3 else CL_RED)
    for i in range(6):
        s.hline(2 + i, 13 - i, 15 + i, CL_BLUE)
    for y in range(9, 21):
        for x in range(8, 16):
            if s.filled(x, y):
                s.px(x, y, CL_WHITE if y < 15 else CL_RED)
    s.outline()
    s.vline(7, 10, 19, "#6e4a30")
    s.hline(3, 12, 14, "#6e4a30")
    for i, y in enumerate(range(21, 30)):
        s.px(7 + (1 if i % 4 in (1, 2) else 0), y, "#4a3a2e")
    s.px(7, 25, CL_RED); s.px(8, 28, CL_BLUE)
    return s


def empanadas():
    s = S(16, 16)
    s.rect(1, 6, 14, 7, "#c9a46a")      # basket
    s.rect(2, 8, 13, 9, "#a5793f")
    s.hline(3, 12, 9, "#8a6232")
    emp = ["..pppp..", ".pPPPPp.", "pPPPPPPp", "dddddddd"]
    s.rows(1, 2, emp, {"p": "#e0a54e", "P": "#f0c470", "d": "#b5762f"})
    s.rows(7, 3, emp, {"p": "#e0a54e", "P": "#f0c470", "d": "#b5762f"})
    s.outline()
    for x in (3, 5, 9, 11):
        s.px(x, 4, "#b5762f")
    return s


def tree():
    s = S(32, 48)
    greens = ["#2f7a3a", "#3a8f45", "#256330"]
    tiers = [(6, 13, 2), (11, 21, 4), (17, 30, 6), (24, 38, 8)]  # (top, bottom, half-width at top)
    for top, bot, hw in tiers:
        for y in range(top, bot + 1):
            w = hw + (y - top) * (14 - hw) // max(1, (bot - top + 4))
            w = min(w, 13)
            s.hline(16 - w, 15 + w, y, greens[0])
            s.hline(16 - w, 16 - w + 1, y, greens[2])
            s.hline(15 + w - 1, 15 + w, y, greens[1])
    s.rect(14, 39, 17, 41, "#6e4a30")    # trunk
    s.rect(11, 42, 20, 46, "#b8323a")    # pot
    s.hline(11, 20, 42, "#d84a52")
    s.outline()
    s.rect(11, 47, 20, 47, INK)
    # star and ornaments
    star = ["..y..", "yyyyy", ".yyy.", ".y.y."]
    s.rows(14, 1, star, {"y": "#ffd84a"})
    orn = [(13, 12, "#e84a4a"), (18, 15, "#ffd84a"), (12, 19, "#4aa8ff"), (19, 22, "#e84a4a"),
           (15, 25, "#ffd84a"), (10, 29, "#e84a4a"), (21, 30, "#4aa8ff"), (16, 33, "#e84a4a"),
           (9, 36, "#ffd84a"), (22, 36, "#ffd84a"), (13, 37, "#4aa8ff")]
    for x, y, c in orn:
        s.px(x, y, c)
    # tinsel
    for x in range(10, 23):
        s.px(x, 20 + (x - 10) // 3, "#e6e0c8") if x % 2 == 0 else None
    for x in range(8, 25):
        s.px(x, 34 - (x - 8) // 4, "#e6e0c8") if x % 2 == 1 else None
    return s


def gifts():
    s = S(16, 16)
    s.rect(1, 8, 7, 14, "#c8323a"); s.vline(4, 8, 14, "#ffd84a"); s.hline(1, 7, 10, "#ffd84a")
    s.rect(8, 5, 14, 14, "#2f6fbf"); s.vline(11, 5, 14, "#f4f4f4"); s.hline(8, 8, 14, "#f4f4f4")
    s.hline(9, 13, 9, "#f4f4f4")
    s.outline()
    s.px(3, 7, "#ffd84a"); s.px(5, 7, "#ffd84a"); s.px(10, 4, "#f4f4f4"); s.px(12, 4, "#f4f4f4")
    return s


def garland(bulbs):
    s = S(16, 32)
    g1, g2 = "#2f7a3a", "#3f9a4a"
    sag = [0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 1, 1, 1, 0, 0, 0]
    for x in range(16):
        y = 6 + sag[x]
        s.px(x, y, g1); s.px(x, y + 1, g2 if x % 2 else g1); s.px(x, y + 2, g1 if x % 3 else g2)
    for x, c in zip((3, 8, 13), bulbs):
        y = 6 + sag[x] + 3
        s.px(x, y, c); s.px(x, y + 1, c)
    s.outline((30, 70, 40, 255))
    return s


# ---------------------------------------------------------------- seasons of the year
LEAF = ["#d9622b", "#e8a23a", "#b8402a", "#c98a2e"]


def leaf_garland(shift):
    s = S(16, 32)
    sag = [0, 0, 1, 1, 2, 2, 2, 3, 3, 2, 2, 2, 1, 1, 0, 0]
    for x in range(16):
        s.px(x, 7 + sag[x], "#6e4a30")
    for i, x in enumerate((2, 7, 12)):
        c = LEAF[(i + shift) % len(LEAF)]
        y = 8 + sag[x]
        s.rows(x - 1, y, [".c.", "ccc", "ccc", ".c."], {"c": c})
        s.px(x, y + 4, "#6e4a30")
    s.outline()
    return s


def leaf_pile(seed):
    s = S(16, 16)
    pile = ["......aabb......", "...abbaacaab....", "..accbbaabcca...", ".abbaacbbaacbb..", "aacbbaaccbbaacba"]
    pal = {k: LEAF[(i + seed) % len(LEAF)] for i, k in enumerate("abc")}
    s.rows(0, 10, pile, pal)
    s.outline()
    s.px(4 + seed % 3, 9, LEAF[seed % 4]); s.px(11 - seed % 2, 8, LEAF[(seed + 1) % 4])
    return s


def umbrella_stand():
    s = S(16, 32)
    s.rect(4, 20, 11, 30, "#4a5a6e")          # stand
    s.hline(4, 11, 20, "#6a7c92")
    s.vline(5, 21, 30, "#5a6c82")
    for x, top, c in ((5, 9, "#2f6fbf"), (8, 6, "#c8323a"), (10, 11, "#2f7a3a")):
        s.vline(x, top + 4, 21, "#3a3a44")        # shafts
        s.rect(x - 1, top, x + 1, top + 5, c)     # folded canopies
        s.px(x, top - 1, "#3a3a44")
    s.outline()
    s.rect(7, 18, 8, 19, "#3a3a44")
    return s


def snowflake():
    s = S(16, 32)
    w = "#f4f8ff"
    cx, cy = 8, 12
    for d in range(-4, 5):
        s.px(cx + d, cy, w); s.px(cx, cy + d, w)
        if abs(d) <= 3:
            s.px(cx + d, cy + d, w); s.px(cx + d, cy - d, w)
    for dx, dy in ((-4, -1), (-4, 1), (4, -1), (4, 1), (-1, -4), (1, -4), (-1, 4), (1, 4)):
        s.px(cx + dx, cy + dy, w)
    s.outline((150, 170, 200, 255))
    s.vline(cx, 1, cy - 6, "#c9cbe0")             # thread from the top
    return s


def heater(on):
    s = S(16, 16)
    s.rect(2, 4, 13, 14, "#6a6f78")
    s.hline(2, 13, 4, "#8a909a")
    s.rect(3, 6, 12, 12, "#3a3a44")
    for y in (7, 9, 11):
        s.hline(4, 11, y, "#ff7a2a" if on else "#d8501e")
    if on:
        s.hline(5, 10, 9, "#ffd84a")
    s.rect(3, 15, 4, 15, "#4a4a52"); s.rect(11, 15, 12, 15, "#4a4a52")
    s.outline()
    return s


def coat_rack():
    s = S(16, 32)
    s.vline(7, 6, 28, "#6e4a30"); s.vline(8, 6, 28, "#8a5c38")
    s.rect(4, 29, 11, 30, "#5a3c26")
    s.px(5, 7, "#6e4a30"); s.px(10, 7, "#6e4a30"); s.px(6, 8, "#6e4a30"); s.px(9, 8, "#6e4a30")
    s.rect(9, 9, 13, 18, "#7a3a5a"); s.hline(9, 13, 9, "#9a4a72")          # coat
    s.rect(3, 9, 5, 16, "#c8323a"); s.px(4, 17, "#c8323a"); s.px(3, 17, "#e8e8e8")  # scarf
    s.outline()
    return s


FLOWERS = ["#e85a8a", "#ffd84a", "#f4f4f4", "#b06ad8", "#ff8a3a"]


def flower_garland(shift):
    s = S(16, 32)
    sag = [0, 0, 1, 1, 2, 2, 2, 3, 3, 2, 2, 2, 1, 1, 0, 0]
    for x in range(16):
        s.px(x, 7 + sag[x], "#3f9a4a")
    for i, x in enumerate((2, 7, 12)):
        c = FLOWERS[(i + shift) % len(FLOWERS)]
        y = 8 + sag[x]
        s.rows(x - 1, y, [".c.", "cyc", ".c."], {"c": c, "y": "#ffd84a" if c != "#ffd84a" else "#ff8a3a"})
    s.outline((40, 90, 50, 255))
    return s


def tulips(seed):
    s = S(16, 16)
    s.rect(4, 11, 11, 15, "#b8643a"); s.hline(3, 12, 11, "#d07a4a")
    for i, x in enumerate((5, 8, 11)):
        c = FLOWERS[(i + seed) % len(FLOWERS)]
        top = 3 + (i + seed) % 2
        s.vline(x, top + 3, 10, "#3f9a4a")
        s.rows(x - 1, top, ["c.c", "ccc", ".c."], {"c": c})
    s.px(6, 8, "#3f9a4a"); s.px(10, 7, "#3f9a4a")
    s.outline()
    return s


def butterflies():
    s = S(16, 32)
    b = ["w.w", "www", "w.w"]
    s.rows(2, 9, b, {"w": "#ff8a3a"}); s.px(3, 10, INK)
    s.rows(10, 15, b, {"w": "#4aa8ff"}); s.px(11, 16, INK)
    s.rows(5, 20, b, {"w": "#e85a8a"}); s.px(6, 21, INK)
    return s


def sun():
    s = S(16, 32)
    y = "#ffd84a"
    s.rect(5, 9, 10, 14, y); s.hline(6, 9, 8, y); s.hline(6, 9, 15, y); s.vline(4, 10, 13, y); s.vline(11, 10, 13, y)
    for x, yy in ((7, 5), (8, 5), (7, 18), (8, 18), (1, 11), (1, 12), (14, 11), (14, 12), (3, 7), (12, 7), (3, 16), (12, 16)):
        s.px(x, yy, "#ffb02a")
    s.outline((200, 130, 30, 255))
    s.px(6, 11, INK); s.px(9, 11, INK); s.hline(6, 9, 13, "#e8731e")
    return s


def fan(frame):
    s = S(16, 32)
    s.rect(5, 29, 10, 30, "#5a5f68"); s.vline(7, 18, 28, "#8a909a"); s.vline(8, 18, 28, "#6a6f78")
    s.rect(2, 6, 13, 17, "#cfd6de")                 # guard
    s.rect(3, 7, 12, 16, "#eef2f6")
    blades = [[(7, 8), (8, 8), (7, 9), (8, 9), (7, 10), (8, 15), (7, 15), (8, 14), (4, 11), (4, 12), (5, 12), (11, 11), (11, 12), (10, 11)],
              [(4, 8), (5, 9), (6, 10), (11, 15), (10, 14), (9, 13), (11, 8), (10, 9), (4, 15), (5, 14), (6, 13), (5, 8), (10, 15)]][frame]
    for x, yy in blades:
        s.px(x, yy, "#4aa8ff")
    s.rect(7, 11, 8, 12, "#2f6fbf")
    s.outline()
    return s


def beach_ball():
    s = S(16, 16)
    ball = ["....rrww....", "..rrrwwwyy..", ".rrrrwwwyyy.", ".rrrwwwwyyy.", "bbbbwwwwyyyy", "bbbbwwwwyyyy",
            ".bbbwwwwggg.", ".bbbbwwwggg.", "..bbbwwgg...", "....bwwg...."]
    s.rows(2, 5, ball, {"r": "#e84a4a", "w": "#f4f4f4", "y": "#ffd84a", "b": "#2f6fbf", "g": "#3f9a4a"})
    s.outline()
    return s


def main():
    for i in range(3):
        tv(i).save(f"breakroom/TV_{i + 1}.png")
    floor_lamp().save("themes/cozy/FLOOR_LAMP.png")
    espresso().save("themes/cafe/ESPRESSO.png")
    pastry_counter().save("themes/cafe/PASTRY_COUNTER.png")
    cafe_table().save("themes/cafe/CAFE_TABLE.png")
    menu_board().save("themes/cafe/MENU_BOARD.png")
    rack([0, 2, 4]).save("themes/servers/RACK_A_1.png")
    rack([1, 3, 5]).save("themes/servers/RACK_A_2.png")
    rack([0, 1, 5]).save("themes/servers/RACK_B_1.png")
    rack([2, 3]).save("themes/servers/RACK_B_2.png")
    tall_bookshelf(5).save("themes/library/TALL_BOOKSHELF.png")
    tall_bookshelf(31).save("themes/library/TALL_BOOKSHELF_2.png")
    pumpkin(True).save("seasons/halloween/JACK_O_LANTERN.png")
    pumpkin(False).save("seasons/halloween/PUMPKIN.png")
    ghost().save("seasons/halloween/GHOST.png")
    bats().save("seasons/halloween/BATS.png")
    cobweb().save("seasons/halloween/COBWEB.png")
    mirrored(cobweb()).save("seasons/halloween/COBWEB_RIGHT.png")
    bunting([CL_RED, CL_WHITE]).save("seasons/fiestas-patrias/BUNTING_1.png")
    bunting([CL_BLUE, CL_RED]).save("seasons/fiestas-patrias/BUNTING_2.png")
    bunting([CL_WHITE, CL_BLUE]).save("seasons/fiestas-patrias/BUNTING_3.png")
    flag_cl().save("seasons/fiestas-patrias/FLAG.png")
    volantin().save("seasons/fiestas-patrias/VOLANTIN.png")
    empanadas().save("seasons/fiestas-patrias/EMPANADAS.png")
    tree().save("seasons/christmas/TREE.png")
    gifts().save("seasons/christmas/GIFTS.png")
    garland(["#e84a4a", "#ffd84a", "#4aa8ff"]).save("seasons/christmas/GARLAND_1.png")
    garland(["#ffd84a", "#4aa8ff", "#e84a4a"]).save("seasons/christmas/GARLAND_2.png")
    leaf_garland(0).save("seasons/autumn/LEAF_GARLAND_1.png")
    leaf_garland(1).save("seasons/autumn/LEAF_GARLAND_2.png")
    leaf_pile(0).save("seasons/autumn/LEAF_PILE_1.png")
    leaf_pile(1).save("seasons/autumn/LEAF_PILE_2.png")
    umbrella_stand().save("seasons/autumn/UMBRELLA_STAND.png")
    snowflake().save("seasons/winter/SNOWFLAKE.png")
    heater(True).save("seasons/winter/HEATER_1.png")
    heater(False).save("seasons/winter/HEATER_2.png")
    coat_rack().save("seasons/winter/COAT_RACK.png")
    umbrella_stand().save("seasons/winter/UMBRELLA_STAND.png")
    flower_garland(0).save("seasons/spring/FLOWER_GARLAND_1.png")
    flower_garland(2).save("seasons/spring/FLOWER_GARLAND_2.png")
    tulips(0).save("seasons/spring/TULIPS_1.png")
    tulips(2).save("seasons/spring/TULIPS_2.png")
    butterflies().save("seasons/spring/BUTTERFLIES.png")
    sun().save("seasons/summer/SUN.png")
    fan(0).save("seasons/summer/FAN_1.png")
    fan(1).save("seasons/summer/FAN_2.png")
    beach_ball().save("seasons/summer/BEACH_BALL.png")


if __name__ == "__main__":
    main()
