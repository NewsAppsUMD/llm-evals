#!/usr/bin/env python3
"""Encode readable scenarios so students can't casually read the answers.

Reads scenarios-src/*.md (files starting with "_" are skipped), writes
scenarios/<name>.dat plus scenarios/index.json. This is obfuscation, not
encryption: it stops someone opening a file in a text editor or on GitHub,
not a determined student with browser developer tools.

    python build_scenarios.py
"""

import base64
import gzip
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "scenarios-src"
OUT = ROOT / "scenarios"

# Must match KEY in js/scenarios.js.
KEY = b"interview-practice"
MAGIC = "IPS1:"


def encode(text: str) -> str:
    data = gzip.compress(text.encode("utf-8"))
    mixed = bytes(b ^ KEY[i % len(KEY)] for i, b in enumerate(data))
    return MAGIC + base64.b64encode(mixed).decode("ascii")


def main():
    sources = sorted(p for p in SRC.glob("*.md") if not p.name.startswith("_"))
    if not sources:
        raise SystemExit(f"No scenarios found in {SRC}")

    # Keep the order already in index.json (it controls the order students see);
    # new scenarios go at the end. Delete a line there to reorder.
    index = OUT / "index.json"
    previous = json.loads(index.read_text()) if index.exists() else []
    rank = {Path(n).stem: i for i, n in enumerate(previous)}
    sources.sort(key=lambda p: rank.get(p.stem, len(rank)))

    OUT.mkdir(exist_ok=True)
    for old in OUT.glob("*.dat"):
        old.unlink()

    names = []
    for src in sources:
        name = f"{src.stem}.dat"
        (OUT / name).write_text(encode(src.read_text(encoding="utf-8")), encoding="ascii")
        names.append(name)
        print(f"  {src.name} -> scenarios/{name}")

    (OUT / "index.json").write_text(json.dumps(names, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(names)} scenario(s) and scenarios/index.json")


if __name__ == "__main__":
    main()
