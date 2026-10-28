#!/usr/bin/env python3
"""Draw every diagram written as Graphviz source in a question's figure.

    python tools/render_figures.py           # draw what's new, fill in src, remove unused drawings
    python tools/render_figures.py --check   # change nothing; exit 1 if anything is out of date

A figure can give its picture as Graphviz source instead of a file:

    "figure": {"dot": "digraph { rankdir=LR; laptop -> dock -> monitor }", "alt": "..."}

This script draws it as SVG in the game's colors (tools/figure-style.gv) and saves it
as figures/_dot/<hash>.svg, where the hash comes from the source and the style. Then
it writes "src": "_dot/<hash>.svg" into the figure, so the game, the build, and the
tests treat it like any other picture, and a credit file beside it marking it as the
set's own work. Change the source and the next run draws a new file and removes the
old one. Graphviz (the dot program) is needed only here, by whoever writes a diagram.
"""
from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SETS = REPO / "question_sets"
DRAWN = REPO / "figures" / "_dot"
STYLE = Path(__file__).resolve().parent / "figure-style.gv"


def style_lines() -> list[str]:
    """The style's statements, without comments, the same on every platform."""
    text = STYLE.read_text(encoding="utf-8").replace("\r\n", "\n")
    return [line.strip() for line in text.split("\n") if line.strip() and not line.strip().startswith("//")]


def drawn_name(dot: str, style: list[str]) -> str:
    """figures/_dot/<this>.svg: sha256 of the style and the source, so either change renames it.
    tests/data.test.js computes the same thing."""
    digest = hashlib.sha256(("\n".join(style) + "\n" + dot).encode("utf-8")).hexdigest()
    return f"_dot/{digest[:16]}.svg"


def figures_in(entries: list) -> list[dict]:
    """Every figure in a set: on questions, and on scene beats."""
    found = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        if isinstance(entry.get("figure"), dict):
            found.append(entry["figure"])
        for step in entry.get("steps") or []:
            for beat in step.get("beats") or []:
                if isinstance(beat, dict) and isinstance(beat.get("figure"), dict):
                    found.append(beat["figure"])
    return found


def draw(dot: str, style: list[str], dot_exe: str) -> bytes:
    """The diagram as SVG, with the style added just inside its opening brace."""
    brace = dot.index("{")
    source = dot[:brace + 1] + "\n" + "\n".join(style) + "\n" + dot[brace + 1:]
    done = subprocess.run([dot_exe, "-Tsvg"], input=source.encode("utf-8"), capture_output=True)
    if done.returncode != 0:
        raise SystemExit(f"Graphviz could not draw this diagram:\n{dot}\n\n{done.stderr.decode('utf-8', 'replace')}")
    return done.stdout


def main(argv: list[str]) -> int:
    check = "--check" in argv
    style = style_lines()
    index = json.loads((SETS / "index.json").read_text(encoding="utf-8"))

    wanted: dict[str, str] = {}         # drawn name -> its source
    stale_sets: list[str] = []
    for set_id in index:
        path = SETS / set_id
        entries = json.loads(path.read_text(encoding="utf-8"))
        changed = False
        for figure in figures_in(entries):
            dot = figure.get("dot")
            if not isinstance(dot, str):
                continue
            name = drawn_name(dot, style)
            wanted[name] = dot
            if figure.get("src") != name:
                figure["src"] = name
                changed = True
        if changed:
            stale_sets.append(set_id)
            if not check:
                path.write_bytes((json.dumps(entries, indent=2, ensure_ascii=False) + "\n").encode("utf-8"))

    missing = [name for name in wanted if not (REPO / "figures" / name).exists()]
    unused = sorted(p for p in DRAWN.glob("*") if p.is_file() and f"_dot/{p.stem}.svg" not in wanted) if DRAWN.exists() else []

    if check:
        problems = ([f"{s}: a figure's src doesn't match its dot source" for s in stale_sets]
                    + [f"figures/{n} is not drawn yet" for n in missing]
                    + [f"figures/_dot/{p.name} is no longer used" for p in unused])
        for line in problems:
            print(line)
        if problems:
            print("Run: python tools/render_figures.py")
        return 1 if problems else 0

    if missing:
        dot_exe = shutil.which("dot")
        if not dot_exe:
            raise SystemExit("Graphviz's dot program isn't on the PATH. Install Graphviz (graphviz.org) to draw diagrams.")
        DRAWN.mkdir(parents=True, exist_ok=True)
        for name in missing:
            svg_path = REPO / "figures" / name
            svg_path.write_bytes(draw(wanted[name], style, dot_exe))
            credit = {"own": True, "license": "Same as the question set that uses it",
                      "source": "Drawn by tools/render_figures.py from the question's Graphviz source"}
            svg_path.with_suffix(".json").write_bytes((json.dumps(credit, indent=2) + "\n").encode("utf-8"))
    for p in unused:
        p.unlink()

    print(f"{len(wanted)} diagram(s): {len(missing)} drawn, {len(unused)} unused file(s) removed, "
          f"{len(stale_sets)} set(s) updated")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
