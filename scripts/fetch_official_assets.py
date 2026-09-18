#!/usr/bin/env python3
"""Download the selected official stills for local use; no images ship in Git."""
from pathlib import Path
from urllib.request import Request, urlopen
import argparse
import re
import time

ROOT = Path(__file__).resolve().parents[1]
SETS = {
    "wind-rises-gallery": ("kazetachinu", ROOT / "wind-rises-gallery"),
    "laputa-original-gallery": ("laputa", ROOT / "laputa-original-gallery"),
}


def fetch(project: str) -> None:
    prefix, directory = SETS[project]
    scene_text = (directory / "scenes.js").read_text(encoding="utf-8")
    numbers = sorted(set(re.findall(r"\['\d{2}','[^']+','[^']+','(\d{3})'", scene_text)))
    if len(numbers) != 20:
        raise RuntimeError(f"{project}: expected 20 official still IDs, got {len(numbers)}")
    destination = directory / "artwork" / "originals"
    destination.mkdir(parents=True, exist_ok=True)
    for number in numbers:
        target = destination / f"{prefix}{number}.jpg"
        if target.exists() and target.stat().st_size > 10_000:
            continue
        url = f"https://www.ghibli.jp/gallery/{prefix}{number}.jpg"
        print(f"{project}: {number} -> {target}")
        request = Request(url, headers={"User-Agent": "Mozilla/5.0 scene-galleries local downloader"})
        for attempt in range(3):
            try:
                with urlopen(request, timeout=30) as response:
                    data = response.read()
                if len(data) < 10_000 or not data.startswith(b"\xff\xd8\xff"):
                    raise ValueError("response is not a valid JPEG still")
                target.write_bytes(data)
                break
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(2 * (attempt + 1))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project", nargs="?", choices=[*SETS, "all"], default="all")
    args = parser.parse_args()
    for selected in SETS if args.project == "all" else [args.project]:
        fetch(selected)
