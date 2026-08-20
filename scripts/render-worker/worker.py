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

import base64
import json
import os
import random
import re
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
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ken-burns"))
from xfade import crossfade_offsets, crossfade_total  # type: ignore  # noqa: E402
from photo_selector import build_plan  # type: ignore  # noqa: E402
from photo_tagger import MODEL as TAGGER_MODEL, tag_listing_photos  # type: ignore  # noqa: E402


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


MODEL_NAME = TAGGER_MODEL

REPO_ROOT = Path(__file__).resolve().parents[2]
ENV_PATH = REPO_ROOT / ".env.local"
BGM_DIR = Path(__file__).resolve().parent / "bgm"
GENERATE_SCRIPT = REPO_ROOT / "scripts" / "ken-burns" / "generate.py"
# System interpreter, not whatever PATH resolves "python3" to. generate.py's
# caption renderer needs `playwright` from the system dist-packages; a venv
# python (e.g. when the worker is started by hand from an activated shell) has
# no playwright and every render dies at the caption step. See render().
# On EC2 this was /usr/bin/python3 (system 3.12 with all deps installed via
# --break-system-packages). On the Mac mini the render deps live in the
# .venv-render venv instead — pin the interpreter so the worker behaves the
# same however it is started.
PYTHON_BIN = str(REPO_ROOT / ".venv-render/bin/python3")
# Interpreter for the DepthFlow engine (torch + a depth model). Separate
# from PYTHON_BIN because generate.py and the caption renderer must keep
# running on the stdlib/playwright interpreter.
DEPTHFLOW_PYTHON = os.environ.get(
    "DEPTHFLOW_PYTHON", str(REPO_ROOT / ".venv-depthflow/bin/python")
)

POLL_IDLE_SEC = 5
PHOTO_BUCKET = "listing-photos"

# Phase 71.7: threshold at which we render an additional 1920x1080 landscape
# version of the video for the fullscreen toggle. If ≥80% of the listing's
# photos are landscape (width > height), horizontal photos would waste ~30%
# of the vertical canvas as blur letterbox — a landscape render fills the
# frame properly. Below this threshold the portrait video works fine and we
# skip the extra 30-60s CPU + upload.
LANDSCAPE_THRESHOLD = 0.8

# 2026-07-28 card redesign: the feed card's media block is 1:1, so the listing
# tour is rendered square. FMLS source photos are ~1024x686; a 1080x1080 canvas
# upscales 1.57x vs 2.80x for the old 1080x1920 portrait canvas — the least-
# upscaling shape available. Ken Burns is pan-lr only so each photo's full HEIGHT
# survives (owner's rule: "如果pan 视频能不能保持原本照片的高度 只做左右剪裁").
SQUARE_EDGE = 1080

# 2026-08-19: the COMMUNITY tour's canvas. Must equal CANVAS_W/CANVAS_H in
# apps/web/lib/poi/tour-orchestrator/scheduler.ts, which carries the full
# reasoning: 0.685 is the feed card's real aspect on every iPhone from the 13
# mini up, and the card plays with fit="cover", so a 9:16 render was losing 17%
# of its height (38% on an SE) along with the place label at the bottom.
TOUR_CANVAS_W = 1080
TOUR_CANVAS_H = 1576


def probe_dims(path: Path) -> tuple[int, int] | None:
    """(width, height) of an image via ffprobe, or None if it can't be read.

    listing_photos.width/height is NULL for 2388 of 2588 rows, so the shot
    planner cannot get a photo's shape from the database. The files are already
    on disk here and already ffprobed for orientation, so read it locally.
    """
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
        return int(w_str), int(h_str)
    except Exception:
        return None


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

# photo_tagger.MODEL binds at import (line 43), before load_env ran above —
# re-point it so GEMINI_MODEL from .env.local actually applies. Without this
# the worker calls the default gemini-2.5-flash, which 404s for the current
# API key: every photo errors → ai_tags null → build_plan collapses to a
# 1-clip video (all error dicts land in the "other" quota, max 1).
import photo_tagger
photo_tagger.MODEL = os.environ.get("GEMINI_MODEL", photo_tagger.MODEL)
MODEL_NAME = photo_tagger.MODEL

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


def storage_upload(bucket: str, path: str, src: Path, content_type: str = "image/jpeg") -> None:
    """Upsert a file into Storage. Used by the enhance pass, which must be
    re-runnable: a second enhance of the same photo overwrites in place rather
    than orphaning the first JPEG."""
    url = f"{STORAGE}/object/{bucket}/{path}"
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": content_type,
        "x-upsert": "true",
    }
    with src.open("rb") as f:
        r = requests.post(url, headers=headers, data=f, timeout=120)
    if r.status_code == 409:  # some Storage versions reject POST-over-existing
        with src.open("rb") as f:
            r = requests.put(url, headers=headers, data=f, timeout=120)
    if not r.ok:
        raise RuntimeError(f"storage upload failed {r.status_code}: {r.text[:300]}")


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
            "select": "id,listing_id,video_row_id,attempts,orientations,engine",
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


DEFAULT_BGM_VIBE = "acoustic"


def pick_bgm(vibe: str = DEFAULT_BGM_VIBE) -> Path | None:
    """A random reviewed .mp3 from `vibe`, or None if that bucket is empty.

    Only tracks that passed review are on disk at all — `pull-bgm.sh` skips
    anything the state sidecar lists as rejected or pending — so choosing at
    random here is choosing among things a human already approved.

    `vibe` is a parameter as of 2026-08-20, when generation made the other
    three buckets fillable again (owner: "good background music with different
    types for different vibe"). Nothing passes one yet, so every render still
    gets warm-acoustic exactly as before; an unknown or empty vibe falls back
    to it rather than rendering silent.
    """
    for name in (vibe, DEFAULT_BGM_VIBE):
        bucket = BGM_DIR / name
        if not bucket.exists():
            continue
        tracks = sorted(bucket.glob("*.mp3"))
        if tracks:
            return random.choice(tracks)
    return None


# ── narration ───────────────────────────────────────────────────────────────
#
# The script is written by the plan step (lib/poi/tour-orchestrator/narration.ts)
# and arrives on the assembly row as `narration`. It is spoken HERE because this
# is the only place the real timeline exists: clip lengths come from ffprobe on
# the rendered files, laid out with crossfades. Segments are anchored to clip
# INDICES for that reason — the plan's seconds are an estimate.

TTS_MODEL = os.environ.get("GEMINI_TTS_MODEL", "gemini-3.1-flash-tts-preview")

# Levels, measured rather than judged. Gemini TTS returns about -20 dB mean and
# the music bed sits at -15.7, so summing them leaves the words underneath the
# music and inaudible — the first cut of this played as music-only with the
# narration technically present. Normalising each line to -14 LUFS and dropping
# the bed to roughly -29 dB puts the voice ~10 dB clear.
VO_LOUDNORM = "loudnorm=I=-14:TP=-1.5:LRA=11"
# The bed is normalised rather than scaled, because the warm-acoustic bucket
# spans 12.6 dB (-11.4 to -24.0 across its tracks) and pick_bgm chooses at
# random. A fixed multiplier left the same narration clearly above the music on
# one track and fighting it on another.
MUSIC_BED_LOUDNORM = "loudnorm=I=-26:TP=-6:LRA=11"
# Music-only tours keep the level they have always had; nothing about them
# changed here.
MUSIC_VOL_ALONE = 0.55
STEREO_48K = "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo"


def clip_start_times(durs: list[float], xfade: float) -> list[float]:
    """When each clip actually begins on the finished timeline.

    Same derivation the on-screen place labels use: a crossfade overlaps the
    outgoing clip, so clip i starts one transition after the offset that
    introduced it.
    """
    offsets = crossfade_offsets(durs, xfade)
    return [0.0] + [offsets[i - 1] + xfade for i in range(1, len(durs))]


def tts_line(text: str, voice: str, out_wav: Path) -> bool:
    """Speak one line. False on any failure — narration is never worth a tour."""
    try:
        resp = requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{TTS_MODEL}:generateContent",
            headers={
                "x-goog-api-key": os.environ["GEMINI_API_KEY"],
                "content-type": "application/json",
            },
            json={
                "contents": [{"parts": [{"text": text}]}],
                "generationConfig": {
                    "responseModalities": ["AUDIO"],
                    "speechConfig": {
                        "voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}
                    },
                },
            },
            timeout=120,
        )
        resp.raise_for_status()
        parts = resp.json()["candidates"][0]["content"]["parts"]
        b64 = next(p["inlineData"]["data"] for p in parts if p.get("inlineData"))
    except Exception as exc:  # noqa: BLE001 — any failure falls back to music
        print(f"[narration] tts failed: {exc}", flush=True)
        return False

    pcm = out_wav.with_suffix(".pcm")
    pcm.write_bytes(base64.b64decode(b64))
    # The API returns headerless 24 kHz mono PCM.
    subprocess.run(
        ["ffmpeg", "-y", "-f", "s16le", "-ar", "24000", "-ac", "1",
         "-i", str(pcm), str(out_wav)],
        check=True, capture_output=True, timeout=60,
    )
    return out_wav.exists()


def render_narration(
    narration: dict[str, Any], starts: list[float], workdir: Path
) -> list[tuple[Path, float]]:
    """Synthesise each segment and pair it with the second its clips begin."""
    voice = narration.get("voice") or "Kore"
    placed: list[tuple[Path, float]] = []
    for seg in narration.get("segments") or []:
        text = (seg.get("text") or "").strip()
        idx = seg.get("startClip")
        if not text or not isinstance(idx, int) or not (0 <= idx < len(starts)):
            continue
        wav = workdir / f"vo-{idx}.wav"
        if tts_line(text, voice, wav):
            placed.append((wav, starts[idx]))
    print(
        f"[narration] {len(placed)}/{len(narration.get('segments') or [])} line(s) "
        f"in voice {voice}",
        flush=True,
    )
    return placed


def mux_audio(
    video: Path,
    bgm: Path | None,
    placed: list[tuple[Path, float]],
    total: float,
    workdir: Path,
) -> Path:
    """Music under narration, each line at its own anchor.

    Returns the input untouched when there is nothing to add.
    """
    if not bgm and not placed:
        return video
    out = workdir / "tour_audio.mp4"
    cmd: list[str] = ["ffmpeg", "-y", "-i", str(video)]
    filters: list[str] = []

    bgm_idx = None
    if bgm:
        bgm_idx = 1
        cmd += ["-stream_loop", "-1", "-i", str(bgm)]
        fade_start = max(0.0, total - 2.0)
        level = MUSIC_BED_LOUDNORM if placed else f"volume={MUSIC_VOL_ALONE}"
        filters.append(
            f"[{bgm_idx}:a]atrim=0:{total:.3f},{level},"
            f"afade=t=out:st={fade_start:.3f}:d=2,{STEREO_48K}[bg]"
        )

    vo_labels: list[str] = []
    for n, (wav, start) in enumerate(placed):
        i = (bgm_idx or 0) + 1 + n
        cmd += ["-i", str(wav)]
        ms = int(round(start * 1000))
        filters.append(f"[{i}:a]{VO_LOUDNORM},{STEREO_48K},adelay={ms}|{ms}[d{n}]")
        vo_labels.append(f"[d{n}]")

    if vo_labels:
        # Segments never overlap, so sum them; amix's default normalize would
        # divide every line by the number of lines instead.
        filters.append(
            f"{''.join(vo_labels)}amix=inputs={len(vo_labels)}:duration=longest:"
            f"normalize=0,apad=whole_dur={total:.3f}[vo]"
        )
        if bgm:
            filters.append("[vo]asplit=2[vo1][vosc]")
            # sidechaincompress stops at the shorter input, which truncated the
            # music the first time this ran; apad restores the full length.
            filters.append(
                "[bg][vosc]sidechaincompress=threshold=0.03:ratio=12:"
                f"attack=15:release=350,apad=whole_dur={total:.3f}[duck]"
            )
            filters.append(
                "[duck][vo1]amix=inputs=2:duration=first:normalize=0,"
                "alimiter=limit=0.95[a]"
            )
        else:
            filters.append("[vo]alimiter=limit=0.95[a]")
    else:
        filters.append("[bg]anull[a]")

    cmd += [
        "-filter_complex", ";".join(filters),
        "-map", "0:v:0", "-map", "[a]",
        "-t", f"{total:.3f}",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        str(out),
    ]
    subprocess.run(cmd, check=True, cwd=str(REPO_ROOT), timeout=600)
    return out


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
        #    vision labels and avoid re-billing the vision model on repeat renders.
        photos = sb_get(
            "listing_photos",
            {
                "select": "id,storage_path,sort_order,width,height,ai_tags,tagged_at,"
                          "enhanced_path,enhanced_status",
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
            # 2026-08-03: read the ENHANCED file when an admin approved it.
            # `storage_path` stays the provenance record either way, so the
            # photo_records entry below still points at the original row.
            read_path = approved_enhanced_path(p) or path
            sort_i = int(p.get("sort_order") or 0)
            pid = p["id"]
            ext = Path(read_path).suffix or ".jpg"
            dest = workdir / f"{sort_i:03d}_{pid}{ext}"
            storage_download(PHOTO_BUCKET, read_path, dest)
            photo_paths.append(dest)
            probed = probe_dims(dest)
            photo_records.append({
                "probe_w": probed[0] if probed else None,
                "probe_h": probed[1] if probed else None,
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
        # 2026-07-28: the feed card is 1:1, so the tour is always rendered SQUARE
        # regardless of source orientation — the square canvas is the least-
        # upscaling shape for both landscape and portrait FMLS photos, and the
        # card no longer letterboxes anything. `want_landscape` /
        # `landscape_ratio` are still computed because they're logged below and
        # used by the shot planner's framing decisions.
        # 2026-08-03: TWO renders, one per surface. Owner: "需要分一个 ios 一个 web".
        #
        # Since 2026-07-28 we rendered SQUARE only, because the mobile feed card's
        # media block is 1:1. But web (`/browse`, `/v/...`) plays a 9:16 or 16:9
        # card and its loaders never even SELECT cf_video_id_square — so a
        # square-only listing (5122 Lower Creek Street) has literally no uid web
        # can read and the video just doesn't play there.
        #
        # One asset cannot serve both without letterboxing one of them, so:
        #   square    -> cf_video_id_square    -> iOS feed card
        #   landscape -> cf_video_id_landscape -> web
        # Web gets landscape rather than portrait because every production FMLS
        # photo set is horizontal; portrait would blur-letterbox ~30% of frame.
        # The job may target ONE surface (the admin's two buttons), so an iOS
        # re-render leaves the web asset alone. NULL/absent = render both.
        requested = job.get("orientations") or None
        orientations = list(requested) if requested else ["square", "landscape"]
        # NULL = kenburns, so every job queued before the engine column existed
        # renders exactly as it did before.
        engine = job.get("engine") or "kenburns"
        print(
            f"[job {job['id']}] landscape_ratio={landscape_ratio:.2f} "
            f"orientations={orientations} engine={engine}",
            flush=True,
        )

        # 4. Write overlay JSON.
        overlay = build_overlay(listing, len(photos))
        overlay_path = workdir / "overlay.json"
        overlay_path.write_text(json.dumps(overlay, indent=2))

        # 4b. Phase 93: vision-driven shot plan for listing home tours.
        #    Runs Gemini 2.5 Flash on every photo, then photo_selector picks
        #    the 8-14 best in narrative order. Any failure (missing API key,
        #    network, bad JSON) falls back to the legacy "all photos in
        #    sort_order" path — the video still ships.
        #
        #    Phase 95: results are now persisted to `listing_photos.ai_tags`
        #    and `listings.ai_style`. Photos with `tagged_at IS NOT NULL`
        #    reuse the cached tags — repeat renders of the same listing do
        #    zero vision calls unless new photos are uploaded.
        shot_plan_path: Path | None = None
        listing_captions_path: Path | None = None
        try:
            # NOTE: there is deliberately NO api-key gate here.
            #
            # This used to be `if not os.environ.get("ANTHROPIC_API_KEY"): raise`,
            # which was correct when photo_tagger POSTed api.anthropic.com. The
            # tagger was ported to Bedrock (instance role, no key material) but
            # this gate was left behind, so on the EC2 host the vision block
            # raised immediately, the fail-open except swallowed it, and EVERY
            # render silently fell back to the legacy full-length path — no shot
            # plan, no pacing curve, no captions.
            # A gate on a credential the code no longer uses is worse than no
            # gate: it looks like a safety check and is actually a kill switch.
            # The tagger now reads GEMINI_API_KEY (migrated off Bedrock
            # 2026-08-08); a missing key raises RuntimeError inside
            # tag_listing_photos and lands in the fail-open except below.

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
                    f"[job {job['id']}] tagging {len(need_tag)} new photos w/ Gemini vision "
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
            valid_tags = [r for r in tagged if r.get("room_type") and not r.get("error")]
            if not valid_tags:
                raise RuntimeError(
                    f"zero valid vision tags ({len(tagged)} attempted) — "
                    "legacy render instead of a degenerate 1-clip video"
                )
            style = style_info.get("style", "modern")
            # The planner sizes the short beats around how much of a photo a
            # clip can reveal, which needs the photo's shape. The DB column is
            # NULL for most rows, so use what we probed off the local file.
            dims_by_id = {
                r["id"]: (r.get("probe_w"), r.get("probe_h"))
                for r in photo_records
            }
            for t in tagged:
                pw, ph = dims_by_id.get(t.get("id"), (None, None))
                if pw and ph:
                    t["width"], t["height"] = pw, ph
            plan = build_plan(tagged, style, listing_id)
            # 2026-08-01 — NO on-screen text on the listing tour at all.
            #
            # The owner's read: a caption band on the swipe card's video is a
            # wall between the buyer and the house ("不够沉浸"). The video is now
            # a purely visual object; the WORDS moved to Explore, where the
            # buyer opts into reading and gets a caption per photo over the FULL
            # photo set (not just the 8-14 clips the planner picked).
            #
            # `shot["caption"]` is deliberately NOT set: generate.py reads it as
            # `v2_cap` for its ffmpeg drawtext fallback, so leaving it unset is
            # what turns that path off. `captions.json` is not written either,
            # so the HTML→PNG band never renders. Both caption systems are off
            # by absence of input, not by a flag — see `--captions` below.
            #
            # `caption_for_shot` (photo_selector) is no longer imported here —
            # this was its only caller. It still lives in photo_selector.py,
            # where `build_plan` and the Explore gallery's room labels can use
            # it; nothing in the renderer calls it now.
            shot_plan_path = workdir / "shot_plan.json"
            shot_plan_path.write_text(json.dumps({
                "plan": plan,
                "listing": listing,
                "style": style_info,
            }, indent=2))

            # The Phase 100 LISTING caption band used to be built here, writing
            # `captions.json` with one {kicker, txt} per clip. It is GONE
            # (2026-08-01) — see the note above. `listing_captions_path` stays
            # None for the whole listing path, so `--captions` is never passed
            # and generate.py renders no PNG band. The LISTING archetype in
            # `overlay.html` is now unreached from this pipeline; it is left in
            # place rather than deleted so the decision is reversible in one
            # line, and because `overlay.html` still serves 6 bucket archetypes.
            print(
                f"[job {job['id']}] shot plan: style={style} "
                f"clips={len(plan)} (of {len(tagged)} tagged)",
                flush=True,
            )

            # Persist WHICH photos got used, so the admin photo table can answer
            # "is this photo in the video?". The plan is otherwise thrown away
            # with the temp workdir. Clear the whole listing first, then stamp
            # the chosen ones, so a photo dropped by a re-render stops claiming
            # it is in the tour.
            try:
                sb_patch(
                    "listing_photos",
                    {"listing_id": f"eq.{listing_id}"},
                    {"used_in_video_at": None, "used_clip_index": None},
                )
                stamped_at = _now_iso()
                for clip_i, shot in enumerate(plan):
                    pid = shot.get("id")
                    if not pid:
                        continue
                    sb_patch(
                        "listing_photos",
                        {"id": f"eq.{pid}"},
                        {"used_in_video_at": stamped_at, "used_clip_index": clip_i},
                    )
            except Exception:
                # Provenance only — never fail a good render over bookkeeping.
                traceback.print_exc()
        except Exception as e:  # noqa: BLE001
            print(f"[job {job['id']}] shot plan disabled: {e} — falling back to legacy path", flush=True)
            shot_plan_path = None
            listing_captions_path = None

        # 5. Run generate.py — one orientation only (see 3b).
        bgm_choice = pick_bgm()

        def render(orientation: str, out_path: Path) -> None:
            cmd = [
                # Explicit interpreter, NOT bare "python3".
                #
                # generate.py shells out to scripts/caption-render/render.py with
                # `sys.executable`, and that script needs `playwright`, which is
                # installed in the SYSTEM dist-packages only. A bare "python3"
                # resolves through PATH, so whoever launched the worker decides
                # the interpreter: under systemd that's /usr/bin/python3 (fine),
                # but launched from a shell with a venv active it's the venv
                # python, which has no playwright — caption rendering dies and
                # the whole render fails with a bare ffmpeg exit 1.
                # Pin it so the worker behaves the same however it is started.
                PYTHON_BIN,
                str(GENERATE_SCRIPT),
                "--photos",
                str(workdir),
                "--output",
                str(out_path),
                "--listing-overlay",
                str(overlay_path),
            ]
            # 2026-07-28: "square" is a resolution, not one of generate.py's two
            # --orientation choices, so it goes through --resolution (which
            # overrides --orientation). The feed card's media block is 1:1.
            if orientation == "square":
                cmd += ["--resolution", f"{SQUARE_EDGE}x{SQUARE_EDGE}",
                        # Pan only. Left/right travel preserves 100% of each
                        # source photo's HEIGHT — the owner's constraint. A zoom
                        # would crop top/bottom.
                        "--zoom-mode", "pan-lr"]
            else:
                cmd += ["--orientation", orientation]
            # Always explicit: generate.py's own default is kenburns (the only
            # engine that needs nothing but ffmpeg), while the product default
            # is whatever the API route wrote on the row.
            cmd += ["--engine", engine]
            if engine in ("depthflow", "mixed"):
                cmd += ["--depthflow-python", DEPTHFLOW_PYTHON]
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

        # Render + upload each orientation. A failure in either aborts the job
        # (the except below marks render_jobs failed), so we never leave a row
        # claiming ready with only half its uids.
        uids: dict[str, str] = {}
        for orientation in orientations:
            out_path = workdir / f"out_{orientation}.mp4"
            render(orientation, out_path)
            uids[orientation] = cf_upload(
                out_path,
                meta={
                    "name": f"{listing.get('address', 'Listing')} — home tour ({orientation})",
                    "listing_id": listing_id,
                    "orientation": orientation,
                },
            )
            print(f"[job {job['id']}] uploaded {orientation} to CF: {uids[orientation]}", flush=True)

        # 7. Update listing_videos: write ONLY the columns we actually rendered.
        #
        # Do NOT null the others. A single-surface job (the admin's per-surface
        # buttons) renders e.g. square only, and blanking cf_video_id_landscape
        # would destroy the web asset the other button just produced — the exact
        # opposite of splitting the two surfaces.
        #
        # For a full rebuild (`orientations` unset -> both), the API route has
        # already deleted the old row + its CF assets, so there is no stale uid to
        # clear here either.
        col_for = {
            "portrait": "cf_video_id",
            "landscape": "cf_video_id_landscape",
            "square": "cf_video_id_square",
        }
        patch_body: dict[str, Any] = {
            "external_url": None,
            "status": "ready",
        }
        for orient, uid in uids.items():
            patch_body[col_for[orient]] = uid
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
    # Phase 85: canonical 14 from lib/poi/types.ts INTENT_BUCKETS,
    # plus "amenities" (phase56) — the community's own facilities.
    "amenities": "Community Amenities",
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
    "amenities": "LIFESTYLE",
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
                "select": "id,storage_path,poi_id,enhanced_path,enhanced_status,enhanced_at,enhanced_meta,width_px,height_px,outpainted_path,outpaint_status,outpainted_at,ai_tags,"
                          "pois!inner(display_name,primary_type,types)",
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
        # Owner 2026-08-17: tagger-unusable photos never enter the video pool.
        # Belt-and-braces: generated_videos.input_photo_ids was curated before
        # insert, but a stale job (enqueued pre-filter) must not render unusable
        # frames either.
        unusable = [
            pid
            for pid in input_photo_ids
            if (
                (by_id[pid].get("ai_tags") or {}).get("usable") is False
            )
        ]
        if unusable:
            raise RuntimeError(
                f"{len(unusable)} unusable photos in job: {unusable[:3]}"
            )

        # 2. Download in the exact order the server action selected them.
        photo_paths: list[Path] = []
        for i, pid in enumerate(input_photo_ids, start=1):
            # Same approved-enhanced rule as the listing path.
            path = approved_enhanced_path(by_id[pid]) or by_id[pid]["storage_path"]
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
            PYTHON_BIN, str(GENERATE_SCRIPT),
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


# ── outpainting to 9:16 (2026-08-19) ────────────────────────────────────
#
# A community tour renders 1080x1920 and the centre crop was discarding a
# median 63% of every frame — on Aberdeen's clubhouse it removed the stone
# tower and left a tree as the subject. Resolution was never the problem
# (median source 4000x3024); the aspect ratio was.
#
# Two steps, because one does not work. Handing a 2.16:1 panorama straight to
# the model leaves it filling 74% of the output and it regenerates the whole
# scene. Cropping to 3:4 first, with real pixels, leaves ~25% to invent and
# measured drift against the source fell from 34/255 to 7.4.
#
# Same queue shape as enhance, and it runs BEFORE it: outpaint fixes framing
# and returns 768x1376, then Real-ESRGAN takes that to the canvas.

OUTPAINT_MODEL = os.environ.get("GEMINI_IMAGE_MODEL", "gemini-3.1-flash-image")
OUTPAINT_TIMEOUT_SEC = 120
# Matches OUTPAINT_MIN_CROP_LOSS in apps/web/lib/poi/outpaint.ts. A 3:4
# portrait loses 0.25 and is left alone; a square (0.44) is worth fixing.
OUTPAINT_MIN_CROP_LOSS = 0.35

FILL_HINT = {
    "landscape": "more open sky above, more of the same ground cover below",
    "storefront": "more sky and roofline above, more of the pavement or forecourt below",
    "interior": "more ceiling and lighting above, more of the same floor below",
    "aerial": "more of the same terrain above and below",
    "food": "more of the table surface above and below",
}


def crop_loss(w: int, h: int) -> float:
    """Fraction of the frame a centre crop to the CANVAS throws away.

    Measured against the canvas, not against outpainting's own 9:16 target: this
    number decides whether to spend a generation, so it has to answer "how much
    does the film actually lose", and the 0.685 canvas discards far less than
    9:16 did. A 3:4 portrait now loses 9% (was 25%) and a square 31% (was 44%),
    so both fall under OUTPAINT_MIN_CROP_LOSS and are left alone.
    """
    if not (w > 0 and h > 0):
        return 0.0
    aspect, target = w / h, TOUR_CANVAS_W / TOUR_CANVAS_H
    return 1 - target / aspect if aspect > target else 1 - aspect / target


def claim_outpaint_job() -> dict[str, Any] | None:
    rows = sb_get(
        "poi_photos",
        {
            "select": "id,storage_path,width_px,height_px,ai_tags",
            "outpaint_status": "eq.queued",
            "order": "id.asc",
            "limit": "1",
        },
    )
    if not rows:
        return None
    row = rows[0]
    # No `updated_at` here: poi_photos has no such column, unlike the tables
    # the other claim helpers touch. Including it 400s the whole PATCH
    # ("Could not find the 'updated_at' column"), which looks like the queue
    # never being claimed rather than like an error.
    updated = sb_patch(
        "poi_photos",
        {"id": f"eq.{row['id']}", "outpaint_status": "eq.queued"},
        {"outpaint_status": "processing"},
    )
    return row if updated else None


def process_outpaint(row: dict[str, Any]) -> None:
    photo_id = row["id"]
    workdir = Path(tempfile.mkdtemp(prefix=f"outpaint-{photo_id[:8]}-"))
    try:
        from PIL import Image

        w, h = row.get("width_px") or 0, row.get("height_px") or 0
        loss = crop_loss(w, h)
        if loss <= OUTPAINT_MIN_CROP_LOSS:
            # Already close enough to 9:16 — nothing to gain, and every call
            # costs money (owner 2026-08-19: skip photos already in good shape).
            sb_patch("poi_photos", {"id": f"eq.{photo_id}"}, {
                "outpaint_status": "skipped",
                "outpaint_meta": {"crop_loss": round(loss, 3), "reason": "already well framed"},
                "outpainted_at": _now_iso(),
            })
            print(f"[outpaint {photo_id}] skipped — {loss:.0%} loss", flush=True)
            return

        src = workdir / "src.jpg"
        storage_download(PHOTO_BUCKET, row["storage_path"], src)

        # Step 1: real pixels only — crop to 3:4 about the centre.
        im = Image.open(src).convert("RGB")
        target_w = min(im.width, round(im.height * 3 / 4))
        left = max(0, (im.width - target_w) // 2)
        crop = im.crop((left, 0, left + target_w, im.height))
        crop_path = workdir / "crop.jpg"
        crop.save(crop_path, quality=95)

        category = (row.get("ai_tags") or {}).get("primary_category")
        hint = FILL_HINT.get(category, "whatever plausibly continues the scene above and below")
        prompt = (
            "Outpaint this photograph to a 9:16 vertical frame. The supplied image must "
            "remain the centre of the result, unchanged and uncropped. Generate ONLY the "
            f"strips above and below it: {hint}. Match the existing grain, focus, light "
            "and colour exactly. Do not alter, move, restyle or re-render anything already "
            "in the photograph — in particular, reproduce any sign, lettering or logo "
            "exactly as it appears or leave it out of the new areas entirely. "
            "Add no text, no people, no vehicles."
        )
        b64 = base64.b64encode(crop_path.read_bytes()).decode()
        resp = requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{OUTPAINT_MODEL}:generateContent",
            json={
                "contents": [{"role": "user", "parts": [
                    {"text": prompt},
                    {"inline_data": {"mime_type": "image/jpeg", "data": b64}},
                ]}],
                "generationConfig": {"imageConfig": {"aspectRatio": "9:16"}},
            },
            headers={
                "x-goog-api-key": os.environ["GEMINI_API_KEY"],
                "content-type": "application/json",
            },
            timeout=OUTPAINT_TIMEOUT_SEC,
        )
        if not resp.ok:
            raise RuntimeError(f"outpaint HTTP {resp.status_code}: {resp.text[:200]}")
        payload = resp.json()

        parts = (payload.get("candidates") or [{}])[0].get("content", {}).get("parts", [])
        inline = next((p.get("inlineData") or p.get("inline_data") for p in parts
                       if p.get("inlineData") or p.get("inline_data")), None)
        if not inline:
            raise RuntimeError("model returned no image")

        out_path = workdir / "out.png"
        out_path.write_bytes(base64.b64decode(inline["data"]))
        out_im = Image.open(out_path)

        dest = f"outpainted/{Path(row['storage_path']).with_suffix('.png')}"
        storage_upload(PHOTO_BUCKET, dest, out_path)

        usage = payload.get("usageMetadata", {})
        sb_patch("poi_photos", {"id": f"eq.{photo_id}"}, {
            "outpainted_path": dest,
            "outpaint_status": "ready",
            "outpaint_meta": {
                "model": OUTPAINT_MODEL,
                "width": out_im.width,
                "height": out_im.height,
                "crop_loss_before": round(loss, 3),
                "output_tokens": usage.get("candidatesTokenCount"),
            },
            "outpaint_error": None,
            "outpainted_at": _now_iso(),
        })
        print(f"[outpaint {photo_id}] ready {out_im.width}x{out_im.height} "
              f"(was {w}x{h}, {loss:.0%} would have been cropped)", flush=True)
    except Exception as exc:  # noqa: BLE001
        traceback.print_exc()
        sb_patch("poi_photos", {"id": f"eq.{photo_id}"}, {
            "outpaint_status": "failed",
            "outpaint_error": f"{type(exc).__name__}: {exc}"[:500],
            "outpainted_at": _now_iso(),
        })
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


# ── photo enhancement (2026-08-03) ──────────────────────────────────────
#
# No new queue table: `{listing,poi}_photos.enhanced_status` IS the queue
# ('queued' → 'processing' → 'ready'), claimed with the same optimistic-lock
# PATCH the render queues use. A separate enhance_jobs table would duplicate the
# state that has to live on the photo row anyway (the admin UI reads it there).
#
# Enhanced files land next to the original in the same bucket under
# `enhanced/<original path>`, so bucket policy and cleanup are unchanged.

ENHANCE_SCRIPT = Path(__file__).resolve().parent / "enhance.py"
ENHANCE_TABLES = ("listing_photos", "poi_photos")
# Cap on one claimed group. Exposure matching wants the whole listing, but a
# 60-photo listing at ~90 s/photo on CPU would hold the queue for 90 minutes and
# starve any render job queued behind it.
# ponytail: fixed cap. Make it adaptive only if a real listing exceeds it often.
ENHANCE_GROUP_MAX = 24
ENHANCE_TIMEOUT_SEC = 300     # per photo in the group


def _enhance_select(table: str) -> str:
    """Columns to claim with, per table.

    The reframe columns exist ONLY on `poi_photos` — outpainting is a
    community-tour feature and `20260819100000_poi_photos_outpaint.sql` altered
    that table alone. Asking `listing_photos` for them is a PostgREST 400, and
    because `listing_photos` is first in `ENHANCE_TABLES` that 400 raised before
    `poi_photos` was ever polled: it killed the enhance loop for BOTH tables
    from phase71 until this fix, with photos sitting in `queued` and no error
    recorded against any of them.
    """
    cols = ["id", "storage_path", "enhanced_preset"]
    if table == "poi_photos":
        cols += ["outpainted_path", "outpaint_status"]
    if table == "listing_photos":
        cols += ["listing_id"]
    return ",".join(cols)


def claim_enhance_job() -> tuple[str, list[dict[str, Any]]] | None:
    """Claim a GROUP of queued photos. Returns (table, rows).

    A group is one listing's queued photos (poi_photos have no listing, so they
    come one at a time). Grouping is not an optimisation — exposure matching
    targets the MEDIAN brightness of the listing, which is unknowable one photo at
    a time. It also amortises the 66 MB Real-ESRGAN model load across the group.
    """
    for table in ENHANCE_TABLES:
        select = _enhance_select(table)
        rows = sb_get(
            table,
            {
                "select": select,
                "enhanced_status": "eq.queued",
                "order": "id.asc",
                "limit": "1",
            },
        )
        if not rows:
            continue
        first = rows[0]
        group = [first]
        if table == "listing_photos" and first.get("listing_id"):
            group = sb_get(table, {
                "select": select,
                "enhanced_status": "eq.queued",
                "listing_id": f"eq.{first['listing_id']}",
                "order": "id.asc",
                "limit": str(ENHANCE_GROUP_MAX),
            }) or group
        claimed = []
        for row in group:
            if sb_patch(
                table,
                {"id": f"eq.{row['id']}", "enhanced_status": "eq.queued"},
                {"enhanced_status": "processing"},
            ):
                claimed.append(row)
        if claimed:
            return table, claimed
    return None


def process_enhance_job(table: str, rows: list[dict[str, Any]]) -> None:
    """Enhance one claimed group. Each row's DB state is updated independently so
    one bad photo fails alone instead of failing its listing-mates."""
    if isinstance(rows, dict):          # tolerate the old single-row call shape
        rows = [rows]
    preset = rows[0].get("enhanced_preset") or "default"
    workdir = Path(tempfile.mkdtemp(prefix=f"enhance-{rows[0]['id'][:8]}-"))
    print(f"[enhance {table}] group of {len(rows)} preset={preset}", flush=True)

    try:
        srcs, dests, ok_rows = [], [], []
        for row in rows:
            try:
                # Upscale the REFRAMED file when outpainting produced one:
                # the model returns 768x1376 and the canvas is 1080x1920, so
                # this pass is what closes the gap. Enhancing the original
                # instead would upscale a frame the render is not going to use.
                source = (
                    row["outpainted_path"]
                    if row.get("outpaint_status") == "ready" and row.get("outpainted_path")
                    else row["storage_path"]
                )
                ext = Path(source).suffix or ".jpg"
                src = workdir / f"{row['id']}{ext}"
                storage_download(PHOTO_BUCKET, source, src)
                srcs.append(src)
                dests.append(workdir / f"{row['id']}-out.jpg")
                ok_rows.append(row)
            except Exception as exc:  # noqa: BLE001
                _fail_enhance(table, row["id"], exc)

        if not ok_rows:
            return

        proc = subprocess.run(
            [PYTHON_BIN, str(ENHANCE_SCRIPT), "--group-json",
             json.dumps({"preset": preset,
                         "pairs": [[str(s), str(d)] for s, d in zip(srcs, dests)]})],
            capture_output=True, text=True, timeout=ENHANCE_TIMEOUT_SEC * len(ok_rows),
        )
        if proc.returncode != 0:
            raise RuntimeError(f"enhance.py failed: {proc.stderr[-500:] or proc.stdout[-500:]}")
        metas = json.loads(proc.stdout.strip().splitlines()[-1])

        for row, dest, meta in zip(ok_rows, dests, metas):
            try:
                if not dest.exists():
                    raise RuntimeError("enhance.py produced no output")
                dest_path = f"enhanced/{Path(row['storage_path']).with_suffix('.jpg')}"
                storage_upload(PHOTO_BUCKET, dest_path, dest)
                sb_patch(table, {"id": f"eq.{row['id']}"}, {
                    "enhanced_path": dest_path,
                    # 'ready' NOT 'approved' — the render only reads approved
                    # files, so nothing changes in the product until the owner
                    # clicks Approve.
                    "enhanced_status": "ready",
                    "enhanced_preset": preset,
                    "enhanced_meta": {**meta, "bytes": dest.stat().st_size},
                    "enhanced_at": _now_iso(),
                    "enhanced_error": None,
                })
                print(f"[enhance {table}/{row['id']}] ready "
                      f"{meta.get('width')}x{meta.get('height')} {meta.get('chain')}", flush=True)
            except Exception as exc:  # noqa: BLE001
                traceback.print_exc()
                _fail_enhance(table, row["id"], exc)
    except Exception as exc:  # noqa: BLE001
        traceback.print_exc()
        for row in rows:
            _fail_enhance(table, row["id"], exc)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def _fail_enhance(table: str, photo_id: str, exc: Exception) -> None:
    try:
        sb_patch(table, {"id": f"eq.{photo_id}"}, {
            "enhanced_status": "failed",
            "enhanced_error": str(exc)[:500],
            "enhanced_at": _now_iso(),
        })
    except Exception:
        traceback.print_exc()


def wide_enough_to_travel(row: dict[str, Any]) -> bool:
    """Does the un-reframed photo already fill the canvas, with room to move?

    Two conditions, and both are about the CANVAS being 0.685 rather than 9:16:

      - it clears MAX_UPSCALE, so it is sharp enough without help, and
      - it is WIDER than the canvas, so a cover crop overflows horizontally and
        `cover_travel` has somewhere to sweep.

    Reframing to 9:16 (0.558) satisfies neither on this canvas. It is NARROWER
    than the frame, so the cover crop overflows vertically instead and the
    travel axis flips to 'y' — measured on Aberdeen, 8 of 27 clips were planned
    as horizontal pans with literally zero horizontal room, every one of them a
    reframed photo. Their originals are 1.33-2.16 wide and need at most 1.35x
    upscale; several downscale. Owner 2026-08-19 saw it coming from the spec
    alone: "if we cut the original pic to 2:3 to fit into the ios card, then how
    do we do the effect such as pan, there is no more room right?"
    """
    w, h = row.get("width_px") or 0, row.get("height_px") or 0
    meta = row.get("enhanced_meta") or {}
    if row.get("enhanced_status") == "approved" and meta.get("width"):
        w, h = meta["width"], meta["height"]
    if not (w > 0 and h > 0):
        return False
    upscale = max(TOUR_CANVAS_W / w, TOUR_CANVAS_H / h) * 1.1  # ZOOM_HEADROOM
    return upscale <= 2.0 and (w / h) > (TOUR_CANVAS_W / TOUR_CANVAS_H)


def approved_enhanced_path(row: dict[str, Any]) -> str | None:
    """The path a render should actually read for this photo row.

    Preference order is enhanced → outpainted → original, EXCEPT that the
    reframe is skipped entirely when the original is already wide enough to
    fill the canvas and pan across it (`wide_enough_to_travel`). Reframing is
    the fallback for a photo that cannot fill the frame — Lambert High's 512px
    facade — not the default it was while the canvas was 9:16.

    Enhanced still requires approval — that gate is unchanged. Outpainted does
    not: where it IS used, it is the only thing standing between a 512px source
    and no clip at all, and the photo table can still reject the photo outright.

    Callers fall back to `storage_path`.
    """
    enhanced = row.get("enhanced_status") == "approved" and row.get("enhanced_path")
    reframed = (
        row.get("outpaint_status") == "ready"
        and row.get("outpainted_path")
        and not wide_enough_to_travel(row)
    )

    # An enhanced file only wins if it was made FROM the reframed one. Both
    # derived files can exist and the order they were produced in decides:
    # enhancement ran on Aberdeen's photos before outpainting existed, so a
    # naive "enhanced first" rule handed the render an upscaled CROP and the
    # reframe was never read — 15 reframed photos, zero of them on screen.
    if enhanced and reframed:
        enhanced_at = row.get("enhanced_at") or ""
        outpainted_at = row.get("outpainted_at") or ""
        return str(row["enhanced_path"] if enhanced_at > outpainted_at else row["outpainted_path"])
    if enhanced:
        return str(row["enhanced_path"])
    if reframed:
        return str(row["outpainted_path"])
    return None


# ── photo clip (photo_clips depthflow/kenburns, 2026-08-17) ─────────────
#
# The community-tour pipeline enqueues per-photo clips in `photo_clips`
# with engine seedance|depthflow|kenburns. seedance rows are consumed by
# scripts/seedance-worker (OpenRouter, paid). depthflow/kenburns rows are
# consumed HERE — a single photo rendered locally by generate.py, uploaded
# to the ai-videos bucket as clips/<photo_id>.mp4 (same path shape the
# seedance worker uses), then the row flips to ready.
#
# Priority: above photo enhancement (owner clicked Generate and is
# watching), below the bigger interactive render jobs.

def claim_photo_clip() -> dict[str, Any] | None:
    """Claim the oldest pending depthflow/kenburns photo_clips row."""
    rows = sb_get(
        "photo_clips",
        {
            "select": "id,photo_id,engine,duration_s,status,move",
            "status": "eq.pending",
            "or": "(engine.eq.depthflow,engine.eq.kenburns)",
            "order": "created_at.asc",
            "limit": "1",
        },
    )
    if not rows:
        return None
    row = rows[0]
    updated = sb_patch(
        "photo_clips",
        {"id": f"eq.{row['id']}", "status": "eq.pending"},
        {"status": "processing", "updated_at": _now_iso()},
    )
    if not updated:
        return None
    return row


def process_photo_clip(row: dict[str, Any]) -> None:
    clip_id = row["id"]
    photo_id = row["photo_id"]
    engine = row.get("engine") or "kenburns"
    workdir = Path(tempfile.mkdtemp(prefix=f"clip-{clip_id[:8]}-"))
    print(f"[clip {clip_id}] photo={photo_id} engine={engine}", flush=True)

    try:
        # 1. Fetch the photo (respect approved enhancement like other renders).
        photos = sb_get(
            "poi_photos",
            {
                "select": "id,storage_path,enhanced_path,enhanced_status,enhanced_at,enhanced_meta,width_px,height_px,outpainted_path,outpaint_status,outpainted_at",
                "id": f"eq.{photo_id}",
                "limit": "1",
            },
        )
        if not photos:
            raise RuntimeError(f"poi_photo {photo_id} not found")
        p = photos[0]
        read_path = approved_enhanced_path(p) or p["storage_path"]
        ext = Path(read_path).suffix or ".jpg"
        # Filename MUST be the photo UUID: generate.py --shot-plan matches
        # plan entries by sort_order prefix OR filename stem against the
        # plan's `id` field. A plain `photo.jpg` matches neither, so the
        # plan "matched zero photos" and every DA+KB clip failed with
        # CalledProcessError (owner 2026-08-17, failed from Re-render all).
        src = workdir / f"{photo_id}{ext}"
        storage_download(PHOTO_BUCKET, read_path, src)
        print(f"[clip {clip_id}] downloaded {read_path}", flush=True)

        # 2. Render one clip with generate.py.
        duration = float(row.get("duration_s") or 3.0)
        out_path = workdir / "clip.mp4"
        cmd = [
            PYTHON_BIN,
            str(GENERATE_SCRIPT),
            "--photos", str(workdir),
            "--output", str(out_path),
            "--duration-per-photo", str(duration),
            "--engine", engine,
            # Owner 2026-08-17: every clip must fill the frame, no black bars.
            # The explicit canvas + --cover-crop below is what makes a photo of
            # any shape fill it edge-to-edge (the fit-inside blur-letterbox path
            # would pad with black bands). DepthFlow gets the same aspect up
            # front in render_parallax so its parallax travel isn't cropped away
            # by the cover crop.
            "--resolution", f"{TOUR_CANVAS_W}x{TOUR_CANVAS_H}",
            "--cover-crop",
        ]
        # Owner 2026-08-17: "DA+KB 每张图片的效果都是zoom in - fix it 应该有很多种效果".
        # Without a shot plan, generate.py falls back to pick_mode(i, 'auto') =
        # [zoom-in, zoom-out] for every clip. The move now comes from the tour
        # Scheduler, which picks it from the photo's subject AND the neighbouring
        # clip — something a single-clip render cannot see. Rows planned before
        # the orchestrator (2026-08-17) have no move and keep the old per-photo
        # rotation: deterministic, varied, but blind to its neighbours.
        # Every name here must be one kenburns_filter_v2 actually implements.
        # This list used to end "zoom-in", "zoom-out" — v1 names with no branch
        # in the v2 filter, so 2 of these 9 rendered as a slow push-in whatever
        # they claimed (owner 2026-08-17: a planned zoom-out came out pushing
        # in). Keep it in sync with KEN_BURNS_MOVES in
        # apps/web/lib/poi/tour-orchestrator/scheduler.ts.
        POI_CLIP_MODES = [
            "push_in", "push_in_slow", "pull_back", "pan_lr", "pan_rl",
            "push_pan_lr", "push_pan_rl", "tilt_td",
        ]
        mode = (row.get("move") or "").strip() or \
            POI_CLIP_MODES[int(photo_id[:8], 16) % len(POI_CLIP_MODES)]
        shot_plan_path = workdir / "clip_shot_plan.json"
        shot_plan_path.write_text(json.dumps({"plan": [{
            "id": photo_id,
            "sort_order": 0,
            "room_type": None,
            "is_master": False,
            "subject_label": None,
            "subject_bbox": None,
            "ai_caption": "",
            "hero_score": 0.5,
            "quality": 0.5,
            "duration_s": duration,
            "mode": mode,
            "is_hero": True,
        }]}))
        cmd += ["--shot-plan", str(shot_plan_path)]
        if engine == "depthflow":
            cmd += ["--depthflow-python", DEPTHFLOW_PYTHON]
        print(f"[clip {clip_id}] running: {' '.join(cmd)}", flush=True)
        subprocess.run(cmd, check=True, cwd=str(REPO_ROOT), timeout=600)
        if not out_path.exists():
            raise RuntimeError("generate.py produced no output")

        # 3. Upload to the clip-renders bucket (LOCAL render output, NOT the
        #    paid ai-videos bucket). Path includes the engine so a seedance
        #    and a depthflow/kenburns clip of the same photo never collide.
        storage_path = f"clips/{photo_id}-{engine}.mp4"
        storage_upload("clip-renders", storage_path, out_path, content_type="video/mp4")
        print(f"[clip {clip_id}] uploaded {storage_path}", flush=True)

        sb_patch(
            "photo_clips",
            {"id": f"eq.{clip_id}"},
            {
                "status": "ready",
                "storage_path": storage_path,
                "error": None,
                "updated_at": _now_iso(),
            },
        )
        print(f"[clip {clip_id}] ready", flush=True)
    except Exception as e:  # noqa: BLE001
        err = f"{type(e).__name__}: {e}"
        print(f"[clip {clip_id}] FAILED: {err}", flush=True)
        traceback.print_exc()
        try:
            sb_patch(
                "photo_clips",
                {"id": f"eq.{clip_id}"},
                {"status": "failed", "error": err[:500], "updated_at": _now_iso()},
            )
        except Exception:
            traceback.print_exc()
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


# ── tour_assemblies: final concat of approved photo clips (2026-08-17) ─────
# The TourPipeline Assemble step computes the final shot list (every POI 1-2
# photos, ready clips only) and the owner approves it; this worker downloads
# the ready clips, concatenates with crossfade, uploads to Cloudflare Stream,
# and marks the assembly ready. Same claim/process pattern as bucket jobs.

def claim_assembly() -> dict[str, Any] | None:
    rows = sb_get(
        "tour_assemblies",
        {
            "select": "id,community_id,run_id,ordered_clips,narration,bgm,status,community:communities(name)",
            "status": "eq.pending",
            "order": "created_at.asc",
            "limit": "1",
        },
    )
    if not rows:
        return None
    row = rows[0]
    updated = sb_patch(
        "tour_assemblies",
        {"id": f"eq.{row['id']}", "status": "eq.pending"},
        {"status": "processing", "updated_at": _now_iso()},
    )
    if not updated:
        return None
    return row


# Bold face for the place labels. The list in ken-burns/generate.py is
# Linux-only (dejavu, liberation) and this worker runs on the Mac mini, where
# neither exists — which is why its caption filter silently returns "" here.
LABEL_FONTS = (
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Helvetica.ttc",
    "/Library/Fonts/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
)


def _label_font() -> str | None:
    return next((f for f in LABEL_FONTS if os.path.exists(f)), None)


# 35% black behind the text. Low, because legibility is carried by the glyph
# shadow below; the scrim only has to stop a blown-out sky from swallowing it.
SCRIM_ALPHA = 88


def _render_label_png(
    name: str, distance: str, w: int, h: int, font_path: str, dest: Path
) -> None:
    """One transparent full-frame PNG carrying a place card.

    Pillow rather than ffmpeg's drawtext: the ffmpeg on this Mac mini is built
    without libfreetype, so `drawtext` does not exist as a filter at all
    (`ffmpeg -filters` lists none). That is the same reason the repo already
    renders listing captions to PNG and composites them — see
    scripts/caption-render.

    TOP RIGHT, right-aligned, two lines: the place name over its distance.
    Owner 2026-08-19: "can you put it to the top right, including name and
    distance… also it does not look elegant."

    What this replaces sat low-left in a hard black box, which on the card was
    both cropped by the cover fit and buried under `CommunityFace`'s own name
    and Explore chrome. The top of the frame is the one region no card chrome
    occupies, and the cover crop takes only ~1% off each end at the 0.685 canvas
    (14% on an SE), so a 5.5% inset clears it on every device.

    The panel is 38% black rather than a hard box, the name is semibold white,
    and the distance sits under it at 62% white, one size step down — a stack,
    so the distance reads as a fact about the place rather than a suffix glued
    to its name.
    """
    from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

    inset_x = round(w * 0.055)
    inset_y = round(h * 0.055)
    max_text_w = round(w * 0.52)

    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # WRAP a long name; do not shrink it away. "Publix Super Market at The
    # Village Shoppes at Windermere" is 54 characters — shrinking that to one
    # line drove the type to 17px and stretched the panel across most of the
    # frame, which is the opposite of elegant. Two lines at full size read
    # better and keep the card compact. Only a name too long for two lines
    # steps the size down, and it is never truncated: the label exists to
    # answer "where is this".
    size = round(w * 0.034)
    while True:
        font = ImageFont.truetype(font_path, size)
        lines = _wrap_to_width(draw, name, font, max_text_w)
        if len(lines) <= 2 or size <= round(w * 0.024):
            break
        size -= 2
    line_h = round(size * 1.18)
    sub_size = max(14, round(size * 0.70))
    sub_font = ImageFont.truetype(font_path, sub_size)

    gap = round(size * 0.24) if distance else 0
    block_w = max(
        max(draw.textlength(l, font=font) for l in lines),
        draw.textlength(distance, font=sub_font) if distance else 0,
    )
    block_h = line_h * len(lines) + gap + (sub_size if distance else 0)

    right, top = w - inset_x, inset_y

    # A CORNER SCRIM, not a panel.
    #
    # The card used to sit on a 38%-black rounded rectangle, which made its
    # legibility a function of the photo behind it. On the bright shots — a
    # white sky, the clubhouse ceiling — 38% black over luma 240 lands at 149
    # and white text on mid-grey barely reads; on the dark shots the same panel
    # vanishes and the text is crisp. Cutting between the two every two seconds
    # is what the owner saw as the label "flashing for the first few photos"
    # (2026-08-20). It was never absent — it was washing in and out.
    #
    # A gradient has no shape to notice: invisible on a dark photo (dark over
    # dark), doing the work on a bright one, so the card looks the same on every
    # shot. Two things make it a corner treatment rather than a band across the
    # frame: it holds full strength only down to just past the text and then
    # eases out, and it fades away to the LEFT, where there is no text to
    # protect and no reason to dim the picture.
    #
    # Built by multiplying a column by a row rather than per-pixel: the frame is
    # 1.7M pixels and there is one of these per clip.
    hold = top + block_h + round(size * 0.3)
    fade = max(1, round(block_h * 1.5))
    col = Image.new("L", (1, h), 0)
    for y in range(h):
        if y <= hold:
            v = 1.0
        elif y < hold + fade:
            v = (1 - (y - hold) / fade) ** 2
        else:
            break
        col.putpixel((0, y), round(SCRIM_ALPHA * v))
    x0, x1 = round(w * 0.16), round(w * 0.42)
    row = Image.new("L", (w, 1), 0)
    for x in range(x0, w):
        row.putpixel((x, 0), 255 if x > x1 else round(255 * ((x - x0) / (x1 - x0)) ** 1.4))
    scrim = Image.new("RGBA", (w, h), (0, 0, 0, 255))
    scrim.putalpha(ImageChops.multiply(col.resize((w, h)), row.resize((w, h))))
    img = Image.alpha_composite(img, scrim)

    # A soft shadow under the glyphs, for the shots a scrim alone cannot hold —
    # a blown-out sky reaches luma 255 and the ramp is at its weakest by the
    # second line. Blurred rather than offset: an offset copy reads as a
    # mistake at this size, a blur reads as depth.
    shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow)

    def _lines(d: Any, fill_name: tuple[int, int, int, int], fill_sub: tuple[int, int, int, int]):
        for i, line in enumerate(lines):
            d.text((right, top + i * line_h), line, font=font, fill=fill_name, anchor="ra")
        if distance:
            d.text(
                (right, top + line_h * len(lines) + gap),
                distance,
                font=sub_font,
                fill=fill_sub,
                anchor="ra",
            )

    _lines(sdraw, (0, 0, 0, 160), (0, 0, 0, 128))
    shadow = shadow.filter(ImageFilter.GaussianBlur(max(2, round(size * 0.26))))
    img = Image.alpha_composite(img, shadow)

    _lines(ImageDraw.Draw(img), (255, 255, 255, 250), (255, 255, 255, 190))
    img.save(dest)


def _wrap_to_width(draw: Any, text: str, font: Any, max_w: float) -> list[str]:
    """Greedy word wrap. A single word wider than `max_w` gets its own line."""
    lines: list[str] = []
    line = ""
    for word in text.split():
        trial = f"{line} {word}".strip()
        if line and draw.textlength(trial, font=font) > max_w:
            lines.append(line)
            line = word
        else:
            line = trial
    if line:
        lines.append(line)
    return lines or [text]


def _label_overlay(
    labels: list[tuple[str, str]],
    durs: list[float],
    offsets: list[float],
    xfade: float,
    scale_to: list[int],
    workdir: Path,
    first_input_index: int,
    prev: str,
) -> tuple[list[str], list[str], str]:
    """PNG inputs, overlay filters, and the label the chain now ends on.

    The card is PINNED: spans are contiguous, so exactly one is on screen at
    every instant and only its content changes. Owner 2026-08-19: "it shows up
    and goes again and again, you need to pin it on the screen but change the
    content."

    It used to bound each label to the span between its clip's incoming and
    outgoing crossfades, leaving the card absent for `xfade` seconds at every
    cut — the card blinked off and back 26 times in a 27-clip film. Handing each
    label the span up to the NEXT label's start closes those gaps. A place name
    now carries a half second into its successor's dissolve, which is correct:
    during a dissolve the outgoing place is still the one mostly on screen.

    A clip with no name at all still yields its span to the previous card rather
    than blanking it, for the same reason.
    """
    font = _label_font()
    if not font or not any(n.strip() for n, _ in labels):
        return [], [], prev

    w, h = scale_to[0], scale_to[1]
    total = crossfade_total(durs, xfade)
    inputs: list[str] = []
    steps: list[str] = []
    idx = first_input_index

    # Where each clip's card takes over: its own start on the finished timeline.
    starts = [0.0] + [offsets[i - 1] + xfade for i in range(1, len(labels))]
    named = [i for i, (n, _) in enumerate(labels) if n.strip()]

    for pos, i in enumerate(named):
        name, distance = labels[i][0].strip(), labels[i][1].strip()
        start = 0.0 if pos == 0 else starts[i]  # the first card opens the film
        end = starts[named[pos + 1]] if pos + 1 < len(named) else total
        if end - start < 0.5:  # too short to read; let the previous card hold
            continue
        png = workdir / f"label_{i:02d}.png"
        _render_label_png(name, distance, w, h, font, png)
        inputs.extend(["-i", str(png)])
        out = f"[lo{i}]"
        steps.append(f"[{idx}:v]format=rgba[lb{i}]")
        steps.append(
            f"{prev}[lb{i}]overlay=0:0:enable='between(t\\,{start:.3f}\\,{end:.3f})'{out}"
        )
        prev = out
        idx += 1

    return inputs, steps, prev


# ── end card ────────────────────────────────────────────────────────────────

END_CARD_S = 3.0
END_CARD_FADE = 0.6
# The luma the community's name should sit on, whatever photo is behind it.
END_CARD_TARGET_LUMA = 64


def _render_end_card(name: str, hero: Path, w: int, h: int, dest: Path) -> bool:
    """The film's last three seconds: the community's name, and ours.

    Owner 2026-08-20, on a film that ended on a supermarket: "the closing part
    is weak, it needs better design… lets design some ending page, customized
    for each community" — then, on the layout: "make it very simple just
    community name and percho name".

    The ground is the FIRST FRAME OF THE FIRST CLIP, so the film closes on the
    image it opened with. That is the bookend the shot list could not give us:
    the scheduler keeps each place to a single stretch (owner 2026-08-19), so
    returning to the community for a closing shot would have broken the rule,
    while a card is not a shot.

    The wash is MEASURED, not fixed. A fixed one repeats the mistake the place
    card just had fixed — a treatment tuned on one photo fails on the next. The
    band behind the name is sampled and darkened until it lands on
    END_CARD_TARGET_LUMA, so a dark calm photo keeps most of its light and a
    blown-out one is pushed down hard. Verified across luma 96 / 113 / 241:
    all three land the name on 68-75.
    """
    from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageStat

    serif = REPO_ROOT / "apps/mobile/assets/fonts/DMSerifDisplay-Regular.ttf"
    sans = _label_font()
    if not serif.exists() or not sans or not hero.exists():
        return False

    src = Image.open(hero).convert("RGB")
    ratio = max(w / src.width, h / src.height)
    src = src.resize((round(src.width * ratio), round(src.height * ratio)), Image.LANCZOS)
    x, y = (src.width - w) // 2, (src.height - h) // 2
    img = src.crop((x, y, x + w, y + h)).filter(ImageFilter.GaussianBlur(round(w * 0.010)))

    band = (0, round(h * 0.38), w, round(h * 0.55))
    lum = ImageStat.Stat(img.crop(band).convert("L")).mean[0]
    wash = min(0.86, max(0.10, (lum - END_CARD_TARGET_LUMA) / max(lum, 1)))
    img = Image.blend(img, Image.new("RGB", (w, h), (12, 16, 20)), wash)

    # A wide soft vignette, so the corners settle and the name is the only
    # thing with edges.
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).ellipse((-w * 0.30, -h * 0.15, w * 1.30, h * 1.15), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(round(w * 0.185)))
    vignette = Image.new("RGBA", (w, h), (6, 9, 12, 255))
    vignette.putalpha(Image.eval(mask, lambda v: round((255 - v) * 0.8)))
    img = Image.alpha_composite(img.convert("RGBA"), vignette)

    draw = ImageDraw.Draw(img)
    size = round(w * 0.139)
    while size > round(w * 0.06):
        font = ImageFont.truetype(str(serif), size)
        if draw.textlength(name, font=font) <= w * 0.82:
            break
        size -= 4
    draw.text((w / 2, h * 0.455), name, font=font, fill=(255, 255, 255, 255), anchor="mm")

    mark_font = ImageFont.truetype(sans, round(w * 0.023))
    mark, track = "PERCHO", round(w * 0.0065)
    total = sum(draw.textlength(c, font=mark_font) + track for c in mark) - track
    mx = w / 2 - total / 2
    for ch in mark:
        draw.text((mx, h * 0.905), ch, font=mark_font, fill=(255, 255, 255, 130), anchor="la")
        mx += draw.textlength(ch, font=mark_font) + track

    img.convert("RGB").save(dest)
    return True


def process_assembly(row: dict[str, Any]) -> None:
    assembly_id = row["id"]
    ordered = row.get("ordered_clips") or []
    print(f"[assembly {assembly_id}] {len(ordered)} clips", flush=True)
    workdir = Path(tempfile.mkdtemp(prefix=f"assembly-{assembly_id[:8]}-"))
    try:
        if len(ordered) < 2:
            raise RuntimeError(f"need >=2 clips, got {len(ordered)}")
        # Download every ready clip (seedance → ai-videos bucket, DA+KB → clip-renders).
        # The web route does NOT join photo_clips into ordered_clips (the shots carry
        # only photo_id/engine), so resolve storage paths here: photo_clips ready rows
        # keyed by photo_id — seedance → ai-videos, depthflow/kenburns → clip-renders.
        clip_paths: list[Path] = []
        # Kept in lockstep with clip_paths, NOT with `ordered` — a shot whose
        # clip is not ready is skipped below, and a label list built from
        # `ordered` would caption every following clip with the wrong place.
        clip_labels: list[tuple[str, str]] = []
        skipped: list[str] = []
        by_photo = {}
        # Ask for the clips of THESE photos, not the first page of every ready
        # clip in the table.
        #
        # This was `status=eq.ready&limit=200` with no filter and no order. The
        # table passed 200 rows on 2026-08-19 (226 ready), so 26 of them fell
        # outside the page — and any shot whose clip was among them was skipped
        # as "no ready clip" even though the clip existed and was ready. A
        # 29-clip tour assembled as 19 clips and 36s instead of 83.5s. The bug
        # was invisible until the table crossed the limit, and it would have
        # got worse with every render.
        wanted = [c.get("photo_id") for c in ordered if c.get("photo_id")]
        for chunk_start in range(0, len(wanted), 50):  # keep the URL sane
            chunk = wanted[chunk_start : chunk_start + 50]
            rows = sb_get(
                "photo_clips",
                {
                    "select": "id,photo_id,engine,storage_path,status",
                    "status": "eq.ready",
                    "photo_id": f"in.({','.join(chunk)})",
                    "limit": str(len(chunk) * 4),  # a photo has at most a few engines
                },
            )
            for r in rows:
                by_photo.setdefault(r["photo_id"], []).append(r)
        for i, c in enumerate(ordered, start=1):
            engine = c.get("engine") or "kenburns"
            candidates = by_photo.get(c.get("photo_id"), [])
            # AI-first: when BOTH a seedance (AI) clip and a local DA+KB clip are
            # ready for the same photo, prefer seedance regardless of what the shot
            # declared (owner 2026-08-17: "有ai 选ai"). Fall back to the shot's
            # engine, then any ready row.
            seedance = next((r for r in candidates if r["engine"] == "seedance"), None)
            ready = (
                seedance
                or next((r for r in candidates if r["engine"] == engine), None)
                or (candidates[0] if candidates else None)
            )
            if not ready or not ready.get("storage_path"):
                # Shot has no ready clip yet (never generated or still pending) —
                # skip it instead of failing the whole assembly. The user generates
                # missing clips in the photos panel; a re-run picks them up.
                print(
                    f"[assembly {assembly_id}] SKIP photo {c.get('photo_id')} (engine={engine}) — no ready clip",
                    flush=True,
                )
                skipped.append(c.get("photo_id", ""))
                continue
            path = ready["storage_path"]
            bucket = (
                "ai-videos"
                if (ready.get("engine") or "kenburns") == "seedance"
                else "clip-renders"
            )
            dest = workdir / f"{i:02d}.mp4"
            storage_download(bucket, path, dest)
            clip_paths.append(dest)
            clip_labels.append((str(c.get("label") or ""), str(c.get("label_distance") or "")))
            print(f"[assembly {assembly_id}] downloaded {bucket}/{path}", flush=True)

        if len(clip_paths) < 2:
            raise RuntimeError(
                f"need >=2 ready clips, got {len(clip_paths)} (missing: {', '.join(skipped[:5]) or 'none'})"
            )

        # Concat with crossfade. The filter graph is built here rather than by
        # generate.py because these clips arrive at two different resolutions
        # (seedance 496x864, local DA+KB 1080x1920) and have to be normalised
        # first; the OFFSETS come from the shared helper, which is the part
        # that was wrong when this was a hand copy (see xfade.py).
        out_path = workdir / "tour.mp4"
        inputs = []
        for p in clip_paths:
            inputs += ["-i", str(p)]
        xfade = 0.5
        durs = []
        for p in clip_paths:
            out = subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries", "format=duration",
                 "-of", "csv=p=0", str(p)],
                capture_output=True, text=True, check=True, timeout=15,
            )
            durs.append(float(out.stdout.strip()))
        offsets = crossfade_offsets(durs, xfade)
        filters: list[str] = []
        prev = "[0:v]"
        # xfade requires every input at one resolution, and clips arrive at two:
        # Seedance renders 496x864 (0.574) and the local DA+KB chain renders the
        # canvas. Normalise to the CANVAS, not to the largest input — a fixed
        # target is what lets a Seedance clip be reused across a canvas change.
        #
        # COVER-crop (increase + crop), not the fit-inside pad this used to do.
        # Padding was invisible while the canvas was 0.5625 and Seedance 0.574,
        # but against the 0.685 canvas that same filter would pillarbox every
        # Seedance clip with ~16% black down each side. Cropping instead is also
        # what keeps the owner's rule (2026-08-19: "for photos with seedance
        # clips, never call it again!!!! always re-use") affordable — an aspect
        # change costs zero Seedance calls.
        scale_to = [TOUR_CANVAS_W, TOUR_CANVAS_H]
        for i in range(len(clip_paths)):
            name = f"s{i}"
            filters.append(
                f"[{i}:v]fps=30,scale={scale_to[0]}:{scale_to[1]}:"
                f"force_original_aspect_ratio=increase,"
                f"crop={scale_to[0]}:{scale_to[1]},setsar=1[{name}]"
            )
        prev = "[s0]"
        for i in range(1, len(clip_paths)):
            name = f"x{i}"
            filters.append(
                f"{prev}[s{i}]xfade=transition=fade:duration={xfade}:"
                f"offset={offsets[i-1]:.3f}[{name}]"
            )
            prev = f"[{name}]"
        total = crossfade_total(durs, xfade)

        # Place labels (owner 2026-08-19). A community tour changes subject
        # every few seconds — "we should add location names to the videos so
        # people know what it is and how far it is from community". The text
        # itself is computed web-side (lib/poi/tour-orchestrator/clip-label.ts)
        # and arrives on the clip as `label`; here we only place it on the
        # timeline. Nothing is drawn when a clip has no label, so an older
        # assembly renders exactly as it did.
        #
        # This is the community tour only. The listing tour still carries no
        # on-screen text at all (2026-08-01) — there the subject is one house
        # for the whole film, so a caption band interrupts rather than informs.
        label_inputs, label_steps, prev = _label_overlay(
            clip_labels, durs, offsets, xfade, scale_to, workdir, len(clip_paths), prev
        )
        filters.extend(label_steps)

        # THE END CARD — after the labels, never before. The label chain gives
        # its last card the span up to `total`, so a card folded in earlier
        # would wear the final place name across it.
        card_inputs: list[str] = []
        community_name = (row.get("community") or {}).get("name") or ""
        hero = workdir / "hero.png"
        subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-i", str(clip_paths[0]),
             "-frames:v", "1", str(hero)],
            check=False, timeout=60,
        )
        card_png = workdir / "end_card.png"
        if community_name and _render_end_card(
            community_name, hero, scale_to[0], scale_to[1], card_png
        ):
            card_idx = len(clip_paths) + len(label_inputs) // 2
            card_inputs = ["-loop", "1", "-t", f"{END_CARD_S:.2f}", "-i", str(card_png)]
            filters.append(
                f"[{card_idx}:v]fps=30,scale={scale_to[0]}:{scale_to[1]},setsar=1,"
                f"format=yuv420p,format=rgba[card]"
            )
            filters.append(
                f"{prev}[card]xfade=transition=fade:duration={END_CARD_FADE}:"
                f"offset={total - END_CARD_FADE:.3f}[withcard]"
            )
            prev = "[withcard]"
            total = total + END_CARD_S - END_CARD_FADE
            print(f"[assembly {assembly_id}] end card for {community_name}", flush=True)

        vf = ";".join(filters) + f";{prev}format=yuv420p"
        cmd = [
            "ffmpeg", "-y",
            *inputs,
            *label_inputs,
            *card_inputs,
            "-filter_complex", vf,
            "-c:v", "libx264", "-preset", "medium", "-crf", "20",
            "-movflags", "+faststart",
            str(out_path),
        ]
        print(f"[assembly {assembly_id}] running: {' '.join(cmd)}", flush=True)
        subprocess.run(cmd, check=True, cwd=str(REPO_ROOT), timeout=600)
        if not out_path.exists():
            raise RuntimeError("concat produced no output")

        # Owner 2026-08-17: "assemble要加音乐" — mux a warm-acoustic BGM track
        # (same library + fade + volume as listing/bucket renders, generate.py
        # mux_bgm). Silent if the bucket is empty.
        #
        # Narration rides on top of it when the plan wrote one, ducking the
        # music under each line. Owner 2026-08-20, on music alone: "tts is much
        # better than pure music, with more information".
        # The plan's pick if it made one, otherwise the worker's own.
        #
        # Choosing here used to mean a uniform random draw from the folder,
        # which is how the loudest, most dynamic track in the library landed
        # under the first narrated cut. The planner now decides (owner
        # 2026-08-20: "planner to decide"), and this honours that decision —
        # falling back only when the chosen file is not on disk, which happens
        # when it was approved after this worker's last sync.
        planned_bgm = (row.get("bgm") or {}).get("path")
        bgm = None
        if planned_bgm:
            candidate = BGM_DIR / planned_bgm
            if candidate.exists():
                bgm = candidate
            else:
                print(
                    f"[assembly {assembly_id}] planned track {planned_bgm} not synced yet;"
                    " falling back",
                    flush=True,
                )
        if bgm is None:
            bgm = pick_bgm()
        placed: list[tuple[Path, float]] = []
        narration = row.get("narration") or {}
        if narration.get("segments"):
            placed = render_narration(
                narration, clip_start_times(durs, xfade), workdir
            )
        if bgm or placed:
            print(
                f"[assembly {assembly_id}] muxing "
                f"{bgm.name if bgm else 'no music'} + {len(placed)} narration line(s)",
                flush=True,
            )
            out_path = mux_audio(out_path, bgm, placed, total, workdir)

        # Upload to CF Stream.
        cf_meta = {
            "name": f"community-tour-{row.get('community_id')}",
            "scope": "community_tour_assemble",
            "tour_assembly_id": assembly_id,
        }
        cf_uid = cf_upload(out_path, meta=cf_meta)
        print(f"[assembly {assembly_id}] uploaded to CF: {cf_uid}", flush=True)

        sb_patch(
            "tour_assemblies",
            {"id": f"eq.{assembly_id}"},
            {
                "status": "ready",
                "cf_stream_uid": cf_uid,
                "video_url": streamIframeUrl(cf_uid),
                "error": None,
                "updated_at": _now_iso(),
            },
        )
        print(f"[assembly {assembly_id}] ready", flush=True)
    except Exception as e:
        err = f"{type(e).__name__}: {e}"
        print(f"[assembly {assembly_id}] FAILED: {err}", flush=True)
        traceback.print_exc()
        try:
            sb_patch(
                "tour_assemblies",
                {"id": f"eq.{assembly_id}"},
                {"status": "failed", "error": err[:500], "updated_at": _now_iso()},
            )
        except Exception:
            traceback.print_exc()
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def streamIframeUrl(uid: str) -> str:
    """Player URL for a rendered video. Same shape as the TS side.

    Deliberately mirrors `streamHost()` in apps/web/lib/cloudflare/stream.ts:
    the env var holds the full host here (`customer-xxx.cloudflarestream.com`)
    but the Cloudflare dashboard also shows a bare `customer-xxx`, so accept
    either. Both languages must produce the identical URL — the admin panel
    rebuilds this from `cf_stream_uid` via the TS helper rather than reading
    the column, so a divergence would be invisible until something does read it.

    This used to prepend a second `customer-` and insert a `/media/` segment,
    yielding a host that does not resolve — every video_url written before
    2026-08-19 is unopenable (owner: "it says 404").
    """
    raw = os.environ.get("NEXT_PUBLIC_CLOUDFLARE_STREAM_CUSTOMER_SUBDOMAIN", "").strip()
    if not raw:
        return f"https://watch.cloudflarestream.com/{uid}"
    host = re.sub(r"^https?://", "", raw).rstrip("/")
    if not host.endswith(".cloudflarestream.com"):
        host = f"{host}.cloudflarestream.com"
    return f"https://{host}/{uid}/iframe"


BGM_SYNC_EVERY_SEC = 15 * 60
_last_bgm_sync = 0.0


def sync_bgm_if_due(force: bool = False) -> None:
    """Refresh the local music cache from Storage.

    Approving a track in the admin only edits the state sidecar; the mp3 has to
    reach this machine before `pick_bgm` can choose it. Nothing ran the sync
    script — no cron, no launchd job, no call from here — so until 2026-08-20
    "approve" meant "approved, and someone must remember to run pull-bgm.sh and
    restart the worker". That is not a review flow, it is a review flow with a
    hole in it.

    Failure is logged and ignored: a Storage hiccup must not stop the worker
    rendering with the music it already has.
    """
    global _last_bgm_sync
    now = time.time()
    if not force and now - _last_bgm_sync < BGM_SYNC_EVERY_SEC:
        return
    _last_bgm_sync = now
    script = REPO_ROOT / "scripts/render-worker/pull-bgm.sh"
    if not script.exists():
        return
    try:
        out = subprocess.run(
            ["bash", str(script)], capture_output=True, text=True, timeout=300,
            cwd=str(REPO_ROOT),
        )
        tail = (out.stdout or out.stderr or "").strip().splitlines()[-1:] or [""]
        print(f"[bgm] sync: {tail[0]}", flush=True)
    except Exception as exc:  # noqa: BLE001 — never fatal
        print(f"[bgm] sync failed: {exc}", flush=True)


def main() -> None:
    print(f"[worker] starting, polling every {POLL_IDLE_SEC}s", flush=True)
    sync_bgm_if_due(force=True)
    while True:
        sync_bgm_if_due()
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

        # Tour assemblies (approved final concat) — above per-photo clips.
        try:
            assembly = claim_assembly()
        except Exception:
            traceback.print_exc()
            time.sleep(POLL_IDLE_SEC)
            continue

        if assembly is not None:
            process_assembly(assembly)
            continue

        # Photo clips (depthflow/kenburns) — interactive, above enhancement.
        try:
            clip_row = claim_photo_clip()
        except Exception:
            traceback.print_exc()
            time.sleep(POLL_IDLE_SEC)
            continue

        if clip_row is not None:
            process_photo_clip(clip_row)
            continue

        # Outpainting sits just above enhancement and below every render, for
        # the same reason: it is batch work. Ordering against enhance on a
        # given photo comes from who queues what, not from this loop — the
        # photos step queues outpaint first and enhance only once the reframed
        # file exists.
        try:
            outpaint_row = claim_outpaint_job()
        except Exception:
            traceback.print_exc()
            time.sleep(POLL_IDLE_SEC)
            continue

        if outpaint_row is not None:
            process_outpaint(outpaint_row)
            continue

        # Photo enhancement is LAST in the priority order: a render job is
        # interactive (owner clicked Generate and is watching), an enhance job is
        # batch. Enhancing never delays a render.
        try:
            enhance_job = claim_enhance_job()
        except Exception:
            traceback.print_exc()
            time.sleep(POLL_IDLE_SEC)
            continue

        if enhance_job is not None:
            process_enhance_job(*enhance_job)
            continue

        time.sleep(POLL_IDLE_SEC)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("[worker] shutting down", flush=True)
        sys.exit(0)
