#!/usr/bin/env python3
"""One-off: pull a few real listing + POI photos, enhance them, hstack
BEFORE/AFTER at the 1080 card crop so the owner can judge before any batch run.

    /usr/bin/python3 scripts/render-worker/enhance_sample.py [N]
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import cv2
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from enhance import enhance  # noqa: E402

REPO = Path(__file__).resolve().parents[2]


def load_env(p: Path) -> None:
    for raw in p.read_text().splitlines():
        line = raw.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            import os
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_env(REPO / ".env.local")
import os  # noqa: E402

URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}
OUT = Path("/tmp/enhance-sample")


def get(table, params):
    r = requests.get(f"{URL}/rest/v1/{table}", headers=H, params=params, timeout=30)
    r.raise_for_status()
    return r.json()


def dl(path, dest):
    r = requests.get(f"{URL}/storage/v1/object/listing-photos/{path}", headers=H, timeout=90)
    r.raise_for_status()
    dest.write_bytes(r.content)


def pair(src: Path, tag: str) -> Path:
    img = cv2.imread(str(src), cv2.IMREAD_COLOR)
    after, _ = enhance(img)
    a = OUT / f"{tag}_after.jpg"
    cv2.imwrite(str(a), after, [cv2.IMWRITE_JPEG_QUALITY, 92])
    cmp = OUT / f"cmp_{tag}.jpg"
    # Both sides cropped to the 1080 square the feed card actually shows, so the
    # comparison is at delivery resolution, not source resolution.
    vf = (
        "[0:v]scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080,"
        "drawtext=text='BEFORE':x=20:y=20:fontsize=48:fontcolor=white:box=1:boxcolor=black@0.6[b];"
        "[1:v]scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080,"
        "drawtext=text='AFTER':x=20:y=20:fontsize=48:fontcolor=white:box=1:boxcolor=black@0.6[a];"
        "[b][a]hstack"
    )
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-i", str(a),
         "-filter_complex", vf, "-frames:v", "1", str(cmp)], check=True)
    return cmp


def main() -> None:
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    OUT.mkdir(parents=True, exist_ok=True)
    made = []
    for table, sel in (("listing_photos", "storage_path"), ("poi_photos", "storage_path")):
        rows = get(table, {"select": f"id,{sel}", "limit": str(n * 4)})
        picked = 0
        for row in rows:
            if picked >= n:
                break
            tag = f"{table[:4]}_{row['id'][:8]}"
            src = OUT / f"{tag}_before.jpg"
            try:
                dl(row["storage_path"], src)
                made.append(pair(src, tag))
                picked += 1
                print("ok", tag, flush=True)
            except Exception as e:  # noqa: BLE001
                print("skip", tag, e, flush=True)
    for m in made:
        print(m)


if __name__ == "__main__":
    main()
