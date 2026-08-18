#!/usr/bin/env python3
"""Build a SCORM 1.2 package for an edition of Loop of the Recursive Dragon.

Usage:
    python build.py editions/java.json
    python build.py editions/network.json

Produces dist/<output>.zip ready to upload to D2L (Manage Files -> upload,
then add as SCORM/xAPI activity).

The build:
- Copies the static game (src, styles, assets, images, index.html).
- Filters question_sets/catalog.json and index.json to only the topics named
  in the edition config.
- Copies only the question_set JSON files referenced by those topics.
- Patches index.html: title, intro copy, and a <script> tag for the SCORM
  shim.
- Generates imsmanifest.xml from the template.
- Zips it all.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import stat
import sys
import time
import uuid
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape as xml_escape

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
TEMPLATES = ROOT / "templates"
DIST = ROOT / "dist"

GAME_DIRS = ["src", "assets", "images"]
GAME_FILES = ["index.html", "styles.css"]


def load_config(path: Path) -> dict:
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def filter_catalog(catalog: list, topics: list[str]) -> list:
    keep = set(topics)
    return [t for t in catalog if t.get("topic") in keep]


def filter_sets(catalog: list, set_ids: list[str]) -> list:
    """Restrict each topic's sets to the given id allowlist. Topics left with
    no sets are dropped. Used to split one topic across multiple editions."""
    allow = set(set_ids)
    result = []
    for topic in catalog:
        kept = [e for e in topic.get("sets", []) or [] if e.get("id") in allow]
        if kept:
            t = dict(topic)
            t["sets"] = kept
            result.append(t)
    return result


def referenced_set_files(catalog: list) -> set[str]:
    """All question-set JSON filenames referenced by the catalog (entries
    with .id ending in .json, plus any sources listed by review entries)."""
    files: set[str] = set()
    for topic in catalog:
        for entry in topic.get("sets", []) or []:
            sid = entry.get("id", "")
            if sid.endswith(".json"):
                files.add(sid)
            for src in entry.get("sources", []) or []:
                if src.endswith(".json"):
                    files.add(src)
    return files


def remove_tree(path: Path) -> None:
    """Delete a directory tree, retrying past the transient locks and read-only
    bits that OneDrive and virus scanners leave on Windows. Raises if the tree
    survives: building on top of a previous edition's leftovers would silently
    ship stale question sets."""
    if not path.exists():
        return

    def clear_readonly(func, target, _exc):
        os.chmod(target, stat.S_IWRITE)
        func(target)

    kwarg = "onexc" if sys.version_info >= (3, 12) else "onerror"
    for attempt in range(3):
        try:
            shutil.rmtree(path, **{kwarg: clear_readonly})
            return
        except OSError:
            if attempt == 2:
                raise
            time.sleep(0.4)


def copy_game(build_dir: Path) -> None:
    for d in GAME_DIRS:
        src = REPO / d
        if src.exists():
            dst = build_dir / d
            remove_tree(dst)
            shutil.copytree(src, dst, dirs_exist_ok=True)
    for f in GAME_FILES:
        src = REPO / f
        if src.exists():
            shutil.copy2(src, build_dir / f)


def write_filtered_question_sets(build_dir: Path, filtered_catalog: list) -> list[str]:
    qs_src = REPO / "question_sets"
    qs_dst = build_dir / "question_sets"
    remove_tree(qs_dst)
    qs_dst.mkdir(parents=True, exist_ok=True)

    files = referenced_set_files(filtered_catalog)
    copied: list[str] = []
    for name in sorted(files):
        src = qs_src / name
        if src.exists():
            shutil.copy2(src, qs_dst / name)
            copied.append(name)
        else:
            print(f"  WARN: referenced set missing: {name}")

    with open(qs_dst / "catalog.json", "w", encoding="utf-8") as fh:
        json.dump(filtered_catalog, fh, indent=2)
    with open(qs_dst / "index.json", "w", encoding="utf-8") as fh:
        json.dump(copied, fh, indent=2)

    return copied


def patch_index_html(build_dir: Path, config: dict) -> None:
    path = build_dir / "index.html"
    html = path.read_text(encoding="utf-8")

    # Escaped so a title containing & or < stays valid markup, and passed as a
    # lambda so nothing in it is read as a regex backreference.
    title = xml_escape(config["title"])
    html = re.sub(
        r"<title>.*?</title>",
        lambda _m: f"<title>{title}</title>",
        html, count=1, flags=re.DOTALL,
    )
    html = re.sub(
        r'(<h1 class="title">)[^<]*(</h1>)',
        lambda m: f"{m.group(1)}{title}{m.group(2)}",
        html, count=1,
    )

    intro = config.get("intro_html")
    if intro:
        html = re.sub(
            r'(<div class="newcomer-intro"[^>]*>).*?(</div>)',
            rf"\g<1>{intro}\g<2>",
            html, count=1, flags=re.DOTALL,
        )

    # Inject the SCORM shim before the main module script.
    html = html.replace(
        '<script type="module" src="src/main.js"></script>',
        '<script src="scorm-shim.js"></script>\n'
        '  <script type="module" src="src/main.js"></script>',
    )

    path.write_text(html, encoding="utf-8")


def write_shim(build_dir: Path) -> None:
    shutil.copy2(TEMPLATES / "scorm-shim.js", build_dir / "scorm-shim.js")


def collect_files(build_dir: Path) -> list[str]:
    """Return all packaged file paths, relative to build_dir, POSIX style."""
    out: list[str] = []
    for p in build_dir.rglob("*"):
        if p.is_file():
            out.append(p.relative_to(build_dir).as_posix())
    return sorted(out)


def write_manifest(build_dir: Path, config: dict) -> None:
    template = (TEMPLATES / "imsmanifest.xml").read_text(encoding="utf-8")
    files = collect_files(build_dir)
    file_list = "\n".join(f'      <file href="{xml_escape(f)}"/>' for f in files)
    identifier = f'{config["id"]}-{uuid.uuid4().hex[:8]}'
    manifest = (template
                .replace("{{IDENTIFIER}}", identifier)
                .replace("{{TITLE}}", xml_escape(config["title"]))
                .replace("{{FILE_LIST}}", file_list))
    ET.fromstring(manifest)  # fail here rather than at upload time
    (build_dir / "imsmanifest.xml").write_text(manifest, encoding="utf-8")


def zip_package(build_dir: Path, out_zip: Path) -> None:
    out_zip.parent.mkdir(parents=True, exist_ok=True)
    if out_zip.exists():
        out_zip.unlink()
    with zipfile.ZipFile(out_zip, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for p in build_dir.rglob("*"):
            if p.is_file():
                zf.write(p, p.relative_to(build_dir).as_posix())


def build(config_path: Path) -> Path:
    config = load_config(config_path)
    edition_id = config["id"]
    print(f"Building edition: {edition_id}")

    work_dir = DIST / edition_id
    try:
        remove_tree(work_dir)
    except OSError as exc:
        raise SystemExit(
            f"Could not clear the previous build at {work_dir}: {exc}\n"
            f"Close anything holding those files (Explorer, an editor, a sync "
            f"client) and run the build again.")
    work_dir.mkdir(parents=True, exist_ok=True)

    copy_game(work_dir)

    full_catalog = json.loads(
        (REPO / "question_sets" / "catalog.json").read_text(encoding="utf-8"))
    filtered = filter_catalog(full_catalog, config["topics"])
    if not filtered:
        raise SystemExit(
            f"No catalog topics matched {config['topics']!r}. "
            f"Available: {[t.get('topic') for t in full_catalog]}")

    if config.get("sets"):
        filtered = filter_sets(filtered, config["sets"])
        if not filtered:
            raise SystemExit(
                f"No catalog sets matched {config['sets']!r} "
                f"within topics {config['topics']!r}.")

    copied = write_filtered_question_sets(work_dir, filtered)
    print(f"  Topics: {[t['topic'] for t in filtered]}")
    print(f"  Question set files: {len(copied)}")

    patch_index_html(work_dir, config)
    write_shim(work_dir)
    write_manifest(work_dir, config)

    out_zip = DIST / config["output"]
    zip_package(work_dir, out_zip)
    print(f"  -> {out_zip.relative_to(REPO)}")
    return out_zip


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__)
        return 2
    build(Path(argv[1]).resolve())
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
