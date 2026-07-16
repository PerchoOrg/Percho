#!/usr/bin/env python3
"""
photo_selector — turns a listing's vision-tagged photos into an ordered,
deduped, budget-fitting shot list for the video renderer.

Input: list of per-photo dicts with at minimum these vision fields:
  id, sort_order, storage_path (or local path), room_type, is_master,
  subject_label, subject_bbox, orientation_hint, time_of_day, quality,
  hero_score, usable, _dhash (int)

Output: ordered list of PhotoPlan dicts with:
  id, path, room_type, subject_label, subject_bbox, is_master,
  hero_score, quality, duration_s, mode, is_static

Config (Phase 93):
  TOTAL_CAP = 60s, MIN = 2.5s, MAX = 6.0s, XFADE = 0.5s.
  dhash Hamming distance < 10 → treat as near-dup.
  10% of clips randomly forced to `static` mode (seeded by listing_id).
  Hero-boost: top-3 hero_score photos each +0.5s (redistributed).
  floorplan never included in the video.
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Any


TOTAL_CAP = 60.0
MIN_PER_PHOTO = 2.5
MAX_PER_PHOTO = 6.0
XFADE = 0.5
DHASH_THRESHOLD = 10
STATIC_RATIO = 0.10
HERO_BOOST_COUNT = 3
HERO_BOOST_SECONDS = 0.5

# Quotas: min photos we'd like to have, max we'll ever include.
# priority: lower = filled first when trimming budget.
QUOTAS: dict[str, dict[str, int]] = {
    "exterior":          {"min": 1, "max": 3, "priority": 1},
    "living":            {"min": 1, "max": 4, "priority": 2},
    "kitchen":           {"min": 1, "max": 4, "priority": 2},
    "dining":            {"min": 0, "max": 2, "priority": 3},
    "bedroom":           {"min": 1, "max": 4, "priority": 2},
    "bathroom":          {"min": 0, "max": 3, "priority": 3},
    "office":            {"min": 0, "max": 1, "priority": 4},
    "backyard":          {"min": 0, "max": 3, "priority": 2},
    "pool":              {"min": 0, "max": 2, "priority": 2},
    "balcony":           {"min": 0, "max": 2, "priority": 3},
    "community_amenity": {"min": 0, "max": 2, "priority": 3},
    "hallway":           {"min": 0, "max": 1, "priority": 5},
    "garage":            {"min": 0, "max": 1, "priority": 5},
    "closet":            {"min": 0, "max": 0, "priority": 9},  # never
    "laundry":           {"min": 0, "max": 0, "priority": 9},  # never
    "basement":          {"min": 0, "max": 1, "priority": 5},
    "floorplan":         {"min": 0, "max": 0, "priority": 9},  # never in video
    "other":             {"min": 0, "max": 1, "priority": 6},
}

# Narrative sort weight per room type (lower = earlier in the film).
# Story arc:
#   exterior (front) → living → kitchen → dining → bedroom (master first) →
#   bathroom → office → backyard/pool/balcony → community amenity → exterior (dusk/other)
NARRATIVE_ORDER = {
    "exterior":          10,
    "living":            20,
    "kitchen":           30,
    "dining":            40,
    "bedroom":           50,   # master gets -5 inside
    "bathroom":          60,
    "office":            65,
    "hallway":           70,
    "garage":            72,
    "basement":          74,
    "balcony":           80,
    "backyard":          82,
    "pool":              84,
    "community_amenity": 90,
    "other":             95,
    "floorplan":         999,
}

# Style × room → motion template pool. Renderer picks one at random per clip.
# Empty list = fall back to default_modes_for_room().
STYLE_ROOM_TEMPLATES: dict[str, dict[str, list[str]]] = {
    "luxury": {
        "exterior": ["push_in_slow"],
        "living":   ["pull_back", "push_pan_lr"],
        "kitchen":  ["pan_to_subject"],
        "bedroom":  ["push_in_slow"],
        "bathroom": ["tilt_td"],
        "pool":     ["pull_back", "pan_to_subject"],
        "backyard": ["pull_back"],
        "balcony":  ["pan_to_subject"],
    },
    "modern": {
        "exterior": ["push_in", "pull_back"],
        "living":   ["push_pan_lr", "push_pan_rl", "pull_back"],
        "kitchen":  ["pan_to_subject", "pan_lr"],
        "bedroom":  ["push_in"],
        "bathroom": ["tilt_td"],
        "backyard": ["pull_back"],
        "balcony":  ["pan_to_subject"],
    },
    "traditional": {
        "exterior": ["push_in"],
        "living":   ["push_in", "pan_lr"],
        "kitchen":  ["pan_to_subject"],
        "bedroom":  ["push_in"],
        "bathroom": ["tilt_td"],
        "backyard": ["pull_back"],
    },
    "cozy": {
        "exterior": ["push_in"],
        "living":   ["push_pan_lr", "push_in"],
        "kitchen":  ["pan_lr"],
        "bedroom":  ["push_in"],
        "bathroom": ["tilt_td"],
    },
    "rural": {
        "exterior": ["pull_back", "push_in_slow"],
        "backyard": ["pull_back"],
        "living":   ["push_in"],
    },
}


def default_modes_for_room(room_type: str) -> list[str]:
    return {
        "exterior":          ["push_in", "pull_back"],
        "living":            ["push_pan_lr", "push_pan_rl", "pull_back"],
        "kitchen":           ["pan_to_subject", "pan_lr"],
        "dining":            ["push_in"],
        "bedroom":           ["push_in"],
        "bathroom":          ["tilt_td"],
        "office":            ["push_in"],
        "backyard":          ["pull_back", "pan_lr"],
        "pool":              ["pull_back", "pan_to_subject"],
        "balcony":           ["pan_to_subject"],
        "community_amenity": ["pull_back"],
        "hallway":           ["push_in_slow"],
        "garage":            ["static"],
        "basement":          ["push_in_slow"],
        "other":             ["static", "push_in"],
    }.get(room_type, ["push_in"])


def hamming(a: int, b: int) -> int:
    return bin(a ^ b).count("1")


def dedupe(photos: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Drop near-duplicates by dHash; keep the higher-quality one."""
    photos = sorted(photos, key=lambda p: -p.get("quality", 0))
    kept: list[dict[str, Any]] = []
    for p in photos:
        h = p.get("_dhash")
        if h is None:
            kept.append(p)
            continue
        dup = False
        for k in kept:
            kh = k.get("_dhash")
            if kh is not None and hamming(h, kh) < DHASH_THRESHOLD:
                dup = True
                break
        if not dup:
            kept.append(p)
    return kept


def select_by_quota(photos: list[dict[str, Any]], budget: int) -> list[dict[str, Any]]:
    """
    Fill quotas.min for every room type first (basic coverage), then fill
    remaining budget by priority × hero_score. Never exceed quota.max.
    """
    # Bucket by room type
    by_room: dict[str, list[dict[str, Any]]] = {}
    for p in photos:
        rt = p.get("room_type", "other")
        if rt not in QUOTAS:
            rt = "other"
        # is_master bedroom sorts first inside "bedroom"
        by_room.setdefault(rt, []).append(p)
    for rt, lst in by_room.items():
        lst.sort(key=lambda p: (
            not p.get("is_master", False),          # master first
            -p.get("hero_score", 0),
            -p.get("quality", 0),
        ))

    picked: list[dict[str, Any]] = []
    used: dict[str, int] = {rt: 0 for rt in QUOTAS}

    # Pass 1: satisfy mins
    for rt, q in sorted(QUOTAS.items(), key=lambda kv: kv[1]["priority"]):
        if q["min"] <= 0 or q["max"] <= 0:
            continue
        avail = by_room.get(rt, [])
        take = min(q["min"], len(avail), q["max"])
        for p in avail[:take]:
            picked.append(p)
            used[rt] += 1
        if len(picked) >= budget:
            break

    # Pass 2: fill remaining budget, priority × hero_score
    if len(picked) < budget:
        pool: list[tuple[int, float, dict[str, Any], str]] = []
        for rt, avail in by_room.items():
            q = QUOTAS.get(rt, QUOTAS["other"])
            if q["max"] <= 0:
                continue
            for p in avail:
                if p in picked:
                    continue
                pool.append((q["priority"], -p.get("hero_score", 0), p, rt))
        pool.sort(key=lambda t: (t[0], t[1]))
        for _prio, _neg, p, rt in pool:
            if len(picked) >= budget:
                break
            if used[rt] >= QUOTAS[rt]["max"]:
                continue
            picked.append(p)
            used[rt] += 1

    return picked


def narrative_sort(photos: list[dict[str, Any]]) -> list[dict[str, Any]]:
    def key(p: dict[str, Any]) -> tuple[int, int, float]:
        rt = p.get("room_type", "other")
        base = NARRATIVE_ORDER.get(rt, 100)
        # is_master bedroom lifts within bedroom slot
        if rt == "bedroom" and p.get("is_master"):
            base -= 5
        # Prefer high hero_score first within room type (opens the sequence strong)
        return (base, 0, -p.get("hero_score", 0))
    ordered = sorted(photos, key=key)

    # If we have 2+ exteriors, save one for the end (dusk/other angle preferred).
    ext = [p for p in ordered if p.get("room_type") == "exterior"]
    if len(ext) >= 2:
        # Pick the second-best (lower hero_score) exterior for the closer.
        closer = sorted(ext, key=lambda p: -p.get("hero_score", 0))[1]
        ordered.remove(closer)
        ordered.append(closer)
    return ordered


def plan_durations(n: int, hero_ranks: list[int]) -> list[float]:
    """
    Given N clips, return per-clip duration to fill ~TOTAL_CAP with crossfades,
    clamped to [MIN,MAX]. hero_ranks are indices of clips getting +HERO_BOOST_SECONDS.
    """
    if n == 0:
        return []
    # Total clip time needed to yield (cap) seconds after (n-1) xfades:
    # total_video = sum(clip) - (n-1)*xfade  →  sum(clip) = cap + (n-1)*xfade
    target = TOTAL_CAP + (n - 1) * XFADE
    per = target / n
    per = max(MIN_PER_PHOTO, min(MAX_PER_PHOTO, per))
    durations = [per] * n

    # Hero boost: give heroes +HERO_BOOST_SECONDS, take from non-heroes evenly.
    if hero_ranks and n > len(hero_ranks):
        boost_total = HERO_BOOST_SECONDS * len(hero_ranks)
        take_per = boost_total / (n - len(hero_ranks))
        for i in range(n):
            if i in hero_ranks:
                durations[i] = min(MAX_PER_PHOTO, durations[i] + HERO_BOOST_SECONDS)
            else:
                durations[i] = max(MIN_PER_PHOTO, durations[i] - take_per)
    return durations


def assign_modes(picked: list[dict[str, Any]], style: str, seed: int) -> list[str]:
    rng = random.Random(seed)
    modes: list[str] = []
    templates = STYLE_ROOM_TEMPLATES.get(style, {})
    for p in picked:
        rt = p.get("room_type", "other")
        pool = templates.get(rt) or default_modes_for_room(rt)
        # If subject_bbox is missing/degenerate, drop pan_to_subject from pool
        bbox = p.get("subject_bbox")
        if not bbox or len(bbox) != 4 or bbox[2] < 0.05 or bbox[3] < 0.05:
            pool = [m for m in pool if m != "pan_to_subject"] or ["push_in"]
        modes.append(rng.choice(pool))

    # 10% forced static
    n_static = max(0, round(len(picked) * STATIC_RATIO))
    if n_static > 0:
        # Choose indices with LOWEST hero_score for static (they're the ones
        # least worth energetic motion — gives the audience a breath).
        idx_by_hero = sorted(range(len(picked)), key=lambda i: picked[i].get("hero_score", 0))
        for i in idx_by_hero[:n_static]:
            modes[i] = "static"
    return modes


def build_plan(
    photos: list[dict[str, Any]],
    style: str,
    listing_id: str,
    max_photos: int | None = None,
) -> list[dict[str, Any]]:
    """
    Main entry point. Returns list of shot dicts ready for the renderer.
    """
    # 1. drop unusable / no-video room types
    usable = [
        p for p in photos
        if p.get("usable", True)
        and QUOTAS.get(p.get("room_type", "other"), QUOTAS["other"])["max"] > 0
    ]

    # 2. dedupe by dHash
    usable = dedupe(usable)

    # 3. determine budget
    #    max feasible clips at MIN duration:  cap = n*MIN - (n-1)*XFADE
    #    n = (cap + XFADE) / (MIN + XFADE) ... no wait, per clip is >= MIN,
    #    total video = sum - (n-1)*xfade. If per=MIN: cap = n*MIN - (n-1)*xfade
    #    → n = (cap - xfade) / (MIN - xfade) → but MIN>xfade so:
    hard_cap_n = int((TOTAL_CAP + XFADE) // (MIN_PER_PHOTO - XFADE + XFADE))
    # Simpler: total_clip_time = cap + (n-1)*xfade, and per >= MIN
    # So n <= (cap + xfade) / MIN  (approximately). Use that.
    max_n_by_budget = int((TOTAL_CAP + XFADE) / (MIN_PER_PHOTO - 0.0))
    budget = min(max_n_by_budget, max_photos or 9999, len(usable))

    # 4. quota-based selection
    picked = select_by_quota(usable, budget)

    # 5. narrative sort
    ordered = narrative_sort(picked)

    # 6. duration plan (hero boost = top-3 hero_score positions)
    hero_ranks = sorted(range(len(ordered)),
                        key=lambda i: -ordered[i].get("hero_score", 0))[:HERO_BOOST_COUNT]
    durations = plan_durations(len(ordered), hero_ranks)

    # 7. mode assignment (style-aware, seeded on listing_id)
    seed = hash(listing_id) & 0xFFFFFFFF
    modes = assign_modes(ordered, style, seed)

    plan: list[dict[str, Any]] = []
    for i, p in enumerate(ordered):
        plan.append({
            "id": p.get("id") or p.get("_id"),
            "sort_order": p.get("sort_order") if p.get("sort_order") is not None else p.get("_sort_order"),
            "room_type": p.get("room_type"),
            "is_master": bool(p.get("is_master")),
            "subject_label": p.get("subject_label"),
            "subject_bbox": p.get("subject_bbox"),
            "ai_caption": p.get("caption"),
            "hero_score": p.get("hero_score", 0),
            "quality": p.get("quality", 0),
            "duration_s": round(durations[i], 2),
            "mode": modes[i],
            "is_hero": i in hero_ranks,
        })
    return plan


def caption_for_shot(shot: dict[str, Any]) -> str:
    """Short 1-3 word caption per clip, derived from vision output.
    Prefers subject_label when concrete (island, fireplace, pool). Falls
    back to a room_type label. Empty string = no caption."""
    rt = (shot.get("room_type") or "").lower()
    subj = (shot.get("subject_label") or "").lower().strip()
    is_master = bool(shot.get("is_master"))
    if subj in ("null", "none"):
        subj = ""

    subj_pretty = {
        "island":      "Kitchen Island",
        "fireplace":   "Fireplace",
        "bed":         "Master Suite" if is_master else "Bedroom",
        "vanity":      "Vanity",
        "mirror":      "Vanity",
        "range":       "Kitchen",
        "window_view": "Views",
        "pool":        "Community Pool" if rt == "exterior" else "Pool",
        "view":        "Views",
        "stairs":      "Staircase",
        "door":        None,   # too generic, fall through to room label
    }.get(subj)
    if subj_pretty:
        return subj_pretty

    return {
        "exterior":          "Curb Appeal",
        "living":            "Living Room",
        "kitchen":           "Kitchen",
        "dining":            "Dining",
        "bedroom":           "Master Bedroom" if is_master else "Bedroom",
        "bathroom":          "Primary Bath" if is_master else "Bathroom",
        "office":            "Office",
        "backyard":          "Backyard",
        "pool":              "Pool",
        "balcony":           "Balcony",
        "community_amenity": "Community",
        "garage":            "Garage",
        "basement":          "Basement",
    }.get(rt, "")


if __name__ == "__main__":
    import argparse, json, sys

    ap = argparse.ArgumentParser()
    ap.add_argument("spike_json", help="path to spike_<listing_id>.json")
    ap.add_argument("--style", default=None, help="override style (else read from _style.json)")
    ap.add_argument("--max-photos", type=int, default=None)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    data = json.load(open(args.spike_json))
    listing = data["listing"]
    photos = data["photos"]

    # Load style from sibling _style.json if not overridden
    style = args.style
    if style is None:
        sp = args.spike_json.replace(".json", "_style.json")
        try:
            style = json.load(open(sp)).get("style", "modern")
        except Exception:
            style = "modern"

    plan = build_plan(photos, style, listing["id"], max_photos=args.max_photos)

    total_video = sum(s["duration_s"] for s in plan) - (len(plan) - 1) * XFADE
    print(f"Listing: {listing['address']} | style={style} | {len(photos)}→{len(plan)} photos | ~{total_video:.1f}s video", file=sys.stderr)
    print(f"{'#':>3} {'sort':>4} {'room':<18} {'mstr':<5} {'subj':<14} {'hero':<5} {'dur':<5} {'mode':<18}", file=sys.stderr)
    for i, s in enumerate(plan):
        print(f"{i:>3} {s['sort_order']:>4} {s['room_type']:<18} {str(s['is_master']):<5} "
              f"{str(s['subject_label'])[:14]:<14} {s['hero_score']:<5.2f} {s['duration_s']:<5.2f} {s['mode']:<18}",
              file=sys.stderr)

    out = args.out or args.spike_json.replace(".json", "_plan.json")
    json.dump({"listing": listing, "style": style, "plan": plan}, open(out, "w"), indent=2)
    print(f"\nWrote {out}", file=sys.stderr)
