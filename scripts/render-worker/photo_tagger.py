#!/usr/bin/env python3
"""
photo_tagger — Claude Sonnet 4.5 vision labeling of listing photos for the
Phase 93 shot planner. Extracted from scripts/spikes/vision_tag_listing.py
(2026-07-15) and turned into an importable module the worker calls before
photo_selector.build_plan().

Public API:
    tag_listing_photos(photo_paths, listing) -> {"photos": [...], "style": {...}}

Env required at call time:
    ANTHROPIC_API_KEY

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

MODEL = os.environ.get("ANTHROPIC_VISION_MODEL", "claude-sonnet-4-5")
API = "https://api.anthropic.com/v1/messages"
MAX_WORKERS = int(os.environ.get("PHOTO_TAGGER_WORKERS", "8"))

PER_PHOTO_SYSTEM = """You are labeling ONE photo from a residential real estate listing for a video pipeline.

Return STRICT JSON only, no prose:
{
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


def _call_vision(system: str, user_prompt: str, image_b64_list: list[str],
                 media_type: str = "image/jpeg", timeout: int = 90) -> dict[str, Any]:
    content: list[dict[str, Any]] = []
    for b64 in image_b64_list:
        content.append({
            "type": "image",
            "source": {"type": "base64", "media_type": media_type, "data": b64},
        })
    content.append({"type": "text", "text": user_prompt})

    body = json.dumps({
        "model": MODEL,
        "max_tokens": 800,
        "system": system,
        "messages": [{"role": "user", "content": content}],
    }).encode()

    req = urllib.request.Request(
        API,
        data=body,
        headers={
            "x-api-key": os.environ["ANTHROPIC_API_KEY"],
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
    )
    resp = urllib.request.urlopen(req, timeout=timeout)
    data = json.loads(resp.read())
    text = next(c["text"] for c in data["content"] if c["type"] == "text")
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0]
    return json.loads(text)


def _tag_one(photo_path: Path, sort_order: int, photo_id: str) -> dict[str, Any]:
    b64 = base64.b64encode(photo_path.read_bytes()).decode()
    try:
        tags = _call_vision(
            PER_PHOTO_SYSTEM,
            f"Photo sort_order={sort_order}. Label it.",
            [b64],
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
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise RuntimeError("ANTHROPIC_API_KEY not set")

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
    b64s: list[str] = []
    id_to_path = {p["id"]: Path(p["local_path"]) for p in photos}
    for r in top:
        pth = id_to_path.get(r["id"])
        if pth and pth.exists():
            b64s.append(base64.b64encode(pth.read_bytes()).decode())
    style: dict[str, Any]
    if b64s:
        price = listing.get("price") or 0
        user = (
            f"Listing price ${price:,}, "
            f"{listing.get('beds','?')}b/{listing.get('baths','?')}ba/"
            f"{listing.get('sqft','?')}sqft in "
            f"{listing.get('city','?')}, {listing.get('state','?')}. "
            f"Classify overall style."
        )
        try:
            style = _call_vision(STYLE_SYSTEM, user, b64s)
        except Exception as e:  # noqa: BLE001
            style = {"style": "modern", "confidence": 0.0, "error": str(e)}
    else:
        style = {"style": "modern", "confidence": 0.0, "error": "no valid tags"}

    return {"photos": tagged, "style": style}
