#!/usr/bin/env python3
"""Draw the app icons the web app manifest names, from the Recursive Dragon's sprite.

    python tools/pwa_icons.py

Writes icons/ (committed): what a browser shows when the game is installed as an app,
on a home screen, in a dock, on a splash screen and in a tab.

    icon-192.png, icon-512.png   "any": a dark tile framed in the game's green
    icon-maskable-512.png        "maskable": no frame, the dragon inside the safe
                                 circle, since Android crops this one to its own shape
    apple-touch-icon.png         180px, for iOS, which rounds the corners itself
    favicon-32.png               the browser tab

The dragon is the standing pose (the first frame) of images/sprites/recursion_wyrm.webp,
the Recursion Wyrm, which is how the end-of-set boss is drawn (it is marked "boss" in
assets/monsters.json). The sprite is about 160px tall, so for the large icons
it is first enlarged by a whole number with nearest-neighbour (each pixel becomes a
block, as pixel art should) and then brought to its final size with Lanczos, which keeps
edges clean where a direct resize would blur them.

Needs Pillow, as the sprite tools do. Run it again only if the sprite or the look changes.
"""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

REPO = Path(__file__).resolve().parent.parent
SPRITE = REPO / "images" / "sprites" / "recursion_wyrm.webp"
OUT = REPO / "icons"

BACKGROUND = (3, 9, 3, 255)      # body background, #030903
FRAME = (0, 200, 64, 255)        # .bbs-container border, #00c840
POSES = 3                        # stand, attack, recoil


def dragon() -> Image.Image:
    """The standing pose, cropped to the dragon itself."""
    strip = Image.open(SPRITE).convert("RGBA")
    width = strip.width // POSES
    pose = strip.crop((0, 0, width, strip.height))
    return pose.crop(pose.getbbox())


def scaled(art: Image.Image, box: int) -> Image.Image:
    """The art, as large as fits a box x box square, keeping its proportions."""
    target = box / max(art.size)
    if target > 1:
        factor = math.ceil(target)
        art = art.resize((art.width * factor, art.height * factor), Image.NEAREST)
        target = box / max(art.size)
    size = (max(1, round(art.width * target)), max(1, round(art.height * target)))
    return art.resize(size, Image.LANCZOS)


def tile(size: int, art_share: float, frame: bool) -> Image.Image:
    """A size x size icon: the dark background, the dragon centred in art_share of it."""
    icon = Image.new("RGBA", (size, size), BACKGROUND)
    if frame:
        draw = ImageDraw.Draw(icon)
        inset = round(size * 0.06)
        width = max(2, round(size * 0.025))
        draw.rounded_rectangle((inset, inset, size - 1 - inset, size - 1 - inset),
                               radius=round(size * 0.12), outline=FRAME, width=width)
    art = scaled(dragon(), round(size * art_share))
    icon.alpha_composite(art, ((size - art.width) // 2, (size - art.height) // 2))
    return icon.convert("RGB")


def main() -> None:
    OUT.mkdir(exist_ok=True)
    icons = {
        "icon-192.png": tile(192, 0.66, frame=True),
        "icon-512.png": tile(512, 0.66, frame=True),
        # A maskable icon may be cut to a circle 80% of its width: a box 0.56 of the
        # width has a diagonal of 0.79, so the whole dragon stays inside.
        "icon-maskable-512.png": tile(512, 0.56, frame=False),
        "apple-touch-icon.png": tile(180, 0.72, frame=False),
        "favicon-32.png": tile(32, 0.9, frame=False),
    }
    for name, image in icons.items():
        image.save(OUT / name, optimize=True)
        print(f"icons/{name}  {image.width}x{image.height}  {(OUT / name).stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
