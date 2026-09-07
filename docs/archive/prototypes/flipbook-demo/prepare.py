#!/usr/bin/env python3
"""Download 5122 Lower Creek photos + build baseline & flipbook shot plans."""
import os
import json, os, sys, urllib.request, urllib.parse
from pathlib import Path

# hack: import photo_selector from Percho repo
sys.path.insert(0, str(Path.home() / "Percho" / "scripts" / "render-worker"))
import photo_selector as PS

URL = "https://tavmbcghxjeyaoptndvn.supabase.co"
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]  # never hardcode; see docs/prototypes/README.md
LID = "c7435419-e5ad-4abb-9f01-83bfc753d0cd"
DIR = Path(__file__).resolve().parent
PHOTOS = DIR / "photos"
PHOTOS.mkdir(exist_ok=True)


def sb_get(table, params):
    q = urllib.parse.urlencode(params)
    req = urllib.request.Request(
        f"{URL}/rest/v1/{table}?{q}",
        headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def storage_download(bucket, path, dest):
    url = f"{URL}/storage/v1/object/{bucket}/{path}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {KEY}", "apikey": KEY})
    with urllib.request.urlopen(req, timeout=60) as r:
        dest.write_bytes(r.read())


def main():
    listing = sb_get("listings", {"id": f"eq.{LID}", "select": "id,address,city,state,price,beds,baths,sqft,slug"})[0]
    photos = sb_get("listing_photos", {
        "listing_id": f"eq.{LID}",
        "select": "id,storage_path,sort_order,ai_tags,tagged_at,width,height",
        "order": "sort_order.asc",
    })
    print(f"listing={listing['address']} photos={len(photos)}")

    # Download all photos with sort_order-prefixed filenames (worker convention)
    for p in photos:
        pid = p["id"]
        so = int(p.get("sort_order") or 0)
        ext = Path(p["storage_path"]).suffix or ".jpg"
        dest = PHOTOS / f"{so:03d}_{pid}{ext}"
        if not dest.exists():
            storage_download("listing-photos", p["storage_path"], dest)
    print(f"downloaded {len(list(PHOTOS.iterdir()))} files")

    # Build photo dicts in photo_selector's expected shape
    ps_input = []
    for p in photos:
        tags = p.get("ai_tags") or {}
        ps_input.append({
            "id": p["id"],
            "sort_order": p.get("sort_order"),
            "usable": tags.get("usable", True),
            "room_type": tags.get("room_type", "other"),
            "is_master": tags.get("is_master", False),
            "hero_score": tags.get("hero_score", 0.5),
            "quality": tags.get("quality", 0.5),
            "subject_label": tags.get("subject_label"),
            "subject_bbox": tags.get("subject_bbox"),
            "caption": tags.get("caption"),
            "time_of_day": tags.get("time_of_day"),
            "style_signals": tags.get("style_signals", []),
        })

    # Baseline plan (current settings)
    baseline_plan = PS.build_plan(ps_input, style="modern", listing_id=LID, max_photos=None)
    total = sum(s["duration_s"] for s in baseline_plan) - (len(baseline_plan) - 1) * PS.XFADE
    print(f"[baseline] {len(baseline_plan)} clips, ~{total:.1f}s")
    (DIR / "plan_baseline.json").write_text(json.dumps({"listing": listing, "style": "modern", "plan": baseline_plan}, indent=2))

    # Flipbook plan: bimodal pacing
    #  hero clips  -> 3.5s (breath)
    #  normal      -> 1.5s (page-flip pace)
    #  low-hero    -> 0.9s (rapid)
    # Also: no forced-static ratio; hero clips get 'static' or slow push-in
    flip_plan = json.loads(json.dumps(baseline_plan))  # deep copy
    ordered_by_hero = sorted(range(len(flip_plan)), key=lambda i: -flip_plan[i].get("hero_score", 0))
    n = len(flip_plan)
    hero_set = set(ordered_by_hero[:3])       # top 3 = hero
    filler_set = set(ordered_by_hero[-max(1, n // 4):])  # bottom quarter = filler
    for i, s in enumerate(flip_plan):
        if i in hero_set:
            s["duration_s"] = 3.5
            s["mode"] = "push_in_slow" if s["mode"] not in ("static",) else "static"
            s["is_hero"] = True
        elif i in filler_set:
            s["duration_s"] = 0.9
            s["mode"] = "static"
            s["is_hero"] = False
        else:
            s["duration_s"] = 1.5
            # keep motion mode from baseline; static-only would be boring
            if s["mode"] == "static":
                s["mode"] = "push_in"
            s["is_hero"] = False
    total_f = sum(s["duration_s"] for s in flip_plan) - (len(flip_plan) - 1) * 0.35
    print(f"[flipbook] {len(flip_plan)} clips (heroes={len(hero_set)}, fillers={len(filler_set)}), ~{total_f:.1f}s")
    (DIR / "plan_flipbook.json").write_text(json.dumps({"listing": listing, "style": "modern", "plan": flip_plan}, indent=2))

    # dump distribution
    print("\nBaseline durations:", [f"{s['duration_s']:.1f}" for s in baseline_plan])
    print("Flipbook durations:", [f"{s['duration_s']:.1f}" for s in flip_plan])


if __name__ == "__main__":
    main()
