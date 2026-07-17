#!/usr/bin/env python3
"""
Percho render worker (Phase 71, 2026-07-05).

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
Systemd unit:  scripts/render-worker/percho-render-worker.service
"""

from __future__ import annotations

import json
import os
import random
import shutil
import subprocess
import sys
import tempfile
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from photo_selector import build_plan, caption_for_shot  # type: ignore  # noqa: E402
from photo_tagger import MODEL as TAGGER_MODEL, tag_listing_photos  # type: ignore  # noqa: E402


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


MODEL_NAME = TAGGER_MODEL

REPO_ROOT = Path(__file__).resolve().parents[2]
ENV_PATH = REPO_ROOT / ".env.local"
BGM_DIR = Path(__file__).resolve().parent / "bgm"
GENERATE_SCRIPT = REPO_ROOT / "scripts" / "ken-burns" / "generate.py"

POLL_IDLE_SEC = 5
PHOTO_BUCKET = "listing-photos"

# Phase 71.7: threshold at which we render an additional 1920x1080 landscape
# version of the video for the fullscreen toggle. If ≥80% of the listing's
# photos are landscape (width > height), horizontal photos would waste ~30%
# of the vertical canvas as blur letterbox — a landscape render fills the
# frame properly. Below this threshold the portrait video works fine and we
# skip the extra 30-60s CPU + upload.
LANDSCAPE_THRESHOLD = 0.8


def probe_orientation(path: Path) -> str:
    """Return 'landscape' | 'portrait' | 'square' for an image via ffprobe."""
    try:
        out = subprocess.run(
            [
                "ffprobe", "-v", "error", "-select_streams", "v:0",
                "-show_entries", "stream=width,height",
                "-of", "csv=p=0", str(path),
            ],
            capture_output=True, text=True, check=True, timeout=15,
        )
        w_str, h_str = out.stdout.strip().split(",")[:2]
        w, h = int(w_str), int(h_str)
        if w > h:
            return "landscape"
        if h > w:
            return "portrait"
        return "square"
    except Exception:
        # If probing fails, treat as portrait (matches source-photo default).
        return "portrait"


def photos_are_mostly_landscape(photo_paths: list[Path]) -> bool:
    if not photo_paths:
        return False
    landscape_count = sum(1 for p in photo_paths if probe_orientation(p) == "landscape")
    return (landscape_count / len(photo_paths)) >= LANDSCAPE_THRESHOLD


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


def sb_post(table: str, body: dict[str, Any]) -> list[dict[str, Any]]:
    """Insert one row via PostgREST. Phase 92: used by the community-video
    publish sidecar so bucket renders land in `community_videos`."""
    headers = {**SB_HEADERS, "Prefer": "return=representation"}
    r = requests.post(f"{REST}/{table}", headers=headers, json=body, timeout=30)
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


def pick_bgm() -> Path | None:
    """Return a random .mp3 from BGM_DIR, or None if the directory is empty
    or missing. The worker still produces a valid (silent) video in that case.
    """
    if not BGM_DIR.exists():
        return None
    # Recurse into vibe-bucket subdirectories (warm-acoustic/, modern-corporate/,
    # luxury-ambient/, chill-electronic/). Skip _archive/ — those are tracks
    # that violated the SOP (jazz, tropical, non-US-neutral) but we keep the
    # files around for reference. Phase 106 (2026-07-17): cinematic bucket
    # retired — pull-bgm.sh purges the folder locally.
    tracks = sorted(
        p for p in BGM_DIR.rglob("*.mp3")
        if "_archive" not in p.relative_to(BGM_DIR).parts
    )
    if not tracks:
        return None
    return random.choice(tracks)


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

    # No text overlays anywhere — user wants a fully clean video (Phase 71.5).
    show_on: list[int] = []

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
                "select": "id,address,city,state,neighborhood,price,beds,baths,sqft,ai_style",
                "id": f"eq.{listing_id}",
            },
        )
        if not listings:
            raise RuntimeError(f"listing {listing_id} not found")
        listing = listings[0]

        # 2. Fetch photos in sort order (with id + dimensions for tagger).
        #    Phase 95: also pull `ai_tags`/`tagged_at` so we can reuse prior
        #    vision labels and avoid re-billing Claude on repeat renders.
        photos = sb_get(
            "listing_photos",
            {
                "select": "id,storage_path,sort_order,width,height,ai_tags,tagged_at",
                "listing_id": f"eq.{listing_id}",
                "order": "sort_order.asc",
            },
        )
        if len(photos) < 3:
            raise RuntimeError(f"only {len(photos)} photos, need >=3")

        # 3. Download photos. Filename encodes sort_order + photo id so the
        #    Phase 93 shot planner (which references photos by sort_order or
        #    id) can match them back inside generate.py's --shot-plan loader.
        photo_paths: list[Path] = []
        photo_records: list[dict[str, Any]] = []
        for p in photos:
            path = p["storage_path"]
            sort_i = int(p.get("sort_order") or 0)
            pid = p["id"]
            ext = Path(path).suffix or ".jpg"
            dest = workdir / f"{sort_i:03d}_{pid}{ext}"
            storage_download(PHOTO_BUCKET, path, dest)
            photo_paths.append(dest)
            photo_records.append({
                "id": pid,
                "sort_order": sort_i,
                "local_path": str(dest),
                "storage_path": path,
                "width": p.get("width"),
                "height": p.get("height"),
                # Phase 95: pre-loaded ai_tags (may be None). Used below to
                # skip re-tagging already-labeled photos.
                "cached_ai_tags": p.get("ai_tags"),
                "tagged_at": p.get("tagged_at"),
            })
            print(f"[job {job['id']}] downloaded {dest.name}", flush=True)

        # 3b. Decide orientation. Phase 75 (2026-07-07): strictly one-or-the-
        # other. ≥80% horizontal photos → landscape only (feed uses it with
        # object-contain letterbox, fullscreen fills). Otherwise portrait
        # only (no fullscreen button in feed). Prior to phase 75 we always
        # rendered portrait and optionally added landscape on top — that
        # double-render wasted CF Stream storage/encode for every landscape
        # listing because 74.17 made the feed use the landscape uid whenever
        # available. Owner: "两种情况下，都只有一个视频".
        want_landscape = photos_are_mostly_landscape(photo_paths)
        landscape_ratio = sum(1 for p in photo_paths if probe_orientation(p) == "landscape") / len(photo_paths)
        orientation = "landscape" if want_landscape else "portrait"
        print(
            f"[job {job['id']}] landscape_ratio={landscape_ratio:.2f} "
            f"orientation={orientation}",
            flush=True,
        )

        # 4. Write overlay JSON.
        overlay = build_overlay(listing, len(photos))
        overlay_path = workdir / "overlay.json"
        overlay_path.write_text(json.dumps(overlay, indent=2))

        # 4b. Phase 93: vision-driven shot plan for listing home tours.
        #    Runs Claude Sonnet 4.5 on every photo, then photo_selector picks
        #    the 8-14 best in narrative order. Any failure (missing API key,
        #    network, bad JSON) falls back to the legacy “all photos in
        #    sort_order” path — the video still ships.
        #
        #    Phase 95: results are now persisted to `listing_photos.ai_tags`
        #    and `listings.ai_style`. Photos with `tagged_at IS NOT NULL`
        #    reuse the cached tags — repeat renders of the same listing do
        #    zero Claude calls unless new photos are uploaded.
        shot_plan_path: Path | None = None
        listing_captions_path: Path | None = None
        try:
            if not os.environ.get("ANTHROPIC_API_KEY"):
                raise RuntimeError("ANTHROPIC_API_KEY not set — skipping vision plan")

            # Split cached vs. needs-tagging.
            need_tag = [p for p in photo_records if not p.get("tagged_at")]
            cached_tagged: list[dict[str, Any]] = []
            for p in photo_records:
                if p.get("tagged_at") and isinstance(p.get("cached_ai_tags"), dict):
                    row = dict(p["cached_ai_tags"])
                    row["id"] = p["id"]
                    row["_id"] = p["id"]
                    row["sort_order"] = p["sort_order"]
                    row["_sort_order"] = p["sort_order"]
                    cached_tagged.append(row)

            newly_tagged: list[dict[str, Any]] = []
            style_info: dict[str, Any] | None = None
            if need_tag:
                print(
                    f"[job {job['id']}] tagging {len(need_tag)} new photos w/ Claude vision "
                    f"(reusing {len(cached_tagged)} cached)",
                    flush=True,
                )
                tag_result = tag_listing_photos(need_tag, listing)
                newly_tagged = tag_result["photos"]
                style_info = tag_result["style"]

                # Persist per-photo results. `ai_score` = quality * hero_score
                # (POI convention). Any per-photo call that errored has
                # `{"error": ...}` in the tag dict — we still stamp
                # `tagged_at` so we don't infinitely retry a broken frame,
                # but leave `ai_tags` null.
                now = _now_iso()
                for r in newly_tagged:
                    pid = r.get("id")
                    if not pid:
                        continue
                    if "error" in r:
                        # Mark as attempted so the next render doesn't retry
                        # the same broken frame. `ai_tags` stays null.
                        sb_patch(
                            "listing_photos",
                            {"id": f"eq.{pid}"},
                            {
                                "tagged_at": now,
                                "ai_model": MODEL_NAME,
                            },
                        )
                        continue
                    ai_tags = {
                        k: v for k, v in r.items()
                        if not k.startswith("_") and k not in ("id", "sort_order")
                    }
                    q = float(r.get("quality") or 0.0)
                    hs = float(r.get("hero_score") or 0.0)
                    ai_score = round(q * hs, 2)
                    sb_patch(
                        "listing_photos",
                        {"id": f"eq.{pid}"},
                        {
                            "ai_tags": ai_tags,
                            "ai_score": ai_score,
                            "ai_model": MODEL_NAME,
                            "tagged_at": now,
                        },
                    )

            # Style: prefer freshly-computed (based on new hero photos), else
            # fall back to cached listing.ai_style, else default.
            if style_info is None:
                cached_style = listing.get("ai_style") if isinstance(listing, dict) else None
                style_info = cached_style if isinstance(cached_style, dict) else {
                    "style": "modern",
                    "confidence": 0.0,
                }
            elif style_info and isinstance(style_info, dict):
                # Persist listing-level style aggregation.
                sb_patch(
                    "listings",
                    {"id": f"eq.{listing_id}"},
                    {"ai_style": style_info},
                )

            tagged = cached_tagged + newly_tagged
            style = style_info.get("style", "modern")
            plan = build_plan(tagged, style, listing_id)
            for shot in plan:
                shot["caption"] = caption_for_shot(shot)
            shot_plan_path = workdir / "shot_plan.json"
            shot_plan_path.write_text(json.dumps({
                "plan": plan,
                "listing": listing,
                "style": style_info,
            }, indent=2))

            # Phase 100 (2026-07-16): per-photo AI caption band. Reuses the
            # HTML→PNG caption renderer (bucket videos use it too, archetype
            # dispatch happens in overlay.html). LISTING archetype writes a
            # bottom scrim band; `txt` is the ai_tags.caption vision output,
            # `kicker` is a room label derived from photo_selector.
            # Empty txt (missing/short caption) → overlay renderer emits an
            # empty transparent PNG, ffmpeg overlay is a no-op for that clip.
            listing_captions = []
            for i, shot in enumerate(plan, start=1):
                raw = (shot.get("ai_caption") or "").strip()
                # room label kicker: use caption_for_shot output (already
                # room/subject-aware). Fall back to room_type in Title Case.
                kicker = (shot.get("caption") or "").strip()
                if not kicker:
                    rt = (shot.get("room_type") or "").replace("_", " ").strip()
                    kicker = rt.title() if rt else ""
                listing_captions.append({
                    "clip": i,
                    "kicker": kicker.upper(),
                    "txt": raw,
                })
            listing_captions_path = workdir / "captions.json"
            listing_captions_path.write_text(json.dumps({
                "archetype": "LISTING",
                "clips": listing_captions,
            }, indent=2))
            print(
                f"[job {job['id']}] shot plan: style={style} "
                f"clips={len(plan)} (of {len(tagged)} tagged)",
                flush=True,
            )
        except Exception as e:  # noqa: BLE001
            print(f"[job {job['id']}] shot plan disabled: {e} — falling back to legacy path", flush=True)
            shot_plan_path = None
            listing_captions_path = None

        # 5. Run generate.py — one orientation only (see 3b).
        bgm_choice = pick_bgm()

        def render(orientation: str, out_path: Path) -> None:
            cmd = [
                "python3",
                str(GENERATE_SCRIPT),
                "--photos",
                str(workdir),
                "--output",
                str(out_path),
                "--orientation",
                orientation,
                "--listing-overlay",
                str(overlay_path),
            ]
            if bgm_choice:
                cmd += ["--bgm", str(bgm_choice)]
            if shot_plan_path is not None:
                cmd += ["--shot-plan", str(shot_plan_path)]
            if listing_captions_path is not None:
                cmd += ["--captions", str(listing_captions_path)]
            print(f"[job {job['id']}] running ({orientation}): {' '.join(cmd)}", flush=True)
            subprocess.run(cmd, check=True, cwd=str(REPO_ROOT))
            if not out_path.exists():
                raise RuntimeError(f"generate.py did not produce {out_path.name}")

        out_path = workdir / f"out_{orientation}.mp4"
        render(orientation, out_path)

        # 6. Upload to Cloudflare Stream (one asset only).
        cf_uid = cf_upload(
            out_path,
            meta={
                "name": f"{listing.get('address', 'Listing')} — home tour"
                + (" (landscape)" if orientation == "landscape" else ""),
                "listing_id": listing_id,
                "orientation": orientation,
            },
        )
        print(f"[job {job['id']}] uploaded {orientation} to CF: {cf_uid}", flush=True)

        # 7. Update listing_videos: set the appropriate uid column, clear
        #    the other one (in case of a re-render swapping orientations),
        #    clear the sentinel external_url, mark ready.
        patch_body: dict[str, Any] = {
            "cf_video_id": cf_uid if orientation == "portrait" else None,
            "cf_video_id_landscape": cf_uid if orientation == "landscape" else None,
            "external_url": None,
            "status": "ready",
        }
        sb_patch(
            "listing_videos",
            {"id": f"eq.{video_row_id}"},
            patch_body,
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


# ── bucket-video pipeline (Phase 76.6, 2026-07-14) ──────────────────────


BUCKET_LABELS = {
    # Legacy 4 (pre-Phase-85 buckets, kept for old rows in DB).
    "walkable": "Walkable",
    "daily_drive": "Daily drive",
    "lifestyle": "Lifestyle",
    "commute": "Commute",
    # Phase 85: canonical 14 from lib/poi/types.ts INTENT_BUCKETS.
    "schools": "Schools",
    "healthcare": "Healthcare",
    "dining": "Dining",
    "fitness": "Fitness & Wellness",
    "shopping": "Shopping",
    "daily_errands": "Daily Errands",
    "pets": "Pets",
    "nightlife": "Nightlife",
    "outdoor": "Outdoors & Parks",
    "transit": "Transit & Commute",
    "work_hubs": "Work Hubs",
    "kids": "Kids & Family",
    "asian_community": "Asian Community",
    "faith": "Faith Communities",
}


# Phase 85: 14 nearby buckets → 6 video-template archetypes.
# See lib/poi/types.ts INTENT_BUCKETS for the canonical bucket list.
# Archetypes drive caption layout in scripts/ken-burns/generate.py.
# Phase 89.1: Google Places `type` → human-readable label.
# Mirror of lib/poi/types.ts POI_TYPE_LABEL. Keep in sync.
# Falls back to bucket_label when nothing matches — do NOT invent generic
# labels like "Point of Interest" here.
POI_TYPE_LABEL = {
    # schools
    "primary_school": "Elementary School",
    "secondary_school": "High School",
    "school": "School",
    "university": "University",
    # dining
    "restaurant": "Restaurant",
    "cafe": "Cafe",
    "bakery": "Bakery",
    "meal_takeaway": "Takeout",
    "meal_delivery": "Delivery",
    # nightlife
    "bar": "Bar",
    "night_club": "Nightclub",
    "movie_theater": "Movie Theater",
    # shopping
    "shopping_mall": "Shopping Mall",
    "department_store": "Department Store",
    "clothing_store": "Clothing Store",
    # outdoor
    "park": "Park",
    "campground": "Campground",
    "tourist_attraction": "Attraction",
    # fitness
    "gym": "Gym",
    "spa": "Spa",
    # kids
    "amusement_park": "Amusement Park",
    "aquarium": "Aquarium",
    "zoo": "Zoo",
    "library": "Library",
    # daily_errands
    "supermarket": "Supermarket",
    "grocery_store": "Grocery Store",
    "pharmacy": "Pharmacy",
    "convenience_store": "Convenience Store",
    # faith
    "church": "Church",
    "mosque": "Mosque",
    "synagogue": "Synagogue",
    "hindu_temple": "Hindu Temple",
    # healthcare
    "hospital": "Hospital",
    "doctor": "Doctor",
    "dentist": "Dentist",
    # pets
    "veterinary_care": "Veterinary Clinic",
    "pet_store": "Pet Store",
    # transit
    "subway_station": "Subway Station",
    "train_station": "Train Station",
    "transit_station": "Transit Station",
    "airport": "Airport",
    "bus_station": "Bus Station",
}


def poi_type_label(primary_type, types, fallback):
    """Return the most-specific human label for a POI, else fallback."""
    if primary_type and primary_type in POI_TYPE_LABEL:
        return POI_TYPE_LABEL[primary_type]
    for t in types or []:
        if t in POI_TYPE_LABEL:
            return POI_TYPE_LABEL[t]
    return fallback


CAPTION_ARCHETYPE_MAP = {
    "schools": "TRUST",
    "healthcare": "TRUST",
    "dining": "LIFESTYLE",
    "fitness": "LIFESTYLE",
    "shopping": "UTILITY",
    "daily_errands": "UTILITY",
    "pets": "UTILITY",
    "nightlife": "NARRATIVE",
    "outdoor": "MAP",
    "transit": "MAP",
    "work_hubs": "MAP",
    "kids": "MAGAZINE",
    "asian_community": "MAGAZINE",
    "faith": "MAGAZINE",
}


def claim_bucket_job() -> dict[str, Any] | None:
    """Pick oldest pending generated_videos row (scope in {intent_bucket,
    community_intent_bucket, listing_intent_bucket}) and flip to 'processing'
    atomically. Phase 92 (2026-07-15) added community-scoped rows; Phase 101
    (2026-07-16) added listing_intent_bucket — same render path as the legacy
    intent_bucket scope (both anchor on a listing), same listing_pois table.

    Same optimistic-lock pattern as claim_job(): filter status='pending' on
    both SELECT and PATCH so a concurrent worker cannot double-claim.
    """
    rows = sb_get(
        "generated_videos",
        {
            "select": "id,listing_id,community_id,scope,intent_bucket,input_photo_ids",
            "scope": "in.(intent_bucket,community_intent_bucket,listing_intent_bucket)",
            "status": "eq.pending",
            "order": "created_at.asc",
            "limit": "1",
        },
    )
    if not rows:
        return None
    job = rows[0]
    updated = sb_patch(
        "generated_videos",
        {"id": f"eq.{job['id']}", "status": "eq.pending"},
        {"status": "processing"},
    )
    if not updated:
        return None
    return job


def process_bucket_job(job: dict[str, Any]) -> None:
    video_id = job["id"]
    scope = job.get("scope") or "intent_bucket"
    is_community = scope == "community_intent_bucket"
    listing_id = job.get("listing_id")
    community_id = job.get("community_id")
    bucket = job["intent_bucket"]
    input_photo_ids: list[str] = job.get("input_photo_ids") or []
    workdir = Path(tempfile.mkdtemp(prefix=f"bucket-{video_id[:8]}-"))
    owner_desc = f"community={community_id}" if is_community else f"listing={listing_id}"
    print(
        f"[bucket-job {video_id}] scope={scope} {owner_desc} bucket={bucket} "
        f"photos={len(input_photo_ids)} workdir={workdir}",
        flush=True,
    )

    try:
        if len(input_photo_ids) < 3:
            raise RuntimeError(f"only {len(input_photo_ids)} input photos, need >=3")

        if is_community and not community_id:
            raise RuntimeError("community_intent_bucket scope but community_id is null")
        if not is_community and not listing_id:
            raise RuntimeError("intent_bucket scope but listing_id is null")

        # 1. Resolve poi_photos rows (with POI join for captions).
        id_list = ",".join(input_photo_ids)
        photo_rows = sb_get(
            "poi_photos",
            {
                "select": "id,storage_path,poi_id,pois!inner(display_name,primary_type,types)",
                "id": f"in.({id_list})",
            },
        )
        by_id = {p["id"]: p for p in photo_rows}
        # Distance source depends on scope: community_pois vs listing_pois.
        # Fetch once, index by poi_id.
        distinct_poi_ids: list[str] = list(
            {p["poi_id"] for p in photo_rows if p.get("poi_id")}
        )
        distance_by_poi: dict[str, float] = {}
        if distinct_poi_ids:
            dist_table = "community_pois" if is_community else "listing_pois"
            owner_filter = (
                {"community_id": f"eq.{community_id}"}
                if is_community
                else {"listing_id": f"eq.{listing_id}"}
            )
            lp_rows = sb_get(
                dist_table,
                {
                    "select": "poi_id,distance_m",
                    **owner_filter,
                    "poi_id": f"in.({','.join(distinct_poi_ids)})",
                },
            )
            for r in lp_rows:
                if r.get("distance_m") is not None:
                    distance_by_poi[r["poi_id"]] = float(r["distance_m"])
        missing = [pid for pid in input_photo_ids if pid not in by_id]
        if missing:
            raise RuntimeError(
                f"{len(missing)} input photo ids not found in poi_photos: {missing[:3]}"
            )

        # 2. Download in the exact order the server action selected them.
        photo_paths: list[Path] = []
        for i, pid in enumerate(input_photo_ids, start=1):
            path = by_id[pid]["storage_path"]
            ext = Path(path).suffix or ".jpg"
            dest = workdir / f"{i:02d}-photo{ext}"
            storage_download(PHOTO_BUCKET, path, dest)
            photo_paths.append(dest)
            print(f"[bucket-job {video_id}] downloaded {dest.name}", flush=True)

        # 3. Bucket orientation — Phase 92 (2026-07-15) fix: previously
        # hard-coded portrait, which forced landscape POI photos (dining
        # storefronts, wide-angle shopping shots) into a 9:16 canvas via blur
        # letterbox. Users read this as "stretched / weird band". Now: if
        # photos are majority landscape, render 16:9 output natively — same
        # policy the listing worker uses (see LANDSCAPE_THRESHOLD, line 313).
        orientation = (
            "landscape" if photos_are_mostly_landscape(photo_paths) else "portrait"
        )
        print(
            f"[bucket-job {video_id}] orientation={orientation} "
            f"(landscape_count={sum(1 for p in photo_paths if probe_orientation(p) == 'landscape')}/{len(photo_paths)})",
            flush=True,
        )

        # 4. Overlay — reuse the listing overlay builder but override the
        # neighborhood line with the bucket label so the video reads e.g.
        # "Daily drive". Overlays are hidden anyway (71.5), but the JSON is
        # still logged for provenance. Phase 92: community-scoped jobs pull
        # from `communities` instead — no address/price, just the name.
        if is_community:
            comms = sb_get(
                "communities",
                {"select": "id,name,city,state", "id": f"eq.{community_id}"},
            )
            if not comms:
                raise RuntimeError(f"community {community_id} not found")
            community = comms[0]
            listing = {
                "address": community.get("name") or "",
                "city": community.get("city") or "",
                "state": community.get("state") or "",
                "neighborhood": community.get("name") or "",
                "price": None,
                "beds": None,
                "baths": None,
                "sqft": None,
            }
        else:
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
        overlay = build_overlay(listing, len(photo_paths))
        overlay["neighborhood"] = BUCKET_LABELS.get(bucket, bucket)
        overlay["show_on_clips"] = []
        overlay_path = workdir / "overlay.json"
        overlay_path.write_text(json.dumps(overlay, indent=2))

        # 4b. Phase 85: per-clip captions from POI display names + distance.
        # One entry per input photo, in the same order the photos were downloaded.
        # Optional narrative "beat" from generated_videos.narrative overrides
        # the default name-only caption when present.
        vid_rows = sb_get(
            "generated_videos",
            {"select": "narrative", "id": f"eq.{video_id}"},
        )
        narrative_beats_by_poi: dict[str, str] = {}
        narrative_caption_fields_by_poi: dict[str, dict] = {}
        if vid_rows and vid_rows[0].get("narrative"):
            for scene in (vid_rows[0]["narrative"].get("scenes") or []):
                pid = scene.get("poi_id")
                beat = scene.get("beat")
                if pid and beat:
                    narrative_beats_by_poi[pid] = beat
                # Phase 89.2: per-scene caption_fields (why/quote/title/chapter)
                cf = scene.get("caption_fields")
                if pid and isinstance(cf, dict) and cf:
                    narrative_caption_fields_by_poi[pid] = cf

        def _fmt_distance_mi(m: float | None) -> float | None:
            if m is None:
                return None
            return round(m / 1609.34, 1)

        def _fmt_drive_min(m: float | None) -> str:
            if m is None:
                return ""
            mi = m / 1609.34
            # crude: assume 25 mph average = 2.4 min/mi in suburbs
            mins = max(1, int(round(mi * 2.4)))
            return f"{mins} min"

        archetype = CAPTION_ARCHETYPE_MAP.get(bucket, "TRUST")
        bucket_label = BUCKET_LABELS.get(bucket, bucket)

        # Phase 88: build per-clip caption metadata in the new schema
        # consumed by scripts/caption-render/overlay.html. Fields depend on
        # archetype; unfilled narrative fields (why/quote/title/etc.) fall
        # back to hardcoded placeholders until Phase 89 LLM populates them.
        captions = []
        for i, pid in enumerate(input_photo_ids, start=1):
            row = by_id[pid]
            poi = row.get("pois") or {}
            poi_id = row.get("poi_id")
            dist_m = distance_by_poi.get(poi_id) if poi_id else None
            dist_mi = _fmt_distance_mi(dist_m)
            drive = _fmt_drive_min(dist_m)
            beat = narrative_beats_by_poi.get(poi_id, "") if poi_id else ""
            # Phase 89.2: LLM-authored caption fields (why/quote/title/chapter)
            cf = narrative_caption_fields_by_poi.get(poi_id, {}) if poi_id else {}
            poi_name = (poi.get("display_name") or "").strip()
            # Phase 89.1: Map google_places.types → human label; fallback to bucket_label.
            type_label = poi_type_label(
                poi.get("primary_type"), poi.get("types"), bucket_label
            )

            entry: dict = {
                "clip": i,
                "poi": poi_name,
                "type": type_label,
                "dist": dist_mi,
                "drive": drive,
            }
            if archetype == "TRUST":
                # Placeholder badges — Phase 89.3 GreatSchools / GoodRx / etc.
                entry["badges"] = [{"t": bucket_label, "c": "gold"}]
            elif archetype == "LIFESTYLE":
                # Phase 89.2: LLM `why` overrides; fall back to POI name (never fabricate).
                entry["why"] = cf.get("why") or poi_name or bucket_label
                entry["chapter"] = f"{i:02d} / {len(input_photo_ids):02d}"
            elif archetype == "NARRATIVE":
                # Phase 89.2: LLM `quote` overrides; fall back to POI name.
                entry["quote"] = cf.get("quote") or poi_name
            elif archetype == "MAGAZINE":
                entry["section"] = "The Neighborhood"
                # Phase 89.2: LLM `chapter` overrides roman-numeral placeholder.
                entry["chapter"] = (
                    f"Chapter {cf['chapter']}"
                    if cf.get("chapter")
                    else f"Chapter {['I','II','III','IV','V','VI'][min(i-1,5)]}"
                )
                # Phase 89.2: LLM `title` overrides; fall back to POI name.
                entry["title"] = cf.get("title") or poi_name
                entry["credit"] = f"{type_label.upper()} · {dist_mi or '—'} MI · {(drive or '—').upper()}"
            elif archetype == "MAP":
                entry["mode"] = "Drive"
                entry["time"] = drive
            # UTILITY needs no extras — {poi, type, dist, drive} is enough
            captions.append(entry)

        captions_path = workdir / "captions.json"
        captions_path.write_text(json.dumps({
            "archetype": archetype,
            "bucket": bucket,
            "bucket_label": bucket_label,
            "clips": captions,
        }, indent=2))

        # 5. Render.
        bgm_choice = pick_bgm()
        out_path = workdir / f"bucket_{bucket}.mp4"
        cmd = [
            "python3", str(GENERATE_SCRIPT),
            "--photos", str(workdir),
            "--output", str(out_path),
            "--orientation", orientation,
            "--listing-overlay", str(overlay_path),
            "--captions", str(captions_path),
        ]
        if bgm_choice:
            cmd += ["--bgm", str(bgm_choice)]
        print(f"[bucket-job {video_id}] running: {' '.join(cmd)}", flush=True)
        subprocess.run(cmd, check=True, cwd=str(REPO_ROOT))
        if not out_path.exists():
            raise RuntimeError(f"generate.py did not produce {out_path.name}")

        # 6. Upload to CF Stream.
        cf_meta: dict[str, str] = {
            "name": (
                f"{community['name']} — {BUCKET_LABELS.get(bucket, bucket)}"
                if is_community
                else f"{listing.get('address', 'Listing')} — {BUCKET_LABELS.get(bucket, bucket)}"
            ),
            "scope": scope,
            "intent_bucket": bucket,
        }
        if is_community and community_id:
            cf_meta["community_id"] = community_id
        elif listing_id:
            cf_meta["listing_id"] = listing_id
        cf_uid = cf_upload(out_path, meta=cf_meta)
        print(f"[bucket-job {video_id}] uploaded to CF: {cf_uid}", flush=True)

        # 7. Duration via ffprobe.
        try:
            probe = subprocess.run(
                [
                    "ffprobe", "-v", "error", "-show_entries",
                    "format=duration", "-of", "csv=p=0", str(out_path),
                ],
                capture_output=True, text=True, check=True, timeout=15,
            )
            duration_s: float | None = round(float(probe.stdout.strip()), 2)
        except Exception:
            duration_s = None

        # 8. Ready.
        sb_patch(
            "generated_videos",
            {"id": f"eq.{video_id}"},
            {
                "status": "ready",
                "cf_stream_uid": cf_uid,
                "duration_s": duration_s,
                "error": None,
            },
        )

        # Phase 92 (2026-07-15): community-scoped jobs also publish into
        # `community_videos` so the neighborhood-shared reader path
        # (listing feed nearbyVideos, browse feed) can pick them up. Per
        # §Phase 91 owner rule, allow multiple history rows per (community,
        # bucket) — the newest ready one becomes primary, prior primaries
        # get demoted to is_primary=false (still queryable as history).
        if is_community and community_id:
            community_name = community["name"] if is_community else ""
            try:
                # Demote any prior primary for this (community, bucket).
                sb_patch(
                    "community_videos",
                    {
                        "community_id": f"eq.{community_id}",
                        "intent_bucket": f"eq.{bucket}",
                        "is_primary": "eq.true",
                    },
                    {"is_primary": False},
                )
                # Insert this render as the new primary. NOTE column names:
                # community_videos uses `cf_video_id` (not cf_stream_uid) and
                # `duration_sec` (not duration_s) — see supabase/migrations/
                # 0001_init.sql:174 and 20260715204205.
                sb_post(
                    "community_videos",
                    {
                        "community_id": community_id,
                        "intent_bucket": bucket,
                        "cf_video_id": cf_uid,
                        "duration_sec": int(duration_s) if duration_s else None,
                        "status": "ready",
                        "is_primary": True,
                        "kind": "poi",
                        "title": f"{community['name']} — {BUCKET_LABELS.get(bucket, bucket)}",
                    },
                )
            except Exception:
                # Never fail the whole job just because the sidecar publish
                # slipped — generated_videos.status='ready' already reflects
                # the successful render. Log so we notice.
                traceback.print_exc()

        print(f"[bucket-job {video_id}] done", flush=True)

    except Exception as e:
        err = f"{type(e).__name__}: {e}"
        print(f"[bucket-job {video_id}] FAILED: {err}", flush=True)
        traceback.print_exc()
        try:
            sb_patch(
                "generated_videos",
                {"id": f"eq.{video_id}"},
                {"status": "failed", "error": err[:1000]},
            )
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

        if job is not None:
            process_job(job)
            continue

        # Phase 76.6b (2026-07-14): after listing_videos tour jobs, also poll
        # bucket-video jobs (generated_videos.scope='intent_bucket', status
        # 'pending'). Same worker box, same ffmpeg + CF path — the only diff
        # is the photo source (poi_photos referenced by input_photo_ids)
        # and the destination row (generated_videos, not listing_videos).
        try:
            bucket_job = claim_bucket_job()
        except Exception:
            traceback.print_exc()
            time.sleep(POLL_IDLE_SEC)
            continue

        if bucket_job is not None:
            process_bucket_job(bucket_job)
            continue

        time.sleep(POLL_IDLE_SEC)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("[worker] shutting down", flush=True)
        sys.exit(0)
