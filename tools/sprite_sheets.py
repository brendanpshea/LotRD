#!/usr/bin/env python3
"""Cut the generated sprite sheets into one strip per character.

    python tools/sprite_sheets.py                  # every sheet in images/sprites/sheets/
    python tools/sprite_sheets.py 03-monsters ...  # just these

A sheet (see tools/sprite_prompts.py) is a grid on a flat magenta background: one
character per row, in three poses per row (stand, attack, recoil). For each row this
writes images/sprites/<id>.webp, the three poses side by side in equal frames, so a
stage can show one pose by sliding the strip, and switching poses never waits on a
download.

The background is keyed out by its own colour, read off the sheet's border, since a
generator's "magenta" drifts (one came back a dusty rose). Anything strongly magenta
goes too, which takes the soft fringe and any floor shadow with it; what is left of
the tint on an edge is pulled back to neutral. Pieces that float free of a character
and are small next to it (speed lines, dizzy stars, loose leaves) are dropped.

Poses are lined up on the character, not on the grid: every frame has the same size,
the feet on its bottom edge, and the weight of the figure at its middle, so swapping
poses doesn't make the character jump. Each character is scaled so its tallest pose
is FRAME_HEIGHT pixels.

A monster's strip is named for its image in assets/monsters.json (goblin.png ->
goblin.webp), and its entry there gets "sprite" pointing at the strip, which is
what makes the game draw it on the battle stage instead of the old picture.

Needs Pillow, NumPy and SciPy, which only whoever processes sheets needs.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

REPO = Path(__file__).resolve().parent.parent
SPRITES = REPO / "images" / "sprites"
SHEETS = SPRITES / "sheets"
ROSTER = SPRITES / "roster.json"
MONSTERS = REPO / "assets" / "monsters.json"
SHEET_TYPES = (".png", ".jpg", ".jpeg", ".webp")

FRAME_HEIGHT = 160      # px: the tallest pose, after scaling
POSES = 3               # stand, attack, recoil
NEAR_BACKGROUND = 70    # RGB distance under which a pixel is background
MAGENTA_SHARE = 0.4     # a pixel this magenta, relative to the background, is background
SPECK = 0.02            # a loose piece smaller than this share of its cell's largest goes
PAD = 4                 # px of clear space around the figure in each frame, after scaling


def background_colour(rgb: np.ndarray) -> np.ndarray:
    """The median colour of a band around the sheet's edge."""
    band = np.concatenate([rgb[:12].reshape(-1, 3), rgb[-12:].reshape(-1, 3),
                           rgb[:, :12].reshape(-1, 3), rgb[:, -12:].reshape(-1, 3)])
    return np.median(band, axis=0)


def magenta(rgb: np.ndarray) -> np.ndarray:
    """How far red and blue both stand above green: 0 for greys, high for magenta."""
    return np.minimum(rgb[..., 0], rgb[..., 2]) - rgb[..., 1]


def key(rgb: np.ndarray) -> np.ndarray:
    """True where the sheet shows a character rather than background."""
    bg = background_colour(rgb)
    near = np.linalg.norm(rgb - bg, axis=-1) < NEAR_BACKGROUND
    tinted = magenta(rgb) > MAGENTA_SHARE * max(magenta(bg[None, None])[0, 0], 1.0)
    return ~(near | tinted)


def despill(rgb: np.ndarray) -> np.ndarray:
    """Pull any leftover magenta tint on an edge back to neutral."""
    spill = np.clip(magenta(rgb), 0, None)[..., None]
    out = rgb.copy()
    out[..., [0, 2]] -= spill
    return np.clip(out, 0, 255)


def figures(mask: np.ndarray, rows: int) -> list[list[np.ndarray]]:
    """Each cell's figure as a mask over the whole sheet, [row][pose].

    Pieces are given to the cell their centre falls in, so a weapon reaching across
    a cell's edge stays with its owner instead of being cut off at the line.
    """
    labels, count = ndimage.label(mask, structure=np.ones((3, 3)))
    if count == 0:
        return [[np.zeros_like(mask)] * POSES for _ in range(rows)]
    index = np.arange(1, count + 1)
    areas = ndimage.sum(mask, labels, index)
    centres = ndimage.center_of_mass(mask, labels, index)
    h, w = mask.shape
    cells: dict[tuple[int, int], list[int]] = {}
    for label, (cy, cx) in zip(index, centres):
        cell = (min(int(cy / h * rows), rows - 1), min(int(cx / w * POSES), POSES - 1))
        cells.setdefault(cell, []).append(label)
    out = []
    for r in range(rows):
        row = []
        for p in range(POSES):
            members = cells.get((r, p), [])
            biggest = max((areas[m - 1] for m in members), default=0)
            keep = [m for m in members if areas[m - 1] >= SPECK * biggest]
            row.append(np.isin(labels, keep))
        out.append(row)
    return out


def strip(rgb: np.ndarray, poses: list[np.ndarray]) -> Image.Image:
    """One character's poses side by side, lined up on the figure."""
    boxes, anchors = [], []
    for m in poses:
        ys, xs = np.nonzero(m)
        if len(ys) == 0:
            raise ValueError("a pose came out empty")
        boxes.append((ys.min(), ys.max() + 1, xs.min(), xs.max() + 1))
        anchors.append(xs.mean())
    height = max(b[1] - b[0] for b in boxes)
    half = max(max(a - b[2], b[3] - a) for a, b in zip(anchors, boxes))
    width = int(np.ceil(2 * half)) + 2      # + rounding room on both sides

    colour = despill(rgb)
    frames = []
    for m, (top, bottom, left, right), a in zip(poses, boxes, anchors):
        frame = np.zeros((height, width, 4), dtype=np.uint8)
        x0 = int(round(width / 2 - a)) + left
        y0 = height - (bottom - top)
        frame[y0:y0 + bottom - top, x0:x0 + right - left, :3] = colour[top:bottom, left:right]
        frame[y0:y0 + bottom - top, x0:x0 + right - left, 3] = m[top:bottom, left:right] * 255
        frames.append(frame)

    scale = (FRAME_HEIGHT - 2 * PAD) / height
    size = (max(1, round(width * scale)), FRAME_HEIGHT - 2 * PAD)
    fw, fh = size[0] + 2 * PAD, FRAME_HEIGHT
    out = Image.new("RGBA", (fw * POSES, fh), (0, 0, 0, 0))
    for i, frame in enumerate(frames):
        # Premultiplied, so the transparent pixels' colour doesn't bleed into the edges.
        small = Image.fromarray(frame, "RGBA").convert("RGBa").resize(size, Image.LANCZOS).convert("RGBA")
        out.paste(small, (i * fw + PAD, PAD))
    return out


def sheet_file(name: str) -> Path | None:
    for ext in SHEET_TYPES:
        if (SHEETS / f"{name}{ext}").exists():
            return SHEETS / f"{name}{ext}"
    return None


def process(batch: dict) -> list[Path]:
    path = sheet_file(batch["sheet"])
    rgb = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    characters = batch["characters"]
    written = []
    for c, poses in zip(characters, figures(key(rgb), len(characters))):
        out = SPRITES / f"{c['id']}.webp"
        # Lossy at this quality is a third the size of lossless, and looks the same.
        strip(rgb, poses).save(out, "WEBP", quality=92, alpha_quality=100, method=6)
        written.append(out)
    return written


def link_monsters(written: list[Path]) -> None:
    """Point each monster that now has a strip at it, in assets/monsters.json."""
    raw = MONSTERS.read_bytes().decode("utf-8")    # as-is: keep its line endings
    newline = "\r\n" if "\r\n" in raw else "\n"
    monsters = json.loads(raw)
    strips = {p.stem: p.name for p in written}
    changed = False
    for m in monsters:
        sprite = strips.get(Path(m["image"]).stem)
        if sprite and m.get("sprite") != sprite:
            m["sprite"] = sprite
            changed = True
    if changed:
        text = json.dumps(monsters, indent=4, ensure_ascii=False) + "\n"
        MONSTERS.write_text(text.replace("\n", newline), encoding="utf-8", newline="")


def main(names: list[str]) -> int:
    roster = json.loads(ROSTER.read_text(encoding="utf-8"))
    batches = [b for b in roster["batches"] if not names or b["sheet"] in names]
    unknown = set(names) - {b["sheet"] for b in batches}
    if unknown:
        print(f"no such sheet in the roster: {', '.join(sorted(unknown))}")
        return 1
    written = []
    for batch in batches:
        if not sheet_file(batch["sheet"]):
            if names:
                print(f"{batch['sheet']}: no image in {SHEETS.relative_to(REPO)}")
            continue
        for out in process(batch):
            print(f"{batch['sheet']}: wrote {out.relative_to(REPO)} ({out.stat().st_size // 1024} KB)")
            written.append(out)
    link_monsters(written)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
