#!/usr/bin/env python3
"""Re-fetch poi_photos that were stored at the old 1200px clamp.

Root cause (2026-08-03): fetchPhotoBinary defaulted to maxHeightPx=1200, so
every Google Places POI photo landed in storage at ~1600x1200 even though the
source is 3000-4800px. The 1080 square feed card + ken-burns 4x upscale then
made it visibly mushy. Clamp is now 2400; this backfills what's already stored.

Idempotent: skips rows whose stored JPEG is already >= TARGET_H tall.

    python3 backfill_poi_photo_res.py --limit 5     # sample
    python3 backfill_poi_photo_res.py               # all
"""

from __future__ import annotations

import argparse
import io
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image

TARGET_H = 2400
BUCKET = "listing-photos"
REPO_ROOT = Path(__file__).resolve().parents[2]


def load_env() -> None:
    for line in (REPO_ROOT / ".env.local").read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip("'\""))


def req(url: str, headers: dict[str, str], data: bytes | None = None, method: str | None = None):
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    return urllib.request.urlopen(r, timeout=60)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="0 = all")
    args = ap.parse_args()

    load_env()
    sb = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    gkey = os.environ["GOOGLE_PLACES_API_KEY"]
    H = {"apikey": key, "Authorization": f"Bearer {key}"}

    # Only rows where Google says the source is big enough to be worth re-fetching.
    q = (
        f"{sb}/rest/v1/poi_photos?select=id,google_photo_name,storage_path,width_px,height_px"
        f"&google_photo_name=not.is.null&or=(width_px.gte.2000,height_px.gte.2000)"
    )
    rows = json.load(req(q, H))
    if args.limit:
        rows = rows[: args.limit]
    print(f"{len(rows)} candidate rows", flush=True)

    done = skipped = failed = 0
    for i, r in enumerate(rows, 1):
        path = r["storage_path"]
        try:
            cur = Image.open(io.BytesIO(req(f"{sb}/storage/v1/object/{BUCKET}/{path}", H).read()))
            if cur.height >= TARGET_H:
                skipped += 1
                continue

            body = req(
                f"https://places.googleapis.com/v1/{r['google_photo_name']}/media?maxHeightPx={TARGET_H}",
                {"X-Goog-Api-Key": gkey},
            ).read()
            new = Image.open(io.BytesIO(body))
            if new.height <= cur.height:
                # Google has no bigger original than what we already hold.
                skipped += 1
                continue

            req(
                f"{sb}/storage/v1/object/{BUCKET}/{path}",
                {**H, "Content-Type": "image/jpeg", "x-upsert": "true"},
                data=body,
                method="PUT",
            ).read()
            req(
                f"{sb}/rest/v1/poi_photos?id=eq.{r['id']}",
                {**H, "Content-Type": "application/json", "Prefer": "return=minimal"},
                data=json.dumps({"width_px": new.width, "height_px": new.height}).encode(),
                method="PATCH",
            ).read()
            done += 1
            print(f"[{i}/{len(rows)}] {cur.size} -> {new.size}  {path}", flush=True)
        except (urllib.error.HTTPError, urllib.error.URLError, OSError) as e:
            failed += 1
            print(f"[{i}/{len(rows)}] FAIL {path}: {e}", file=sys.stderr, flush=True)

    print(f"done={done} skipped={skipped} failed={failed}", flush=True)
    return 1 if failed and not done else 0


if __name__ == "__main__":
    sys.exit(main())
