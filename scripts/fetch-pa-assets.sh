#!/bin/sh
# Copies the Pixel Agents art deskmates uses, pinned to one commit, into assets/pixel-agents/.
# Pixel Agents is MIT licensed (c) 2026 Pablo De Lucca; its LICENSE is copied alongside.
set -eu
REPO=pixel-agents-hq/pixel-agents
SHA=d1e007a9fdf3003c252d2973abe1999ae59aec33
SRC=webview-ui/public/assets
DEST="$(dirname "$0")/../assets/pixel-agents"
RAW="https://raw.githubusercontent.com/$REPO/$SHA"
FILES="
characters/char_0.png characters/char_1.png characters/char_2.png
characters/char_3.png characters/char_4.png characters/char_5.png
floors/floor_0.png floors/floor_1.png floors/floor_2.png floors/floor_3.png floors/floor_4.png
floors/floor_5.png floors/floor_6.png floors/floor_7.png floors/floor_8.png
walls/wall_0.png carpets/carpet_0.png carpets/carpet_1.png carpets/carpet_2.png
"
FURNITURE="BIN BOOKSHELF CACTUS CLOCK COFFEE COFFEE_TABLE CUSHIONED_BENCH CUSHIONED_CHAIR DESK DOUBLE_BOOKSHELF HANGING_PLANT LARGE_PAINTING LARGE_PLANT PC PLANT PLANT_2 POT SMALL_PAINTING SMALL_PAINTING_2 SMALL_TABLE SOFA TABLE_FRONT WHITEBOARD WOODEN_BENCH WOODEN_CHAIR"
PETS="claudio gitcat"

rm -rf "$DEST"; mkdir -p "$DEST"
curl -fsSL "$RAW/LICENSE" -o "$DEST/LICENSE"
for f in $FILES; do mkdir -p "$DEST/$(dirname "$f")"; curl -fsSL "$RAW/$SRC/$f" -o "$DEST/$f"; done
for d in $FURNITURE; do
  mkdir -p "$DEST/furniture/$d"
  for f in $(curl -fsSL "https://api.github.com/repos/$REPO/contents/$SRC/furniture/$d?ref=$SHA" | grep '"name"' | sed 's/.*"name": "\(.*\)".*/\1/'); do
    curl -fsSL "$RAW/$SRC/furniture/$d/$f" -o "$DEST/furniture/$d/$f"
  done
done
for d in $PETS; do
  mkdir -p "$DEST/pets/$d"
  for f in $(curl -fsSL "https://api.github.com/repos/$REPO/contents/$SRC/pets/$d?ref=$SHA" | grep '"name"' | sed 's/.*"name": "\(.*\)".*/\1/'); do
    curl -fsSL "$RAW/$SRC/pets/$d/$f" -o "$DEST/pets/$d/$f"
  done
done
echo "$SHA" > "$DEST/COMMIT"
echo "Copied Pixel Agents assets at $SHA into $DEST"
