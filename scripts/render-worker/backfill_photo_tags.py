#!/usr/bin/env python3
"""Backfill `listing_photos.ai_tags` for the fmls-import listings.

Why this exists: the §2.3-2.5 hotspot UI (tour stops, hero pins, action sheets)
is driven entirely by `ai_tags`. On 2026-07-27 that column was populated for 10
listings and ZERO of the 104 fmls-import listings the feed actually serves,
because `photo_tagger` had been broken since the personal Anthropic key was
removed. The tagger now runs on Bedrock; this fills the gap.

Scope control, on purpose:
  - Only ACTIVE listings, only `status='ready'` photos, only rows where
    `ai_tags IS NULL` — so re-running is cheap and never re-pays for a photo.
  - `--limit-listings` caps a run. Vision on 2388 photos is real money; the
    default is small and the operator opts into more.
  - Photos per listing are capped: a hotspot needs one good shot per ROOM, and
    the 40th photo of a bathroom buys nothing.

Usage:
    python3 scripts/render-worker/backfill_photo_tags.py --limit-listings 5
    python3 scripts/render-worker/backfill_photo_tags.py --limit-listings 200 --yes
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from photo_tagger import MODEL, PER_PHOTO_SYSTEM, _call_vision

REPO = Path(__file__).resolve().parents[2]
BUCKET = "listing-photos"
# One photo per room is what a hotspot needs; more is spend without new UI.
MAX_PHOTOS_PER_LISTING = 12


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    path = REPO / ".env.local"
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key] = value.strip().strip('"')
    return env


class Rest:
    def __init__(self, env: dict[str, str]) -> None:
        self.base = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
        self.key = env["SUPABASE_SERVICE_ROLE_KEY"]

    def _req(self, method: str, path: str, body: bytes | None = None,
             extra: dict[str, str] | None = None) -> Any:
        headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
        }
        headers.update(extra or {})
        req = urllib.request.Request(
            f"{self.base}/rest/v1/{path}", data=body, headers=headers, method=method
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else None

    def get(self, path: str) -> Any:
        return self._req("GET", path)

    def patch_photo(self, photo_id: str, tags: dict[str, Any], score: float) -> None:
        self._req(
            "PATCH",
            f"listing_photos?id=eq.{photo_id}",
            json.dumps({
                "ai_tags": tags,
                "ai_score": score,
                "ai_model": MODEL,
                "tagged_at": "now()",
            }).encode(),
            {"Prefer": "return=minimal"},
        )

    def public_url(self, storage_path: str) -> str:
        return f"{self.base}/storage/v1/object/public/{BUCKET}/{urllib.parse.quote(storage_path)}"


def score_of(tags: dict[str, Any]) -> float:
    """`ai_score` mirrors the existing rows: quality x hero_score."""
    quality = tags.get("quality")
    hero = tags.get("hero_score")
    if not isinstance(quality, (int, float)) or not isinstance(hero, (int, float)):
        return 0.0
    return round(float(quality) * float(hero), 3)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit-listings", type=int, default=3)
    ap.add_argument("--yes", action="store_true", help="skip the cost confirmation")
    args = ap.parse_args()

    env = load_env()
    rest = Rest(env)

    # Untagged ready photos on active fmls listings, oldest first for determinism.
    photos = rest.get(
        "listing_photos?select=id,listing_id,storage_path,sort_order"
        "&ai_tags=is.null&status=eq.ready&storage_path=like.fmls-import*"
        "&order=listing_id.asc,sort_order.asc&limit=5000"
    )
    by_listing: dict[str, list[dict[str, Any]]] = {}
    for photo in photos:
        by_listing.setdefault(photo["listing_id"], []).append(photo)

    listing_ids = list(by_listing)[: args.limit_listings]
    todo = [
        photo
        for lid in listing_ids
        for photo in by_listing[lid][:MAX_PHOTOS_PER_LISTING]
    ]

    print(f"model      : {MODEL}")
    print(f"listings   : {len(listing_ids)} (of {len(by_listing)} untagged)")
    print(f"photos     : {len(todo)}")
    if not todo:
        print("nothing to do")
        return 0
    if not args.yes:
        print("\nre-run with --yes to spend on these vision calls")
        return 0

    ok = 0
    failed = 0
    for i, photo in enumerate(todo, 1):
        url = rest.public_url(photo["storage_path"])
        try:
            raw = urllib.request.urlopen(url, timeout=60).read()
            tags = _call_vision(
                PER_PHOTO_SYSTEM,
                f"Photo sort_order={photo.get('sort_order') or 0}. Label it.",
                [raw],
            )
            rest.patch_photo(photo["id"], tags, score_of(tags))
            ok += 1
            room = tags.get("room_type")
            print(f"[{i}/{len(todo)}] {room:<9} {tags.get('caption', '')[:58]}")
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"[{i}/{len(todo)}] FAILED {photo['id']}: {exc}", file=sys.stderr)

    print(f"\ntagged={ok} failed={failed}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
