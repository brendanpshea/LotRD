#!/usr/bin/env python3
"""Write images/sprites/prompts.md: one image-generator prompt per sprite sheet.

    python tools/sprite_prompts.py

A sheet is a grid of up to three characters (the rows), each in three poses (the
columns: stand, attack, recoil). The characters come from images/sprites/roster.json.
The style, layout and background rules are written once here, so every prompt asks
for the same thing and a change to the house style is one edit. prompts.md is
rebuilt from these two files, so edit them rather than it.

The background is flat magenta so it can be keyed out, which is why no character
may use magenta, pink or purple: a generator drifts those toward the background.
Everything is drawn facing right; the game mirrors a monster to face the hero.

A sheet counts as done once its image is in images/sprites/sheets/, under the
sheet's name with any of the extensions in SHEET_TYPES.
"""
from __future__ import annotations

import json
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SPRITES = REPO / "images" / "sprites"
SHEETS = SPRITES / "sheets"
ROSTER = SPRITES / "roster.json"
OUT = SPRITES / "prompts.md"
MONSTERS = REPO / "assets" / "monsters.json"

BACKGROUND = "#FF00FF"
SHEET_TYPES = (".png", ".jpg", ".jpeg", ".webp")

STYLE = (
    "Style: 16-bit pixel art like SNES-era JRPG battle sprites. Chibi proportions: "
    "big heads, small bodies, expressive faces and oversized weapons. A thick, dark "
    "outline around every character, flat cel shading with few colors, and high "
    "contrast, so each sprite still reads when shrunk to 96 pixels tall."
)

RULES = [
    "Each character looks identical in all three of its poses: same colors, outfit, "
    "proportions and weapon. Only the pose changes.",
    "Each row is a different character. Don't let their colors or features blend.",
    "Each sprite is centered in its own cell with clear magenta space all around it. "
    "Nothing crosses into a neighboring cell.",
    "In each row, the three sprites are the same size and stand on the same baseline.",
    "No magenta, pink or purple anywhere on the characters.",
    "No text, labels, numbers, grid lines, borders, shadows, motion lines, or effects "
    "that float free of the character.",
]

HEADER = """\
# Sprite sheet prompts

> Built by `tools/sprite_prompts.py` from `roster.json`. Edit those and rerun it;
> changes made here are overwritten.

Each prompt makes one sheet: up to three characters (rows) in three poses
(columns: stand, attack, recoil) on flat magenta, which gets keyed out later.
Everything faces right; the game mirrors monsters so they face the hero.

1. Paste one prompt into the image generator and ask for the aspect ratio it names.
2. Save the result as `images/sprites/sheets/<name>.png` (or .jpg/.webp), using the
   name in the prompt's heading. Saving it there marks the sheet done below.
3. Regenerate if a character changes between its poses, a sprite crosses into
   another cell, or pink shows up on a character.
"""


def sheet_file(name: str) -> Path | None:
    """The generated image for a sheet, if it has been saved."""
    for ext in SHEET_TYPES:
        if (SHEETS / f"{name}{ext}").exists():
            return SHEETS / f"{name}{ext}"
    return None


def prompt(batch: dict) -> str:
    rows = len(batch["characters"])
    shape = "A square sprite sheet" if rows == 3 else f"A wide sprite sheet (3:{rows})"
    lines = [
        f"{shape}: {rows} row{'s' if rows > 1 else ''} by 3 columns of chibi JRPG battle "
        f"sprites on one flat, solid magenta ({BACKGROUND}) background. No gradient, floor, "
        f"shadows or texture anywhere in the background.",
        "",
        "Each row is one character, drawn three times. Every character faces RIGHT, "
        "toward an unseen opponent, in a side three-quarter view. The columns are the "
        "same three poses in every row:",
        "1. STAND: idle battle stance, weapon ready.",
        "2. ATTACK: lunging to the right mid-strike, weapon fully extended toward the "
        "opponent, body leaning into the blow.",
        "3. RECOIL: knocked back to the left, leaning away from the opponent, eyes "
        "squeezed shut, weapon held loosely.",
        "",
    ]
    for row, c in enumerate(batch["characters"], 1):
        lines.append(f"Row {row}, {c['name']}: {c['look']} Attack: {c['attack']} Recoil: {c['recoil']}")
    lines += ["", STYLE, "", "Rules:"]
    lines += [f"- {rule}" for rule in RULES]
    return "\n".join(lines)


def still_to_write(roster: dict) -> list[str]:
    """Monsters in the game that no sheet covers yet, lowest level first."""
    drawn = {c["id"] for b in roster["batches"] for c in b["characters"]}
    monsters = json.loads(MONSTERS.read_text(encoding="utf-8"))
    left = [m for m in monsters if Path(m["image"]).stem not in drawn]
    left.sort(key=lambda m: m["hit_dice"])
    return [f"- Level {m['hit_dice']}: {m['monster_name']} (`{Path(m['image']).stem}`)" for m in left]


def main() -> None:
    roster = json.loads(ROSTER.read_text(encoding="utf-8"))
    batches = roster["batches"]
    done = [b for b in batches if sheet_file(b["sheet"])]

    parts = [HEADER]
    recolored = [c["name"] for b in batches for c in b["characters"] if c.get("recolored")]
    if recolored:
        parts.append(f"Redrawn in new colors so the background keys out cleanly: {', '.join(recolored)}.\n")
    parts.append(f"**Done: {len(done)} of {len(batches)} sheets.**\n")
    parts.append("| Sheet | Characters | Status |\n| --- | --- | --- |")
    parts.append("\n".join(
        f"| {b['sheet']} | {', '.join(c['name'] for c in b['characters'])} | "
        f"{'✅ done' if sheet_file(b['sheet']) else 'to do'} |"
        for b in batches) + "\n")

    for batch in batches:
        names = ", ".join(c["name"] for c in batch["characters"])
        status = " ✅ done" if sheet_file(batch["sheet"]) else ""
        parts.append(f"## {batch['sheet']}: {names}{status}\n\n```text\n{prompt(batch)}\n```\n")
    remaining = still_to_write(roster)
    if remaining:
        parts.append("## Monsters without a sheet yet\n\n" + "\n".join(remaining) + "\n")
    OUT.write_text("\n".join(parts), encoding="utf-8", newline="\n")
    print(f"wrote {OUT.relative_to(REPO)}: {len(done)} of {len(batches)} sheets done")


if __name__ == "__main__":
    main()
