#!/usr/bin/env python3
"""
Phase 75 (2026-07-07) one-off backfill.

Before phase 75 the render worker double-wrote a portrait AND a landscape
Cloudflare Stream asset whenever ≥80% of a listing's photos were horizontal.
Phase 75 changed the worker to strictly one-or-the-other, so the pre-existing
double-write rows are now half-orphaned: BrowseFeed 74.17+ only plays the
landscape uid, the portrait uid just burns CF Stream storage.

This script:
  1. Finds listing_videos rows where BOTH cf_video_id AND cf_video_id_landscape
     are populated.
  2. Deletes the portrait CF asset via the Cloudflare Stream DELETE API.
  3. Clears cf_video_id on the row (leaving cf_video_id_landscape).

Idempotent: rerunning is safe (rows already cleaned no longer match the
selector). Dry-run by default; pass --apply to execute.

Usage:
  python3 scripts/render-worker/backfill_single_orientation.py           # dry run
  python3 scripts/render-worker/backfill_single_orientation.py --apply   # execute
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path
from typing import Any

import requests

REPO_ROOT = Path(__file__).resolve().parents[2]
ENV_PATH = REPO_ROOT / ".env.local"


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val


load_env(ENV_PATH)

SUPABASE_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
CF_ACCOUNT = os.environ["CLOUDFLARE_ACCOUNT_ID"]
CF_TOKEN = os.environ["CLOUDFLARE_STREAM_API_TOKEN"]

REST = f"{SUPABASE_URL}/rest/v1"
SB_HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}


def sb_get(table: str, params: dict[str, str]) -> list[dict[str, Any]]:
    r = requests.get(f"{REST}/{table}", headers=SB_HEADERS, params=params, timeout=30)
    r.raise_for_status()
    return r.json()


def sb_patch(table: str, params: dict[str, str], body: dict[str, Any]) -> None:
    headers = {**SB_HEADERS, "Prefer": "return=minimal"}
    r = requests.patch(f"{REST}/{table}", headers=headers, params=params, json=body, timeout=30)
    r.raise_for_status()


def cf_delete(video_id: str) -> tuple[bool, str]:
    """Delete a Cloudflare Stream video by uid. Returns (ok, detail)."""
    url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT}/stream/{video_id}"
    headers = {"Authorization": f"Bearer {CF_TOKEN}"}
    r = requests.delete(url, headers=headers, timeout=30)
    if r.status_code == 200:
        return True, "deleted"
    # 404 = already gone (idempotent success)
    if r.status_code == 404:
        return True, "not found (already deleted)"
    return False, f"HTTP {r.status_code}: {r.text[:200]}"


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--apply", action="store_true", help="Actually delete + patch. Without this, dry-run.")
    args = p.parse_args()

    rows = sb_get(
        "listing_videos",
        {
            "select": "id,listing_id,cf_video_id,cf_video_id_landscape",
            "cf_video_id": "not.is.null",
            "cf_video_id_landscape": "not.is.null",
        },
    )

    print(f"Found {len(rows)} double-write listing_videos rows.")
    if not rows:
        return 0

    for row in rows:
        vid = row["cf_video_id"]
        row_id = row["id"]
        listing_id = row["listing_id"]
        landscape = row["cf_video_id_landscape"]
        print(
            f"  row={row_id} listing={listing_id} "
            f"portrait={vid} landscape={landscape}"
        )

    if not args.apply:
        print("\nDry run. Rerun with --apply to delete portrait CF assets + clear cf_video_id.")
        return 0

    ok_count = 0
    fail_count = 0
    for row in rows:
        vid = row["cf_video_id"]
        row_id = row["id"]
        ok, detail = cf_delete(vid)
        if ok:
            try:
                sb_patch(
                    "listing_videos",
                    {"id": f"eq.{row_id}"},
                    {"cf_video_id": None},
                )
                print(f"  ✓ row={row_id} portrait={vid}: {detail}, row cleared")
                ok_count += 1
            except Exception as e:
                print(f"  ✗ row={row_id} portrait={vid}: CF {detail} but DB patch failed: {e}")
                fail_count += 1
        else:
            print(f"  ✗ row={row_id} portrait={vid}: {detail}")
            fail_count += 1
        # Gentle pacing — CF is fine with bursts but be nice.
        time.sleep(0.1)

    print(f"\nDone. {ok_count} cleared, {fail_count} failed.")
    return 1 if fail_count else 0


if __name__ == "__main__":
    sys.exit(main())
