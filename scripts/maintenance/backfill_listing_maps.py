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
    python3 scripts/maintenance/backfill_listing_maps.py            # only missing ones
    python3 scripts/maintenance/backfill_listing_maps.py --force    # re-render everything
    python3 scripts/maintenance/backfill_listing_maps.py --limit 5  # sample first
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

# Card map styling. Two deliberate departures from the first version:
#
#   1. NO LABELS AT ALL. The owner's instruction was 「去掉地图上的字」 — street
#      names are text too, so the whole label layer goes, not just the caption
#      the card used to overlay. (Google's own watermark + "Map data ©" stay:
#      the Static Maps terms mandate them and no styling removes them. Getting
#      rid of those means changing basemap providers — Mapbox / MapTiler.)
#   2. LIGHT, warm palette. The tile now renders inside a 132pt CIRCLE with a
#      white ring, and the old near-black fill read as a hole punched in the
#      card rather than an object on it.
#
# The earlier note here warned that labels-off at zoom 14 looked like a broken
# empty rectangle. That was a ZOOM problem, not a label problem: at 16 the local
# street geometry fills the frame on its own, verified on the sample listing.
CARD_STYLE = [
    "feature:all|element:geometry|color:0xf3ede2",
    "feature:all|element:labels|visibility:off",
    "feature:road|element:geometry.fill|color:0xffffff",
    "feature:road|element:geometry.stroke|color:0xe6dbc8",
    "feature:road.arterial|element:geometry.fill|color:0xfff6e6",
    "feature:water|element:geometry|color:0xbfd9de",
    "feature:poi.park|element:geometry|color:0xcfe3be",
    "feature:landscape.natural|element:geometry|color:0xede6d6",
    "feature:poi|visibility:off",
    "feature:transit|visibility:off",
]

# Bump this whenever CARD_STYLE / zoom / size / markers change.
#
# It goes in the STORAGE PATH, and that is load-bearing: tiles are uploaded with
# `Cache-Control: public, max-age=31536000, immutable`. Re-rendering to the same
# path leaves every CDN edge and every installed app serving the OLD picture
# forever — a redesign that appears to do nothing. Versioning the path makes the
# new tile a new object, so it simply can't be shadowed by the old one.
STYLE_VERSION = "v2light"


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
        # 240 not 200: the tile now fills a 132pt circle at up to 3x device
        # density, and the extra margin means the circular crop never eats the
        # part of the street grid nearest the house.
        "size": "240x240",
        "scale": "2",  # retina; 480x480 actual pixels
        "maptype": "roadmap",
        # NO `markers`. Google's marker is a teardrop pin with a drop shadow; the
        # card draws its own centred dot (a plain circle, plus a slow pulse) so
        # the pin style is ours and stays consistent with the rest of the UI.
        # Leaving both in produced two overlapping location indicators.
        "key": GKEY,
    }
    url = (
        f"{STATIC_MAPS}?{urllib.parse.urlencode(q)}"
        + "".join(f"&style={urllib.parse.quote(s)}" for s in CARD_STYLE)
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
            # Coordinate in the object name, so a re-geocode produces a NEW path
            # instead of serving a stale immutable-cached tile.
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
