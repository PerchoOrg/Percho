#!/usr/bin/env python3
"""
photo_tagger — Gemini 2.5 Flash vision labeling of listing photos for the
Phase 93 shot planner. Extracted from scripts/spikes/vision_tag_listing.py
(2026-07-15) and turned into an importable module the worker calls before
photo_selector.build_plan().

Public API:
    tag_listing_photos(photo_paths, listing) -> {"photos": [...], "style": {...}}

Auth at call time:
    GEMINI_API_KEY from the environment (was AWS Bedrock instance-role billing
    until 2026-08-08 — the Bedrock path was retired with the rest of the
    repo's Anthropic spend). Optional: GEMINI_MODEL (default gemini-2.5-flash).

Failure mode:
    Any per-photo call may raise inside the thread pool; the corresponding
    photo dict will contain {"error": ...} but the batch still returns.
    Callers decide whether an empty-tag result should abort or fall back.
"""
from __future__ import annotations

import base64
import concurrent.futures as cf
import json
import os
import urllib.request
from pathlib import Path
from typing import Any

MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
MAX_WORKERS = int(os.environ.get("PHOTO_TAGGER_WORKERS", "8"))

PER_PHOTO_SYSTEM = """You are labeling ONE photo from a residential real estate listing for a video pipeline.

Return STRICT JSON only, no prose:
{
  "caption": "short factual sentence, <=15 words, e.g. 'Bright kitchen with marble island and stainless appliances'",
  "room_type": "exterior|living|kitchen|dining|bedroom|bathroom|office|backyard|pool|balcony|garage|hallway|closet|laundry|basement|floorplan|other",
  "is_master": true/false,
  "subject_label": "bed|island|range|fireplace|window_view|pool|door|stairs|mirror|vanity|null",
  "subject_bbox": [x, y, w, h],
  "orientation_hint": "wide|tall|square",
  "time_of_day": "day|dusk|night|indoor_neutral",
  "quality": 0.0-1.0,
  "hero_score": 0.0-1.0,
  "usable": true/false,
  "style_signals": ["marble","vaulted_ceiling","chandelier","hardwood","carpet","exposed_beam","modern_kitchen","dated","stainless_steel","open_plan","large_windows","pool","backyard_lawn","brick","stucco"],
  "notes": "short factual"
}

Rules:
- caption: 1 sentence, <=15 words, factual (what the photo shows, not marketing fluff). This is displayed under the thumbnail on the agent's Media tab.
- subject_bbox: normalized [0..1], (x,y) is TOP-LEFT of bbox, (w,h) size. Point at THE thing worth panning to (bed, island, window with view, fireplace). If nothing specific → subject_label=null, bbox=[0.25,0.25,0.5,0.5].
- hero_score: how well this photo could open or close a video (0.9+ = strong exterior/wide living/kitchen/pool at prime time; 0.3- = closet, laundry, blank hall).
- quality: photographic quality only (sharp, well-lit, well-framed). Independent of hero_score.
- usable=false only for actually broken frames (blurry, dark, watermark, screenshot of a floorplan is usable=true with room_type=floorplan).
- style_signals: 0-5 short tags. Empty array OK."""

STYLE_SYSTEM = """You are looking at 5-8 hero photos from ONE residential real estate listing. Classify the overall style.

Return STRICT JSON only:
{
  "style": "luxury|modern|traditional|cozy|rural",
  "confidence": 0.0-1.0,
  "reason": "one sentence"
}

Definitions:
- luxury: vaulted ceilings, marble, chandeliers, pool, wine cellar, high-end finishes, obviously $$$
- modern: minimal, gray/white palette, big glass, clean lines, contemporary kitchen
- traditional: brick, wainscoting, formal dining, warm wood, colonial/craftsman
- cozy: smaller starter home, colorful, personal, lived-in feel
- rural: lots of land, farm/country, exterior-dominant, wide open

If mixed, pick dominant. If truly ambiguous, use price signal in the user prompt."""


def _dhash(image_path: Path) -> int:
    """8x8 diff hash for perceptual similarity. Returns 64-bit int."""
    from PIL import Image
    img = Image.open(image_path).convert("L").resize((9, 8), Image.LANCZOS)
    pixels = list(img.getdata())
    bits = 0
    for row in range(8):
        for col in range(8):
            left = pixels[row * 9 + col]
            right = pixels[row * 9 + col + 1]
            bits = (bits << 1) | (1 if left > right else 0)
    return bits


def _sniff_media_type(raw: bytes) -> str:
    """Phase 99: detect image media type from magic bytes so PNG/WebP/GIF
    listings aren't sent to Anthropic as image/jpeg (400s otherwise).
    Falls back to jpeg for anything unrecognized."""
    if raw.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if raw.startswith(b"GIF87a") or raw.startswith(b"GIF89a"):
        return "image/gif"
    if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return "image/webp"
    return "image/jpeg"


def _invoke_gemini(system: str, content: list[dict[str, Any]],
                   timeout: int) -> dict[str, Any]:
    """One vision call, via the Gemini REST API (migrated from Bedrock 2026-08-08).

    Key comes from GEMINI_API_KEY. Images are sent as inline_data (raw base64)
    so `_call_vision` keeps receiving raw bytes and the media-type sniff stays
    useful. Response is {candidates: [{content: {parts: [{text}]}}]}; the
    caller's `content` blocks are rebuilt here, so nothing upstream changes.
    """
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("GEMINI_API_KEY not set")

    parts: list[dict[str, Any]] = []
    for item in content:
        if item.get("type") == "image":
            src = item["source"]
            parts.append({
                "inline_data": {
                    "mime_type": src["media_type"],
                    "data": src["data"],
                }
            })
        else:
            parts.append({"text": item["text"]})

    body = json.dumps({
        "system_instruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {"maxOutputTokens": 800},
    }).encode()

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}"
        ":generateContent?key=" + key
    )
    req = urllib.request.Request(
        url, data=body, headers={"content-type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def _call_vision(system: str, user_prompt: str,
                 images: list[bytes] | list[str],
                 media_type: str | None = None, timeout: int = 90) -> dict[str, Any]:
    """images: list of raw image bytes (preferred — media_type auto-sniffed
    per image) OR list of pre-encoded base64 strings (legacy — uses
    media_type arg or defaults to jpeg)."""
    content: list[dict[str, Any]] = []
    for item in images:
        if isinstance(item, bytes):
            mt = _sniff_media_type(item)
            b64 = base64.b64encode(item).decode()
        else:
            mt = media_type or "image/jpeg"
            b64 = item
        content.append({
            "type": "image",
            "source": {"type": "base64", "media_type": mt, "data": b64},
        })
    content.append({"type": "text", "text": user_prompt})

    data = _invoke_gemini(system, content, timeout)
    text = ""
    candidates = data.get("candidates") or []
    if candidates:
        parts = (candidates[0].get("content") or {}).get("parts") or []
        for p in parts:
            if p.get("text"):
                text = p["text"]
                break
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0]
    out = json.loads(text)
    # Gemini sometimes emits unnormalized bboxes ([0.46, 345, 0.08, 0.04]).
    # Clamp to unit square; anything out of range becomes null so the
    # downstream pan_to_subject guard (photo_selector.py:331) drops it.
    bb = out.get("subject_bbox")
    if isinstance(bb, list) and len(bb) == 4:
        clamped = [max(0.0, min(1.0, float(v))) for v in bb]
        if all(v == float(v) and 0 <= v <= 1 for v in bb):
            out["subject_bbox"] = clamped
        else:
            out["subject_bbox"] = None
    return out


def _tag_one(photo_path: Path, sort_order: int, photo_id: str) -> dict[str, Any]:
    raw = photo_path.read_bytes()
    try:
        tags = _call_vision(
            PER_PHOTO_SYSTEM,
            f"Photo sort_order={sort_order}. Label it.",
            [raw],
        )
        tags["id"] = photo_id
        tags["_id"] = photo_id
        tags["sort_order"] = sort_order
        tags["_sort_order"] = sort_order
        tags["_dhash"] = _dhash(photo_path)
        return tags
    except Exception as e:  # noqa: BLE001
        return {
            "id": photo_id,
            "_id": photo_id,
            "sort_order": sort_order,
            "_sort_order": sort_order,
            "error": str(e),
        }


def tag_listing_photos(
    photos: list[dict[str, Any]],
    listing: dict[str, Any],
) -> dict[str, Any]:
    """Run vision on all photos + a style aggregation on the top-hero subset.

    photos: [{"local_path": Path, "sort_order": int, "id": str}, ...]
    listing: {"price": int, "beds", "baths", "sqft", "city", "state", ...}
    Returns {"photos": [...tag dicts...], "style": {...}}
    """
    # No credential precondition to check: Gemini auth comes from
    # GEMINI_API_KEY and a missing key surfaces as RuntimeError on the first
    # call (per-photo, already captured as that photo's `error`).
    results: list[dict[str, Any] | None] = [None] * len(photos)
    with cf.ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futs = {
            ex.submit(_tag_one, Path(p["local_path"]), p["sort_order"], p["id"]): i
            for i, p in enumerate(photos)
        }
        for fut in cf.as_completed(futs):
            i = futs[fut]
            results[i] = fut.result()

    tagged = [r for r in results if r is not None]

    # Style aggregation on top-6 hero photos (by hero_score).
    valid = [r for r in tagged if "hero_score" in r]
    top = sorted(valid, key=lambda r: -r["hero_score"])[:6]
    raws: list[bytes] = []
    id_to_path = {p["id"]: Path(p["local_path"]) for p in photos}
    for r in top:
        pth = id_to_path.get(r["id"])
        if pth and pth.exists():
            raws.append(pth.read_bytes())
    style: dict[str, Any]
    if raws:
        price = listing.get("price") or 0
        user = (
            f"Listing price ${price:,}, "
            f"{listing.get('beds','?')}b/{listing.get('baths','?')}ba/"
            f"{listing.get('sqft','?')}sqft in "
            f"{listing.get('city','?')}, {listing.get('state','?')}. "
            f"Classify overall style."
        )
        try:
            style = _call_vision(STYLE_SYSTEM, user, raws)
        except Exception as e:  # noqa: BLE001
            style = {"style": "modern", "confidence": 0.0, "error": str(e)}
    else:
        style = {"style": "modern", "confidence": 0.0, "error": "no valid tags"}

    return {"photos": tagged, "style": style}
