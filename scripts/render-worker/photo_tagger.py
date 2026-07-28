#!/usr/bin/env python3
"""
photo_tagger — Claude Sonnet 4.5 vision labeling of listing photos for the
Phase 93 shot planner. Extracted from scripts/spikes/vision_tag_listing.py
(2026-07-15) and turned into an importable module the worker calls before
photo_selector.build_plan().

Public API:
    tag_listing_photos(photo_paths, listing) -> {"photos": [...], "style": {...}}

Auth at call time:
    NONE in the environment. Billing goes to AWS Bedrock via the instance role
    (CLAUDE.md §2.1 rule 0); boto3's default credential chain supplies it.
    Optional: AWS_REGION (default us-east-1), BEDROCK_VISION_MODEL.

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

# Bedrock model id, NOT a bare Anthropic model name. CLAUDE.md §2.1 rule 0 pins
# spend to Bedrock; the `global.` prefix is the cross-region inference profile
# the rest of this repo already uses (see scripts/claude-bedrock.sh).
MODEL = os.environ.get(
    "BEDROCK_VISION_MODEL", "global.anthropic.claude-sonnet-4-5-20250929-v1:0"
)
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


def _invoke_bedrock(system: str, content: list[dict[str, Any]],
                    timeout: int) -> dict[str, Any]:
    """One vision call, via AWS Bedrock on the instance role.

    CLAUDE.md §2.1 rule 0: all LLM spend on this host bills to Bedrock, never to
    a personal `sk-ant-*` key. This module used to POST api.anthropic.com with
    `os.environ["ANTHROPIC_API_KEY"]`, which is why it has been BROKEN on this
    host since that key was removed on 2026-07-26 — and it is the reason
    `listing_photos.ai_tags` is empty for every fmls-import listing, which in
    turn is why the §2.3-2.5 hotspot UI has nothing to render.

    Auth comes from the instance role via boto3's default chain: no key material
    in the environment, in `.env.local`, or in this file. Do not add an API-key
    fallback path here — a fallback is how the personal key came back last time.

    The request body is the Anthropic Messages format minus `model` (Bedrock
    takes the model in the URL/`modelId`) plus `anthropic_version`, so the
    caller's `content` blocks and the response shape are unchanged.
    """
    import boto3  # imported lazily: the caller may only need dhash helpers

    from botocore.config import Config

    client = boto3.client(
        "bedrock-runtime",
        region_name=os.environ.get("AWS_REGION", "us-east-1"),
        config=Config(read_timeout=timeout, retries={"max_attempts": 3}),
    )
    resp = client.invoke_model(
        modelId=MODEL,
        body=json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 800,
            "system": system,
            "messages": [{"role": "user", "content": content}],
        }),
    )
    return json.loads(resp["body"].read())


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

    data = _invoke_bedrock(system, content, timeout)
    text = next(c["text"] for c in data["content"] if c["type"] == "text")
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0]
    return json.loads(text)


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
    # No credential precondition to check: Bedrock auth comes from the instance
    # role via boto3's default chain, and a missing role surfaces as a botocore
    # NoCredentialsError on the first call (per-photo, and already captured as
    # that photo's `error`). The old `ANTHROPIC_API_KEY` guard here was a hard
    # abort on a key this host must never have — see `_invoke_bedrock`.
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
