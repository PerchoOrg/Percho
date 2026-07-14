#!/usr/bin/env python3
"""
Download up to N Google Place photos for a single address / POI.

Usage:
  export GOOGLE_PLACES_API_KEY=...
  python3 scripts/poi-photos.py "Waterside, Peachtree Corners, GA" -n 10 -o out/waterside

Uses Places API (New):
  1. Text Search  -> place_id + photos[] resource names
  2. Place Photos -> raw JPEG bytes (redirect followed)

Notes:
- Google caps photos per place at 10.
- FieldMask kept minimal to control cost.
- No videos: Places API does not expose video media.
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys
import urllib.error
import urllib.parse
import urllib.request

API = "https://places.googleapis.com/v1"


def _http(method: str, url: str, headers: dict, body: bytes | None = None,
          follow_redirect: bool = True) -> tuple[int, dict, bytes]:
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    opener = urllib.request.build_opener() if follow_redirect else \
        urllib.request.build_opener(urllib.request.HTTPRedirectHandler())
    if not follow_redirect:
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *a, **kw): return None
        opener = urllib.request.build_opener(NoRedirect())
    try:
        with opener.open(req, timeout=30) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers or {}), e.read()


def text_search(query: str, key: str) -> dict:
    """Return the top place match for a free-text query."""
    body = json.dumps({"textQuery": query, "pageSize": 1}).encode()
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.photos",
    }
    code, _, payload = _http("POST", f"{API}/places:searchText", headers, body)
    if code != 200:
        sys.exit(f"[text_search] HTTP {code}: {payload.decode(errors='replace')}")
    data = json.loads(payload)
    places = data.get("places") or []
    if not places:
        sys.exit(f"[text_search] No place found for: {query!r}")
    return places[0]


def download_photo(photo_name: str, key: str, out_path: pathlib.Path,
                   max_px: int = 1600) -> int:
    """photo_name looks like 'places/<id>/photos/<ref>'. Returns bytes written."""
    q = urllib.parse.urlencode({"maxWidthPx": max_px, "maxHeightPx": max_px, "key": key})
    url = f"{API}/{photo_name}/media?{q}"
    code, headers, payload = _http("GET", url, headers={}, follow_redirect=True)
    if code != 200:
        sys.exit(f"[photo] HTTP {code} for {photo_name}: {payload[:200]!r}")
    out_path.write_bytes(payload)
    return len(payload)


def main() -> None:
    ap = argparse.ArgumentParser(description="Download Google Place photos for one POI")
    ap.add_argument("query", help="Address or POI name, e.g. 'Waterside, Peachtree Corners, GA'")
    ap.add_argument("-n", "--count", type=int, default=10, help="Max photos (Google caps at 10)")
    ap.add_argument("-o", "--out", default="poi-photos", help="Output directory")
    ap.add_argument("--max-px", type=int, default=1600, help="Max photo dimension (Google max 4800)")
    args = ap.parse_args()

    key = os.environ.get("GOOGLE_PLACES_API_KEY")
    if not key:
        # Fallback: read from repo-root .env.local
        env_file = pathlib.Path(__file__).resolve().parent.parent / ".env.local"
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                _prefix = "GOOGLE_PLACES_API_KEY" + "="
                if line.startswith(_prefix):
                    key = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
    if not key:
        sys.exit("Set GOOGLE_PLACES_API_KEY env var or add to .env.local.")


    place = text_search(args.query, key)
    name = place.get("displayName", {}).get("text", "unknown")
    addr = place.get("formattedAddress", "")
    photos = place.get("photos") or []
    print(f"→ Matched: {name}  |  {addr}")
    print(f"→ Photos available: {len(photos)}  (fetching up to {args.count})")

    out_dir = pathlib.Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    manifest = {"query": args.query, "place_id": place.get("id"),
                "name": name, "address": addr, "photos": []}

    for i, p in enumerate(photos[: args.count], 1):
        pname = p["name"]
        out_file = out_dir / f"{i:02d}.jpg"
        size = download_photo(pname, key, out_file, args.max_px)
        attrib = [a.get("displayName", "") for a in (p.get("authorAttributions") or [])]
        manifest["photos"].append({"file": out_file.name, "resource": pname,
                                    "bytes": size, "attributions": attrib})
        print(f"  [{i:02d}] {out_file}  ({size//1024} KB)  by {', '.join(attrib) or '—'}")

    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"\n✓ Done. Manifest: {out_dir / 'manifest.json'}")


if __name__ == "__main__":
    main()
