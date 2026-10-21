#!/usr/bin/env python3
"""Makes the deskmates characters from the Pixel Agents ones (MIT; they come from the CC0 Metro City pack).

Each character keeps the body, poses and animation of a Pixel Agents sheet (head that dips while typing and reading,
seated frames the desk hides) and gets a new look: skin, hair and clothes recoloured as ramps that keep the original
shading, plus glasses or a beard drawn into every frame. The cast is an original group of lab friends, archetypes only.

Sheet format: 112x96, 7 frames of 16x32 in 3 rows (down, up, right). Frames 0-2 walk, 3-4 type, 5-6 read.
Run from the repository root:

    python3 scripts/draw-characters.py
"""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / "assets"
SRC = ROOT / "pixel-agents" / "characters"
OUT = ROOT / "characters"

# Which colours of each Pixel Agents sheet are hair, skin, top and bottom (read off the sheets).
PARTS = {
    0: {"hair": "32191d 6d4726 b18649 8f6439 341f20 6f4a2a", "skin": "fbbf97 ffd8b2 c5896e e29878 e9a384 84523a",
        "top": "1164a9 114978 0f406a", "bottom": "071c2e"},
    1: {"hair": "f1c084 e39f5a 7e4b29 be7743", "skin": "ffd8b2 e29878 bd8068 fbbf97 e9a384 c5896e",
        "top": "1a1a1a 252525 2b2b2b 101010"},
    2: {"hair": "2b2827 252120 181616 221e1e 282423 1b1a19", "skin": "5f4132 75503d 593b2c 865e4c 493227",
        "top": "e1721d 741713 a91d18 f67d20 8b1a16 56110e ff8b31 e8741b 592700 e87218", "bottom": "23294d 49557e 111528 343d5a"},
    3: {"hair": "fff1ef e9d7d4 b0a6a3 daccc9 f0e1de bfb6b3", "skin": "ac6847 ffa77c e08d64 b67352 8c583f",
        "top": "bdbdbd eeeeee d4d4d4", "bottom": "796064 ac9082 3c314f d2b48e"},
    4: {"hair": "69451b 57351a 2f160f 432415 442414 421b19", "skin": "e9a384 fbbf97 e29878 c5896e ffd8b2 bd8068",
        "top": "bdbdbd eeeeee d4d4d4", "bottom": "0f406a 071c2e 114978"},
    5: {"hair": "131313 202020 282828 373737 0e0e0e 414141 303030", "skin": "fcd6c4 cf9d86 ffede5 fff6f2 ba917e e1aa91",
        "top": "9f3f31 e16451 b24737 640026", "bottom": "1d1718 332c23 0f0c13 2a2320 594b45"},
}


def rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def lum(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def ramp_map(colours, dark, light):
    """Maps a group of colours onto dark..light by their brightness, so highlights stay highlights."""
    cs = [rgb(c) for c in colours.split()]
    lo, hi = min(map(lum, cs)), max(map(lum, cs))
    d, l = rgb(dark), rgb(light)
    out = {}
    for c in cs:
        t = 0.5 if hi == lo else (lum(c) - lo) / (hi - lo)
        out[c] = tuple(round(d[i] + (l[i] - d[i]) * t) for i in range(3))
    return out


def recolour(im, mapping):
    im = im.copy()
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            p = px[x, y]
            if p[3] and p[:3] in mapping:
                px[x, y] = mapping[p[:3]] + (p[3],)
    return im


def head_top(im, row, f):
    for y in range(32):
        for x in range(16):
            if im.getpixel((f * 16 + x, row * 32 + y))[3]:
                return y
    return 0


def add_glasses(base, im):
    """Pixel Agents puts glasses on to read (frames 5-6): copy them, at the head's height, into every other frame."""
    for row in (0, 2):  # facing down and right; from behind they do not show
        ref, plain = 5, 3
        diff = []
        for y in range(24):
            for x in range(16):
                a = base.getpixel((ref * 16 + x, row * 32 + y))
                if a[3] and a != base.getpixel((plain * 16 + x, row * 32 + y)) and lum(a[:3]) < 90:
                    diff.append((x, y, a))
        top_ref = head_top(base, row, ref)
        for f in range(5):
            dy = head_top(base, row, f) - top_ref
            for x, y, c in diff:
                if 0 <= y + dy < 32:
                    im.putpixel((f * 16 + x, row * 32 + y + dy), c)


def add_beard(base, im, parts, colour):
    """Lower face in the beard colour: the skin below the mouth line, in every frame that shows the face."""
    skin = {rgb(c) for c in parts["skin"].split()}
    b = rgb(colour)
    for row in (0, 2):
        for f in range(7):
            top = head_top(base, row, f)
            for y in range(top + 13, top + 17):
                for x in range(16):
                    p = base.getpixel((f * 16 + x, row * 32 + y))
                    if p[3] and p[:3] in skin and (row == 0 or x >= 8):
                        k = 0.8 if (x + y) % 3 == 0 else 1.0
                        im.putpixel((f * 16 + x, row * 32 + y), tuple(round(v * k) for v in b) + (255,))


def hair_set(parts):
    return {rgb(c) for c in parts["hair"].split()}


def crop_hair(base, im, parts, rows_off, dark):
    """A close crop: hair above the line `rows_off` below the head's top is removed, and the new top edge outlined."""
    hair = hair_set(parts)
    d = rgb(dark) + (255,)
    for row in range(3):
        for f in range(7):
            top = head_top(base, row, f)
            for x in range(16):
                col = [(y, base.getpixel((f * 16 + x, row * 32 + y))) for y in range(32)]
                hair_ys = [y for y, p in col if p[3] and p[:3] in hair]
                if not hair_ys:
                    continue
                for y in hair_ys:
                    if y < top + rows_off:
                        im.putpixel((f * 16 + x, row * 32 + y), (0, 0, 0, 0))
                left = [y for y in hair_ys if y >= top + rows_off]
                if left:
                    im.putpixel((f * 16 + x, row * 32 + min(left)), d)


def add_bun(base, im, colour, dark):
    """A bun on top of the head, in every frame: centred from the front and back, towards the back from the side."""
    c, d = rgb(colour) + (255,), rgb(dark) + (255,)
    shape = [".dddd.", "dcclcd", "dccccd"]  # sits into the hair so it never leaves the 16x32 cell
    for row in range(3):
        for f in range(7):
            top = head_top(base, row, f)
            x0 = 4 if row == 2 else 5
            for dy, line in enumerate(shape):
                for dx, ch in enumerate(line):
                    y = max(0, top - 2) + dy
                    if ch != "." and 0 <= y < 32:
                        px = c if ch == "c" else d if ch == "d" else tuple(min(255, v + 40) for v in c[:3]) + (255,)
                        im.putpixel((f * 16 + x0 + dx, row * 32 + y), px)


# An original group of lab friends. Archetypes only: no names, faces, outfits or logos taken from any show.
#   base: which Pixel Agents body; each part: (dark, light) of its new ramp.
CAST = [
    # 0 the theorist: spiky chestnut hair, light skin, green tee, charcoal trousers
    {"base": 4, "hair": ("4a2610", "b07440"), "skin": ("b07a5a", "f6d2b4"), "top": ("2a6a3a", "7ac88a"), "bottom": ("26262c", "4e4e58")},
    # 1 the experimentalist: messy dark-brown hair, glasses, navy blazer and tie, brown trousers
    {"base": 0, "hair": ("1e120a", "5a3a20"), "skin": ("a87050", "eec09c"), "top": ("1e2a44", "4a6aa0"), "bottom": ("3a2a1c", "6a5038"), "glasses": True},
    # 2 the engineer: ash-blond fringe, olive skin, magenta top, black trousers
    {"base": 5, "hair": ("6a5a3a", "d8c896"), "skin": ("b08a62", "ecd0a8"), "top": ("6a1048", "d84a94"), "bottom": ("141418", "34343c")},
    # 3 the astronomer: close-cropped black hair, brown skin, sky-blue shirt, khaki trousers
    {"base": 4, "crop": 4, "hair": ("0e0a0a", "2e2626"), "skin": ("6a4230", "b98256"), "top": ("2a5a8a", "8ac0ea"), "bottom": ("6a5a3a", "b8a478")},
    # 4 the neighbour: long golden hair, fair skin, coral dress
    {"base": 1, "hair": ("a0642a", "f6d27a"), "skin": ("c48a6e", "fcd8bc"), "top": ("a83a3a", "ff8a72")},
    # 5 the neuroscientist: blue-black hair up in a bun, tan skin, glasses, mustard dress
    {"base": 1, "bun": ("2a2a3a", "0a0a12"), "hair": ("0a0a12", "34344a"), "skin": ("9a6440", "dca478"), "top": ("6a5418", "d8b040"), "glasses": True},
    # 6 the microbiologist: curly copper hair, freckled-fair skin, glasses, white lab top, blue jeans
    {"base": 2, "hair": ("4a1a0e", "c25a2a"), "skin": ("c8906e", "fadcc4"), "top": ("b8c0c8", "f8fafc"), "bottom": ("2a3a5a", "5a7aa8"), "glasses": True},
    # 7 the comic-shop owner: long grey hair and beard, deep-brown skin, black tee, olive cargo trousers
    {"base": 3, "hair": ("6a6a70", "d4d4da"), "skin": ("5a3424", "a06a48"), "top": ("16161a", "3a3a44"), "bottom": ("343a22", "626a40"), "beard": "9a9aa0"},
]


def mapping_for(spec):
    parts = PARTS[spec["base"]]
    mapping = {}
    for part in ("hair", "skin", "top", "bottom"):
        if part in spec and part in parts:
            mapping.update(ramp_map(parts[part], *spec[part]))
    return mapping


def make(spec):
    base = Image.open(SRC / f"char_{spec['base']}.png").convert("RGBA")
    parts = PARTS[spec["base"]]
    mapping = mapping_for(spec)
    im = recolour(base, mapping)
    if spec.get("crop"):
        crop_hair(base, im, parts, spec["crop"], spec["hair"][0])
    if spec.get("bun"):
        add_bun(base, im, *spec["bun"])
    if spec.get("beard"):
        add_beard(base, im, parts, spec["beard"])
    if spec.get("glasses"):
        add_glasses(base, im)
    return im


def present_tops(im, tops):
    """The top colours, in order, that are left in a sheet (glasses or a beard may paint over some)."""
    seen = {p[:3] for _, p in im.getcolors(im.width * im.height) if p[3]}
    return ["#%02x%02x%02x" % c for c in dict.fromkeys(tops) if c in seen]


def write_tops(sheets):
    """tops.json: the shirt colours of every bundled sheet, so the page can recolour the shirt of a PC's agents."""
    tops = {}
    for i, (spec, im) in enumerate(sheets):
        mapping = mapping_for(spec)
        tops[f"dm{i}"] = present_tops(im, [mapping[rgb(c)] for c in PARTS[spec["base"]]["top"].split()])
    for b, parts in PARTS.items():
        im = Image.open(SRC / f"char_{b}.png").convert("RGBA")
        tops[f"pa{b}"] = present_tops(im, [rgb(c) for c in parts["top"].split()])
    (OUT / "tops.json").write_text(json.dumps(tops, indent=1) + "\n")
    print("assets/characters/tops.json")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    sheets = []
    for i, spec in enumerate(CAST):
        im = make(spec)
        im.save(OUT / f"char_{i}.png")
        sheets.append((spec, im))
        print(f"assets/characters/char_{i}.png from Pixel Agents char_{spec['base']}")
    write_tops(sheets)


if __name__ == "__main__":
    main()
