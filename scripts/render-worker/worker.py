#!/usr/bin/env python3
"""
Vicinity render worker (Phase 71, 2026-07-05).

Long-running poller that:
  1. SELECTs one queued render_jobs row (optimistic lock: UPDATE where
     status='queued').
  2. Downloads the listing's photos from Supabase Storage.
  3. Runs scripts/ken-burns/generate.py with a listing overlay JSON
     built from the listing row.
  4. Uploads the rendered MP4 to Cloudflare Stream (simple upload
     endpoint — fine for <200MB).
  5. Updates listing_videos.cf_video_id + status='ready', and
     render_jobs.status='done'.

Uses the Supabase service role key (bypasses RLS) via direct PostgREST
calls, so no supabase-py dependency. Env is read from .env.local via a
minimal parser (no python-dotenv dependency).

Run manually:  python3 scripts/render-worker/worker.py
Systemd unit:  scripts/render-worker/vicinity-render-worker.service
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import traceback
from pathlib import Path
from typing import Any

import requests

REPO_ROOT = Path(__file__).resolve().parents[2]
ENV_PATH = REPO_ROOT / ".env.local"
GENERATE_SCRIPT = REPO_ROOT / "scripts" / "ken-burns" / "generate.py"
ENDING_CARD = REPO_ROOT / "docs" / "ken-burns" / "demo" / "ending-card.json"

POLL_IDLE_SEC = 5
PHOTO_BUCKET = "listing-photos"


# ── env loading ─────────────────────────────────────────────────────────

def load_env(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
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
STORAGE = f"{SUPABASE_URL}/storage/v1"
SB_HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}


# ── Supabase helpers (service role — bypass RLS) ────────────────────────

def sb_get(table: str, params: dict[str, str]) -> list[dict[str, Any]]:
    r = requests.get(f"{REST}/{table}", headers=SB_HEADERS, params=params, timeout=30)
    r.raise_for_status()
    return r.json()


def sb_patch(table: str, params: dict[str, str], body: dict[str, Any]) -> list[dict[str, Any]]:
    headers = {**SB_HEADERS, "Prefer": "return=representation"}
    r = requests.patch(f"{REST}/{table}", headers=headers, params=params, json=body, timeout=30)
    r.raise_for_status()
    return r.json()


def storage_download(bucket: str, path: str, dest: Path) -> None:
    # Service role can read from any bucket regardless of RLS.
    url = f"{STORAGE}/object/{bucket}/{path}"
    with requests.get(url, headers=SB_HEADERS, stream=True, timeout=60) as r:
        r.raise_for_status()
        with dest.open("wb") as f:
            for chunk in r.iter_content(chunk_size=1 << 15):
                f.write(chunk)


# ── Cloudflare Stream ───────────────────────────────────────────────────

def cf_upload(mp4: Path, meta: dict[str, str]) -> str:
    """Simple (non-tus) upload. Returns cf video uid."""
    url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT}/stream"
    with mp4.open("rb") as f:
        files = {"file": (mp4.name, f, "video/mp4")}
        data = {"meta": json.dumps(meta)}
        r = requests.post(
            url,
            headers={"Authorization": f"Bearer {CF_TOKEN}"},
            files=files,
            data=data,
            timeout=600,
        )
    if not r.ok:
        raise RuntimeError(f"CF Stream upload failed: {r.status_code} {r.text[:500]}")
    body = r.json()
    if not body.get("success"):
        raise RuntimeError(f"CF Stream upload not successful: {body}")
    return body["result"]["uid"]


# ── job pipeline ────────────────────────────────────────────────────────

def claim_job() -> dict[str, Any] | None:
    """Optimistic lock: pick oldest queued row, UPDATE if still queued."""
    rows = sb_get(
        "render_jobs",
        {
            "select": "id,listing_id,video_row_id,attempts",
            "status": "eq.queued",
            "order": "created_at.asc",
            "limit": "1",
        },
    )
    if not rows:
        return None
    job = rows[0]
    updated = sb_patch(
        "render_jobs",
        {"id": f"eq.{job['id']}", "status": "eq.queued"},
        {"status": "running", "attempts": job["attempts"] + 1},
    )
    if not updated:
        # Someone else grabbed it — try again next tick.
        return None
    return job


def format_price(price: int | None) -> str:
    if not price:
        return ""
    return f"${price:,}"


def format_specs(beds: Any, baths: Any, sqft: Any) -> str:
    parts: list[str] = []
    if beds:
        parts.append(f"{beds} bd")
    if baths:
        parts.append(f"{baths} ba")
    if sqft:
        parts.append(f"{int(sqft):,} sqft")
    return " · ".join(parts)


def build_overlay(listing: dict[str, Any], photo_count: int) -> dict[str, Any]:
    address = listing.get("address") or ""
    city = listing.get("city") or ""
    state = listing.get("state") or ""
    neighborhood = listing.get("neighborhood") or ""
    location_line = neighborhood
    if city:
        location_line = f"{neighborhood} · {city}" if neighborhood else city
    if state and state not in location_line:
        location_line = f"{location_line}, {state}" if location_line else state

    # Overlay first three clips (or all if fewer). 1-indexed per generate.py.
    show_on = list(range(1, min(3, photo_count) + 1))

    return {
        "price_display": format_price(listing.get("price")),
        "specs": format_specs(listing.get("beds"), listing.get("baths"), listing.get("sqft")),
        "address": address,
        "neighborhood": location_line,
        "show_on_clips": show_on,
    }


def process_job(job: dict[str, Any]) -> None:
    listing_id = job["listing_id"]
    video_row_id = job["video_row_id"]
    workdir = Path(tempfile.mkdtemp(prefix=f"render-{job['id'][:8]}-"))
    print(f"[job {job['id']}] workdir={workdir}", flush=True)

    try:
        # 1. Fetch listing details.
        listings = sb_get(
            "listings",
            {
                "select": "id,address,city,state,neighborhood,price,beds,baths,sqft",
                "id": f"eq.{listing_id}",
            },
        )
        if not listings:
            raise RuntimeError(f"listing {listing_id} not found")
        listing = listings[0]

        # 2. Fetch photos in sort order.
        photos = sb_get(
            "listing_photos",
            {
                "select": "storage_path,sort_order",
                "listing_id": f"eq.{listing_id}",
                "order": "sort_order.asc",
            },
        )
        if len(photos) < 3:
            raise RuntimeError(f"only {len(photos)} photos, need >=3")

        # 3. Download photos.
        for i, p in enumerate(photos, start=1):
            path = p["storage_path"]
            ext = Path(path).suffix or ".jpg"
            dest = workdir / f"{i:02d}-photo{ext}"
            storage_download(PHOTO_BUCKET, path, dest)
            print(f"[job {job['id']}] downloaded {dest.name}", flush=True)

        # 4. Write overlay JSON.
        overlay = build_overlay(listing, len(photos))
        overlay_path = workdir / "overlay.json"
        overlay_path.write_text(json.dumps(overlay, indent=2))

        # 5. Run generate.py.
        out_mp4 = workdir / "out.mp4"
        cmd = [
            "python3",
            str(GENERATE_SCRIPT),
            "--photos",
            str(workdir),
            "--output",
            str(out_mp4),
            "--listing-overlay",
            str(overlay_path),
            "--ending-card",
            str(ENDING_CARD),
        ]
        print(f"[job {job['id']}] running: {' '.join(cmd)}", flush=True)
        subprocess.run(cmd, check=True, cwd=str(REPO_ROOT))

        if not out_mp4.exists():
            raise RuntimeError("generate.py did not produce out.mp4")

        # 6. Upload to Cloudflare Stream.
        cf_video_id = cf_upload(
            out_mp4,
            meta={
                "name": f"{listing.get('address', 'Listing')} — home tour",
                "listing_id": listing_id,
            },
        )
        print(f"[job {job['id']}] uploaded to CF: {cf_video_id}", flush=True)

        # 7. Update listing_videos: set cf_video_id, clear the sentinel
        #    external_url, mark ready.
        sb_patch(
            "listing_videos",
            {"id": f"eq.{video_row_id}"},
            {"cf_video_id": cf_video_id, "external_url": None, "status": "ready"},
        )

        # 8. Mark job done.
        sb_patch("render_jobs", {"id": f"eq.{job['id']}"}, {"status": "done", "error": None})
        print(f"[job {job['id']}] done", flush=True)

    except Exception as e:
        err = f"{type(e).__name__}: {e}"
        print(f"[job {job['id']}] FAILED: {err}", flush=True)
        traceback.print_exc()
        try:
            sb_patch("render_jobs", {"id": f"eq.{job['id']}"}, {"status": "failed", "error": err[:1000]})
        except Exception:
            traceback.print_exc()
        try:
            sb_patch("listing_videos", {"id": f"eq.{video_row_id}"}, {"status": "error"})
        except Exception:
            traceback.print_exc()
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def main() -> None:
    print(f"[worker] starting, polling every {POLL_IDLE_SEC}s", flush=True)
    while True:
        try:
            job = claim_job()
        except Exception:
            traceback.print_exc()
            time.sleep(POLL_IDLE_SEC)
            continue

        if job is None:
            time.sleep(POLL_IDLE_SEC)
            continue

        process_job(job)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("[worker] shutting down", flush=True)
        sys.exit(0)
