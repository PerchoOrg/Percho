#!/usr/bin/env python3
"""
Spike: run Claude Sonnet 4.5 vision on every photo of a listing and print
the tags for eyeball review. Also runs a style aggregation pass on the
top hero_score photos.

Usage:
    python vision_tag_listing.py <listing_id>

Env:
    NEXT_PUBLIC_SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
    ANTHROPIC_API_KEY
    ANTHROPIC_VISION_MODEL (optional, default claude-sonnet-4-5)

Output:
    /tmp/spike_<listing_id>.json      full per-photo tags
    /tmp/spike_<listing_id>_style.json  style aggregation result
    stdout: compact per-photo summary + style + duration plan preview
"""
import base64
import concurrent.futures as cf
import io
import json
import os
import sys
import urllib.request
from pathlib import Path

MODEL = os.environ.get("ANTHROPIC_VISION_MODEL", "claude-sonnet-4-5")
API = "https://api.anthropic.com/v1/messages"

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


def load_env():
    env = {}
    for line in open("/home/ubuntu/Percho/.env.local"):
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k] = v.strip('"').strip("'")
    return env


def fetch_photos(env, listing_id):
    url = f"{env['NEXT_PUBLIC_SUPABASE_URL']}/rest/v1/listing_photos?select=id,storage_path,sort_order,width,height&listing_id=eq.{listing_id}&order=sort_order"
    req = urllib.request.Request(
        url,
        headers={
            "apikey": env["SUPABASE_SERVICE_ROLE_KEY"],
            "authorization": "Bearer " + env["SUPABASE_SERVICE_ROLE_KEY"],
        },
    )
    return json.loads(urllib.request.urlopen(req).read())


def fetch_listing(env, listing_id):
    url = f"{env['NEXT_PUBLIC_SUPABASE_URL']}/rest/v1/listings?select=id,address,city,state,price,beds,baths,sqft&id=eq.{listing_id}"
    req = urllib.request.Request(
        url,
        headers={
            "apikey": env["SUPABASE_SERVICE_ROLE_KEY"],
            "authorization": "Bearer " + env["SUPABASE_SERVICE_ROLE_KEY"],
        },
    )
    return json.loads(urllib.request.urlopen(req).read())[0]


def download_photo(env, storage_path, dest):
    url = f"{env['NEXT_PUBLIC_SUPABASE_URL']}/storage/v1/object/listing-photos/{storage_path}"
    req = urllib.request.Request(
        url, headers={"authorization": "Bearer " + env["SUPABASE_SERVICE_ROLE_KEY"]}
    )
    data = urllib.request.urlopen(req).read()
    dest.write_bytes(data)


def dhash(image_path):
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


def call_vision(system, user_prompt, image_b64_list, media_type="image/jpeg"):
    content = []
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
    resp = urllib.request.urlopen(req, timeout=90)
    data = json.loads(resp.read())
    text = next(c["text"] for c in data["content"] if c["type"] == "text")
    # strip markdown fences if present
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0]
    return json.loads(text)


def tag_one(env, photo, cache_dir):
    dest = cache_dir / f"{photo['id']}.jpg"
    if not dest.exists():
        download_photo(env, photo["storage_path"], dest)
    b64 = base64.b64encode(dest.read_bytes()).decode()
    try:
        tags = call_vision(
            PER_PHOTO_SYSTEM,
            f"Photo sort_order={photo['sort_order']}, dims={photo.get('width')}x{photo.get('height')}. Label it.",
            [b64],
        )
        tags["_id"] = photo["id"]
        tags["_sort_order"] = photo["sort_order"]
        tags["_dhash"] = dhash(dest)
        return tags
    except Exception as e:
        return {"_id": photo["id"], "_sort_order": photo["sort_order"], "error": str(e)}


def main():
    listing_id = sys.argv[1]
    env = load_env()
    if not os.environ.get("ANTHROPIC_API_KEY"):
        os.environ["ANTHROPIC_API_KEY"] = env.get("ANTHROPIC_API_KEY", "")
    if not os.environ.get("ANTHROPIC_API_KEY"):
        sys.exit("ANTHROPIC_API_KEY missing")

    listing = fetch_listing(env, listing_id)
    photos = fetch_photos(env, listing_id)
    print(f"Listing: {listing['address']}, {listing['city']} {listing['state']} — ${listing['price']:,} — {len(photos)} photos", file=sys.stderr)

    cache_dir = Path(f"/tmp/spike_photos_{listing_id}")
    cache_dir.mkdir(exist_ok=True)

    results = [None] * len(photos)
    with cf.ThreadPoolExecutor(max_workers=8) as ex:
        futs = {ex.submit(tag_one, env, p, cache_dir): i for i, p in enumerate(photos)}
        for done_count, fut in enumerate(cf.as_completed(futs), 1):
            i = futs[fut]
            results[i] = fut.result()
            print(f"[{done_count}/{len(photos)}] sort={results[i]['_sort_order']} "
                  f"room={results[i].get('room_type','?')} "
                  f"hero={results[i].get('hero_score','?')} "
                  f"q={results[i].get('quality','?')}", file=sys.stderr)

    out = Path(f"/tmp/spike_{listing_id}.json")
    out.write_text(json.dumps({"listing": listing, "photos": results}, indent=2))
    print(f"\nWrote {out}", file=sys.stderr)

    # Style aggregation: send top 6 hero photos
    valid = [r for r in results if "hero_score" in r]
    top = sorted(valid, key=lambda r: -r["hero_score"])[:6]
    b64s = []
    for r in top:
        img = cache_dir / f"{r['_id']}.jpg"
        b64s.append(base64.b64encode(img.read_bytes()).decode())
    user = (f"Listing price ${listing['price']:,}, {listing['beds']}b/{listing['baths']}ba/"
            f"{listing['sqft']}sqft in {listing['city']}, {listing['state']}. "
            f"Classify overall style.")
    try:
        style = call_vision(STYLE_SYSTEM, user, b64s)
    except Exception as e:
        style = {"error": str(e)}
    style_out = Path(f"/tmp/spike_{listing_id}_style.json")
    style_out.write_text(json.dumps(style, indent=2))
    print("\n=== STYLE ===")
    print(json.dumps(style, indent=2))

    # Summary table
    print("\n=== PER-PHOTO SUMMARY ===")
    print(f"{'sort':>4} {'room':<12} {'master':<7} {'subj':<15} {'hero':<5} {'q':<5} {'usable':<7} signals")
    for r in results:
        if "error" in r:
            print(f"{r['_sort_order']:>4} ERROR {r['error'][:80]}")
            continue
        print(f"{r['_sort_order']:>4} {r.get('room_type','?'):<12} {str(r.get('is_master','')):<7} "
              f"{str(r.get('subject_label',''))[:15]:<15} "
              f"{r.get('hero_score',0):<5.2f} {r.get('quality',0):<5.2f} "
              f"{str(r.get('usable','')):<7} {','.join(r.get('style_signals',[])[:3])}")

    # Room type histogram
    print("\n=== ROOM HISTOGRAM ===")
    hist = {}
    for r in results:
        rt = r.get("room_type", "error")
        hist[rt] = hist.get(rt, 0) + 1
    for k, v in sorted(hist.items(), key=lambda x: -x[1]):
        print(f"  {k:<12} {v}")

    # dHash near-duplicate pairs (Hamming < 8)
    print("\n=== NEAR-DUP PAIRS (Hamming < 8) ===")
    pairs = []
    for i, a in enumerate(results):
        if "_dhash" not in a: continue
        for b in results[i+1:]:
            if "_dhash" not in b: continue
            dist = bin(a["_dhash"] ^ b["_dhash"]).count("1")
            if dist < 8:
                pairs.append((dist, a["_sort_order"], b["_sort_order"],
                              a.get("room_type"), b.get("room_type")))
    for p in sorted(pairs)[:30]:
        print(f"  d={p[0]:>2} sort {p[1]:>3}({p[3]}) <-> sort {p[2]:>3}({p[4]})")
    if len(pairs) > 30:
        print(f"  ... {len(pairs)-30} more")


if __name__ == "__main__":
    main()
