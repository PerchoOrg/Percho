#!/usr/bin/env python3
"""Pre-render the listing card's locality map into Supabase Storage.

The card's map is a fixed picture of a fixed coordinate, so fetching it from
Google Static Maps on every render is a billable request for an image that never
changes — and doing it client-side means shipping the API key inside the JS
bundle (`EXPO_PUBLIC_*` is inlined at build time and is extractable). This
renders each tile once, uploads it to the public `listing-maps` bucket, and
stores the resulting public URL on `listings.map_url`.

Idempotent: a listing that already has `map_url` is skipped unless --force.

Usage:
    python3 scripts/backfill_listing_maps.py            # only missing ones
    python3 scripts/backfill_listing_maps.py --force    # re-render everything
    python3 scripts/backfill_listing_maps.py --limit 5  # sample first
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
BUCKET = "listing-maps"
STATIC_MAPS = "https://maps.googleapis.com/maps/api/staticmap"

# Bumped whenever the STYLE below changes. It goes in the object PATH, because
# tiles are uploaded `immutable, max-age=1y`: re-rendering to the same path
# leaves every device and CDN serving the OLD picture forever. A new style must
# get a new path or the re-render is invisible. (v1 = the dark tile.)
STYLE_VERSION = "v2light"

# Light map styling, matched to the light card chassis (2026-07-29 redesign).
#
# The previous tile was dark — styled to sit in the chocolate info panel that the
# owner replaced ("右下角地图不好看", plus the 纯白+浅灰 brief). A dark square in a
# white card is the single loudest element on the face, i.e. the 视觉噪音 the
# brief rules out.
#
# Roads and place labels stay VISIBLE, and zoom stays at 16. That is not taste:
# an earlier prototype styled them off at zoom 14 and the 104pt result rendered
# as a flat empty rectangle, which reads as a broken image. Business POI pins are
# off — they are the noise; the street grid is the signal.
LIGHT_STYLE = [
    "feature:all|element:geometry|color:0xEEE7DC",
    "feature:all|element:labels.text.fill|color:0x7D7469",
    "feature:all|element:labels.text.stroke|color:0xFFFDFA",
    "feature:all|element:labels.icon|visibility:off",
    "feature:road|element:geometry.fill|color:0xFFFFFF",
    "feature:road|element:geometry.stroke|color:0xDFD6C8",
    "feature:road.arterial|element:geometry.fill|color:0xFFF8EC",
    "feature:water|element:geometry|color:0xBFD0D6",
    "feature:poi.park|element:geometry|color:0xD6E3C6",
    "feature:poi.business|visibility:off",
]


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    path = REPO_ROOT / ".env.local"
    for line in path.read_text().splitlines():
        m = re.match(r"\s*([A-Z0-9_]+)\s*=\s*(.*)", line)
        if m:
            env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return env


ENV = load_env()
SB = ENV.get("NEXT_PUBLIC_SUPABASE_URL") or ""
KEY = ENV.get("SUPABASE_SERVICE_ROLE_KEY") or ""
GKEY = ENV.get("GOOGLE_PLACES_API_KEY") or ""
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}


def rest(path: str, params: dict[str, str]) -> list[dict]:
    url = f"{SB}/rest/v1/{path}?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=H)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def patch(path: str, params: dict[str, str], body: dict) -> None:
    url = f"{SB}/rest/v1/{path}?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={**H, "Content-Type": "application/json"},
        method="PATCH",
    )
    with urllib.request.urlopen(req, timeout=30):
        pass


def ensure_bucket() -> None:
    """Create the public bucket if absent. 409 = already there, which is fine."""
    req = urllib.request.Request(
        f"{SB}/storage/v1/bucket",
        data=json.dumps({"id": BUCKET, "name": BUCKET, "public": True}).encode(),
        headers={**H, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30):
            print(f"[maps] created public bucket {BUCKET}")
    except urllib.error.HTTPError as e:
        if e.code in (400, 409):
            print(f"[maps] bucket {BUCKET} already exists")
        else:
            raise


def static_map_png(lat: float, lng: float) -> bytes:
    q = {
        "center": f"{lat},{lng}",
        "zoom": "16",
        # 2:1 landscape, not the old 200x200 square. The card's map is now a
        # full-width strip under the info block (the square version was a
        # 104pt chip crammed against the text — "右下角地图不好看"), so the
        # tile has to be rendered at the shape it is displayed at or `cover`
        # would crop most of the street grid away.
        "size": "600x300",
        "scale": "2",  # retina; 1200x600 actual pixels
        "maptype": "roadmap",
        "markers": f"color:0xB45309|size:small|{lat},{lng}",
        "key": GKEY,
    }
    url = (
        f"{STATIC_MAPS}?{urllib.parse.urlencode(q)}"
        + "".join(f"&style={urllib.parse.quote(s)}" for s in LIGHT_STYLE)
    )
    with urllib.request.urlopen(url, timeout=40) as r:
        body = r.read()
    # A 200 with a non-PNG body is Google returning an error image/text. Assert
    # the magic bytes so a broken key can't silently fill Storage with garbage.
    if not body.startswith(b"\x89PNG"):
        raise RuntimeError(f"not a PNG ({len(body)}B): {body[:120]!r}")
    return body


def upload(path: str, png: bytes) -> str:
    url = f"{SB}/storage/v1/object/{BUCKET}/{path}"
    req = urllib.request.Request(
        url,
        data=png,
        headers={
            **H,
            "Content-Type": "image/png",
            "Cache-Control": "public, max-age=31536000, immutable",
            "x-upsert": "true",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60):
        pass
    return f"{SB}/storage/v1/object/public/{BUCKET}/{path}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="re-render even if cached")
    ap.add_argument("--limit", type=int, default=0, help="cap how many to do")
    args = ap.parse_args()

    for name, val in (("SUPABASE_URL", SB), ("SERVICE_ROLE_KEY", KEY), ("GOOGLE_PLACES_API_KEY", GKEY)):
        if not val:
            print(f"missing {name} in .env.local", file=sys.stderr)
            return 1

    ensure_bucket()

    params = {
        "select": "id,address,lat,lng,map_url",
        "lat": "not.is.null",
        "lng": "not.is.null",
        "order": "created_at.asc",
    }
    rows = rest("listings", params)
    todo = [r for r in rows if args.force or not r.get("map_url")]
    if args.limit:
        todo = todo[: args.limit]
    print(f"[maps] {len(rows)} geocoded listings, {len(todo)} to render")

    ok = fail = 0
    for i, r in enumerate(todo, 1):
        lat, lng = float(r["lat"]), float(r["lng"])
        try:
            png = static_map_png(lat, lng)
            # Coordinate AND style version in the object name. Both matter: a
            # re-geocode must produce a NEW path rather than serve a stale
            # immutable-cached tile, and so must a style change (see
            # STYLE_VERSION). Uploading a new picture to an old path is a no-op
            # as far as every client is concerned.
            path = f"{r['id']}/{STYLE_VERSION}_{lat:.6f}_{lng:.6f}.png"
            url = upload(path, png)
            patch(
                "listings",
                {"id": f"eq.{r['id']}"},
                {
                    "map_url": url,
                    "map_cached_at": datetime.now(timezone.utc).isoformat(),
                },
            )
            ok += 1
            print(f"[maps] ({i}/{len(todo)}) {r['address'][:40]:40s} {len(png):6d}B ok")
        except Exception as e:  # noqa: BLE001 — one bad row must not kill the run
            fail += 1
            print(f"[maps] ({i}/{len(todo)}) {r['address'][:40]:40s} FAILED: {e}")

    print(f"[maps] done: {ok} ok, {fail} failed")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
