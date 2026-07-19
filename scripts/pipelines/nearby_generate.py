#!/usr/bin/env python3
"""
nearby_generate.py — production nearby-video generation pipeline.

Given a listing_id, run per-bucket discovery + photo fetch + Claude vision
face-filter + enqueue a slideshow video row for each bucket. The EC2 render
worker will pick up the queued rows and produce Cloudflare Stream videos.

Idempotent:
  - Reuses `pois` rows via google_place_id upsert (global table).
  - Skips POIs already present in `listing_pois` for this listing (any bucket).
  - Skips a bucket entirely if a ready/processing/pending generated_video row
    already exists for (listing_id, intent_bucket)  unless --force is given.
  - Skips vision tagging for photos that already carry tagged_at.

Env: read from <repo>/.env.local. See README.md for required keys.

Usage:
    python3 scripts/pipelines/nearby_generate.py --listing-id <uuid>
        [--buckets dining,schools,outdoor,shopping,daily_errands]
        [--force]
        [--dry-run]

Exit code 0 on success (queued/skipped), 1 on any fatal error.
Final line of stdout is a JSON blob with per-bucket status.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import math
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


# ─── env loader ──────────────────────────────────────────────────────────────

REPO_ROOT = Path(__file__).resolve().parents[2]
ENV_PATH = REPO_ROOT / ".env.local"


def load_env() -> None:
    if not ENV_PATH.exists():
        raise SystemExit(f"[fatal] {ENV_PATH} not found")
    for line in ENV_PATH.read_text().splitlines():
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


REQUIRED_ENV = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "ANTHROPIC_API_KEY",
    "GOOGLE_PLACES_API_KEY",
]


def validate_env() -> None:
    missing = [k for k in REQUIRED_ENV if not os.environ.get(k)]
    if missing:
        raise SystemExit(f"[fatal] missing env vars: {', '.join(missing)}")


# ─── bucket definitions (mirror lib/poi/google-places.ts) ─────────────────────

BUCKET_PLACES_TYPES: dict[str, list[str]] = {
    "schools": ["school", "primary_school", "secondary_school"],
    "dining": ["restaurant", "cafe", "bakery"],
    "nightlife": ["bar", "night_club", "movie_theater"],
    "shopping": ["shopping_mall", "department_store", "clothing_store"],
    "outdoor": ["park", "campground", "tourist_attraction"],
    "fitness": ["gym", "spa"],
    "kids": ["amusement_park", "aquarium", "zoo", "library"],
    "asian_community": [],  # text-search only, skipped here
    "daily_errands": [
        "supermarket",
        "grocery_store",
        "pharmacy",
        "gas_station",
        "convenience_store",
        "hardware_store",
    ],
    "faith": ["church", "mosque", "synagogue", "hindu_temple"],
    "work_hubs": [],  # text-search only, skipped here
    "healthcare": ["hospital", "doctor"],
    "pets": ["veterinary_care", "pet_store"],
    "transit": ["subway_station", "train_station", "transit_station", "airport"],
}

DEFAULT_BUCKETS = list(BUCKET_PLACES_TYPES.keys())

TARGET_POI = 6
PHOTOS_PER_POI = 2
RADIUS_STEPS = (3000, 5000, 8000)


# ─── HTTP helpers ────────────────────────────────────────────────────────────

def http(
    method: str,
    url: str,
    headers: dict[str, str] | None = None,
    data: Any = None,
    timeout: int = 90,
    raw: bool = False,
) -> tuple[int, bytes, dict[str, str]]:
    if isinstance(data, (dict, list)) and not raw:
        data = json.dumps(data).encode()
        headers = {**(headers or {}), "Content-Type": "application/json"}
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read(), dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read(), dict(e.headers)


def sb(path: str, method: str = "GET", data: Any = None, prefer: str | None = None, params: str = "") -> Any:
    url = f"{os.environ['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/')}/rest/v1/{path}{params}"
    h = {
        "apikey": os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        "Authorization": f"Bearer {os.environ['SUPABASE_SERVICE_ROLE_KEY']}",
    }
    if prefer:
        h["Prefer"] = prefer
    s, b, _ = http(method, url, h, data)
    if s >= 300:
        raise RuntimeError(f"Supabase {method} {path} {s}: {b[:500]!r}")
    return json.loads(b) if b else None


def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371000
    tr = math.radians
    dLat = tr(lat2 - lat1)
    dLng = tr(lng2 - lng1)
    a = math.sin(dLat / 2) ** 2 + math.cos(tr(lat1)) * math.cos(tr(lat2)) * math.sin(dLng / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def bayes_score(v: int | None, r: float | None, d: float) -> float:
    v = v or 0
    r = r or 0.0
    m, C = 50, 4.0
    bayes = (v / (v + m)) * r + (m / (v + m)) * C
    return bayes * math.exp(-d / 1500)


# ─── Google Places nearbySearch ──────────────────────────────────────────────

NEARBY_MASK = ",".join(
    [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.primaryType",
        "places.types",
        "places.rating",
        "places.userRatingCount",
        "places.businessStatus",
        "places.location",
        "places.photos",
    ]
)


def nearby_search(types: list[str], center_lat: float, center_lng: float, radius: int) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for t in types:
        body = {
            "includedTypes": [t],
            "maxResultCount": 20,
            "locationRestriction": {
                "circle": {
                    "center": {"latitude": center_lat, "longitude": center_lng},
                    "radius": radius,
                }
            },
        }
        s, b, _ = http(
            "POST",
            "https://places.googleapis.com/v1/places:searchNearby",
            {
                "X-Goog-Api-Key": os.environ["GOOGLE_PLACES_API_KEY"],
                "X-Goog-FieldMask": NEARBY_MASK,
            },
            body,
            timeout=45,
        )
        if s >= 300:
            print(f"    [WARN] nearby {t} r={radius}: {s} {b[:200]!r}")
            continue
        for p in (json.loads(b).get("places") or []):
            if p.get("id") and p["id"] not in out:
                out[p["id"]] = p
    return out


def qualify_and_score(places: dict[str, Any], center_lat: float, center_lng: float) -> list[tuple[float, float, dict[str, Any]]]:
    """Return list of (score, distance_m, place) filtered by OPERATIONAL + ratings>=10."""
    out: list[tuple[float, float, dict[str, Any]]] = []
    for p in places.values():
        if (p.get("businessStatus") or "OPERATIONAL") != "OPERATIONAL":
            continue
        v = p.get("userRatingCount") or 0
        if v < 10:
            continue
        loc = p.get("location") or {}
        d = haversine(center_lat, center_lng, loc.get("latitude", center_lat), loc.get("longitude", center_lng))
        s = bayes_score(v, p.get("rating"), d)
        out.append((s, d, p))
    out.sort(key=lambda x: -x[0])
    return out


# ─── vision (Claude face-filter) ─────────────────────────────────────────────

VISION_PROMPT = (
    'Return ONLY valid JSON in this exact form: '
    '{"has_prominent_faces": bool, "is_exterior": bool, "is_generic_storefront": bool}. '
    "`has_prominent_faces`=true if any recognizable human face occupies >5% of frame or is in focused foreground. "
    "`is_exterior`=true if outdoor building shot. "
    "`is_generic_storefront`=true if just a plain sign/logo/parking lot with no ambiance."
)


def download_photo_from_storage(storage_path: str) -> tuple[bytes, str]:
    url = f"{os.environ['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/')}/storage/v1/object/listing-photos/{storage_path}"
    st, body, hdr = http("GET", url, {"Authorization": f"Bearer {os.environ['SUPABASE_SERVICE_ROLE_KEY']}"})
    if st >= 300:
        raise RuntimeError(f"storage {st}: {body[:200]!r}")
    return body, hdr.get("Content-Type", "image/jpeg")


def claude_tag(img: bytes, media_type: str) -> dict[str, bool]:
    model = os.environ.get("ANTHROPIC_MODEL") or "claude-sonnet-4-5"
    body = {
        "model": model,
        "max_tokens": 200,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": base64.b64encode(img).decode(),
                        },
                    },
                    {"type": "text", "text": VISION_PROMPT},
                ],
            }
        ],
    }
    st, resp, _ = http(
        "POST",
        "https://api.anthropic.com/v1/messages",
        {
            "x-api-key": os.environ["ANTHROPIC_API_KEY"],
            "anthropic-version": "2023-06-01",
        },
        body,
        timeout=120,
    )
    if st >= 300:
        raise RuntimeError(f"claude {st}: {resp[:300]!r}")
    text = json.loads(resp)["content"][0]["text"].strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    text = text.strip()
    i, j = text.find("{"), text.rfind("}")
    return json.loads(text[i : j + 1])


# ─── per-bucket pipeline ─────────────────────────────────────────────────────

def existing_bucket_video(listing_id: str, bucket: str) -> dict[str, Any] | None:
    """Return the most recent live generated_videos row for this (listing, bucket), or None."""
    rows = sb(
        "generated_videos",
        params=(
            f"?listing_id=eq.{listing_id}&intent_bucket=eq.{bucket}"
            f"&status=in.(pending,processing,ready,approved)"
            f"&select=id,status&order=created_at.desc&limit=1"
        ),
    )
    return rows[0] if rows else None


def run_bucket(
    listing_id: str,
    center_lat: float,
    center_lng: float,
    bucket: str,
    existing_listing_gpids: set[str],
    existing_listing_poi_ids: set[str],
    force: bool,
) -> dict[str, Any]:
    """Run the discovery→photos→vision→enqueue pipeline for a single bucket.
    Returns a status dict."""
    result: dict[str, Any] = {"bucket": bucket, "status": "unknown"}
    types = BUCKET_PLACES_TYPES.get(bucket) or []
    if not types:
        result["status"] = "skipped_no_types"
        return result

    # Skip if bucket already has a live video
    prev = existing_bucket_video(listing_id, bucket)
    if prev and not force:
        result["status"] = "skipped_existing_video"
        result["video_id"] = prev["id"]
        result["video_status"] = prev["status"]
        return result

    # ── discovery with radius fallback ──
    qualified: list[tuple[float, float, dict[str, Any]]] = []
    progression: dict[int, int] = {}
    stopped_at: int | None = None
    for radius in RADIUS_STEPS:
        places = nearby_search(types, center_lat, center_lng, radius)
        qualified = qualify_and_score(places, center_lat, center_lng)
        progression[radius] = len(qualified)
        print(f"    [{bucket}] r={radius}m: {len(qualified)} qualified POIs")
        stopped_at = radius
        if len(qualified) >= TARGET_POI:
            break

    top = qualified[:TARGET_POI]
    if not top:
        result["status"] = "no_pois_found"
        result["radius_progression"] = progression
        return result

    # ── upsert pois + insert listing_pois for new ones ──
    new_pois_selected: list[tuple[str, float, dict[str, Any]]] = []
    for s, d, p in top:
        gpid = p["id"]
        loc = p.get("location") or {}
        row = {
            "google_place_id": gpid,
            "display_name": (p.get("displayName") or {}).get("text") or "(unnamed)",
            "formatted_address": p.get("formattedAddress"),
            "primary_type": p.get("primaryType"),
            "types": p.get("types"),
            "rating": p.get("rating"),
            "user_ratings_total": p.get("userRatingCount"),
            "business_status": p.get("businessStatus"),
            "location": f"({loc.get('longitude')},{loc.get('latitude')})",
            "raw_place": p,
            "refreshed_at": datetime.now(timezone.utc).isoformat(),
        }
        res = sb(
            "pois",
            "POST",
            [row],
            prefer="return=representation,resolution=merge-duplicates",
            params="?on_conflict=google_place_id",
        )
        poi_id = res[0]["id"]
        if poi_id in existing_listing_poi_ids or gpid in existing_listing_gpids:
            # Reuse — still include in the video POI set below
            new_pois_selected.append((poi_id, d, p))
            continue
        # insert listing_pois
        sb(
            "listing_pois",
            "POST",
            [
                {
                    "listing_id": listing_id,
                    "poi_id": poi_id,
                    "intent_bucket": bucket,
                    "distance_m": int(d),
                    "status": "approved",
                    "ai_score": round(s, 4),
                }
            ],
            prefer="return=minimal",
        )
        existing_listing_poi_ids.add(poi_id)
        existing_listing_gpids.add(gpid)
        new_pois_selected.append((poi_id, d, p))

    # Order by distance for the video
    new_pois_selected.sort(key=lambda x: x[1])

    # ── fetch up to PHOTOS_PER_POI photos per POI ──
    poi_to_photo_ids: dict[str, list[str]] = {}
    for poi_id, _d, p in new_pois_selected:
        existing = sb(
            "poi_photos",
            params=f"?poi_id=eq.{poi_id}&select=id,google_photo_name,status",
        )
        existing_by_name = {r["google_photo_name"]: r for r in existing}
        have_ids = [r["id"] for r in existing if (r.get("status") or "approved") != "rejected"]
        poi_to_photo_ids[poi_id] = list(have_ids)

        need = max(0, PHOTOS_PER_POI - len(poi_to_photo_ids[poi_id]))
        if need <= 0:
            continue

        for photo in (p.get("photos") or []):
            if need <= 0:
                break
            name = photo["name"]
            if name in existing_by_name:
                continue
            url = f"https://places.googleapis.com/v1/{name}/media?maxWidthPx=1600"
            try:
                req = urllib.request.Request(url, headers={"X-Goog-Api-Key": os.environ["GOOGLE_PLACES_API_KEY"]})
                with urllib.request.urlopen(req, timeout=45) as r:
                    img_bytes = r.read()
                    ctype = r.headers.get("content-type", "image/jpeg")
            except Exception as e:
                print(f"      [WARN] photo fetch failed {name[:60]}: {e}")
                continue
            h = hashlib.md5(name.encode()).hexdigest()[:16]
            storage_path = f"pois/{poi_id}/{h}.jpg"
            up_url = f"{os.environ['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/')}/storage/v1/object/listing-photos/{storage_path}"
            st, body, _ = http(
                "POST",
                up_url,
                {
                    "apikey": os.environ["SUPABASE_SERVICE_ROLE_KEY"],
                    "Authorization": f"Bearer {os.environ['SUPABASE_SERVICE_ROLE_KEY']}",
                    "Content-Type": ctype,
                    "x-upsert": "true",
                },
                img_bytes,
                raw=True,
            )
            if st >= 300:
                print(f"      [WARN] storage upload {st}: {body[:200]!r}")
                continue
            row = {
                "poi_id": poi_id,
                "source": "google_places",
                "google_photo_name": name,
                "storage_path": storage_path,
                "width_px": photo.get("widthPx"),
                "height_px": photo.get("heightPx"),
                "bytes": len(img_bytes),
                "attribution": {"authorAttributions": photo.get("authorAttributions") or []},
                "status": "approved",
                "reviewed_at": datetime.now(timezone.utc).isoformat(),
            }
            res = sb(
                "poi_photos",
                "POST",
                [row],
                prefer="return=representation,resolution=merge-duplicates",
                params="?on_conflict=google_photo_name",
            )
            poi_to_photo_ids[poi_id].append(res[0]["id"])
            need -= 1

    # ── vision-tag any photos missing tagged_at ──
    all_photo_ids = [pid for ids in poi_to_photo_ids.values() for pid in ids]
    if all_photo_ids:
        photos_full = sb(
            "poi_photos",
            params=(
                f"?id=in.({','.join(all_photo_ids)})"
                f"&select=id,poi_id,storage_path,width_px,ai_tags,tagged_at"
            ),
        )
    else:
        photos_full = []
    for ph in photos_full:
        if ph.get("tagged_at"):
            continue
        try:
            img, mt = download_photo_from_storage(ph["storage_path"])
            if mt not in ("image/jpeg", "image/png", "image/webp", "image/gif"):
                mt = "image/jpeg"
            tags = claude_tag(img, mt)
        except Exception as e:
            print(f"      [SKIP vision] {ph['id']}: {e}")
            continue
        ph["ai_tags"] = {**(ph.get("ai_tags") or {}), **tags}
        sb(
            "poi_photos",
            "PATCH",
            {
                "ai_tags": ph["ai_tags"],
                "tagged_at": datetime.now(timezone.utc).isoformat(),
                "ai_model": os.environ.get("ANTHROPIC_MODEL") or "claude-sonnet-4-5",
            },
            prefer="return=minimal",
            params=f"?id=eq.{ph['id']}",
        )

    # ── rank & select final photo list ──
    if all_photo_ids:
        photos_full = sb(
            "poi_photos",
            params=(
                f"?id=in.({','.join(all_photo_ids)})"
                f"&select=id,poi_id,storage_path,width_px,ai_tags"
            ),
        )
    else:
        photos_full = []
    by_poi: dict[str, list[dict[str, Any]]] = {}
    for ph in photos_full:
        by_poi.setdefault(ph["poi_id"], []).append(ph)

    selected: list[dict[str, Any]] = []
    for poi_id, _d, _p in new_pois_selected:
        cands = by_poi.get(poi_id, [])
        surv = []
        for ph in cands:
            t = ph.get("ai_tags") or {}
            if t.get("has_prominent_faces"):
                continue
            surv.append(ph)
        surv.sort(
            key=lambda ph: (
                not (ph.get("ai_tags") or {}).get("is_exterior"),
                (ph.get("ai_tags") or {}).get("is_generic_storefront", False),
                -(ph.get("width_px") or 0),
            )
        )
        selected.extend(surv[:PHOTOS_PER_POI])

    selected = selected[:12]
    selected_ids = [ph["id"] for ph in selected]

    if len(selected_ids) < 3:
        result["status"] = "not_enough_photos"
        result["photo_count"] = len(selected_ids)
        result["poi_count"] = len(new_pois_selected)
        return result

    # ── enqueue video ──
    row = {
        "scope": "listing_intent_bucket",
        "listing_id": listing_id,
        "intent_bucket": bucket,
        "status": "pending",
        "aspect_ratio": "9:16",
        "input_photo_ids": selected_ids,
    }
    res = sb("generated_videos", "POST", [row], prefer="return=representation")
    new_id = res[0]["id"]
    result["status"] = "queued"
    result["video_id"] = new_id
    result["photo_count"] = len(selected_ids)
    result["poi_count"] = len(new_pois_selected)
    result["radius_progression"] = progression
    result["stopped_at_m"] = stopped_at
    return result


# ─── main ────────────────────────────────────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--listing-id", required=True)
    ap.add_argument(
        "--buckets",
        default="",
        help="CSV of intent buckets. Default: all 14. Recommend: dining,schools,outdoor,shopping,daily_errands",
    )
    ap.add_argument("--force", action="store_true", help="Regenerate buckets that already have a live video.")
    ap.add_argument("--dry-run", action="store_true", help="Validate args + env, print planned work, exit.")
    args = ap.parse_args()

    load_env()
    validate_env()

    listing_id = args.listing_id
    buckets = [b.strip() for b in args.buckets.split(",") if b.strip()] if args.buckets else DEFAULT_BUCKETS
    unknown = [b for b in buckets if b not in BUCKET_PLACES_TYPES]
    if unknown:
        raise SystemExit(f"[fatal] unknown buckets: {', '.join(unknown)}")

    print(f"=== nearby_generate: listing={listing_id} buckets={buckets} force={args.force} dry={args.dry_run} ===")

    # Fetch listing coords
    rows = sb("listings", params=f"?id=eq.{listing_id}&select=id,address,lat,lng")
    if not rows:
        raise SystemExit(f"[fatal] listing {listing_id} not found")
    lat, lng = rows[0].get("lat"), rows[0].get("lng")
    if lat is None or lng is None:
        raise SystemExit(f"[fatal] listing {listing_id} missing lat/lng — geocode first")
    center_lat, center_lng = float(lat), float(lng)
    print(f"    listing address: {rows[0].get('address')}  ({center_lat}, {center_lng})")

    if args.dry_run:
        summary = {
            "dry_run": True,
            "listing_id": listing_id,
            "center": {"lat": center_lat, "lng": center_lng},
            "buckets_planned": [b for b in buckets if BUCKET_PLACES_TYPES.get(b)],
            "buckets_skipped_no_types": [b for b in buckets if not BUCKET_PLACES_TYPES.get(b)],
        }
        print("\n=== DRY RUN SUMMARY ===")
        print(json.dumps(summary, indent=2))
        return 0

    # Load existing listing_pois once (idempotence across buckets)
    lp_rows = sb(
        "listing_pois",
        params=f"?listing_id=eq.{listing_id}&select=poi_id,pois(google_place_id)",
    )
    existing_listing_poi_ids: set[str] = set()
    existing_listing_gpids: set[str] = set()
    for r in lp_rows or []:
        existing_listing_poi_ids.add(r["poi_id"])
        gp = (r.get("pois") or {}).get("google_place_id")
        if gp:
            existing_listing_gpids.add(gp)
    print(f"    existing listing_pois: {len(existing_listing_poi_ids)}")

    per_bucket: list[dict[str, Any]] = []
    for bucket in buckets:
        print(f"\n--- bucket: {bucket} ---")
        try:
            res = run_bucket(
                listing_id,
                center_lat,
                center_lng,
                bucket,
                existing_listing_gpids,
                existing_listing_poi_ids,
                args.force,
            )
        except Exception as e:
            res = {"bucket": bucket, "status": "error", "error": str(e)}
            print(f"    [ERROR] {bucket}: {e}")
        per_bucket.append(res)
        print(f"    [{bucket}] -> {res.get('status')}")

    summary = {
        "listing_id": listing_id,
        "buckets": per_bucket,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    print("\n=== SUMMARY ===")
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
