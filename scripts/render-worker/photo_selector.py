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
  hero_score, quality, duration_s, mode, is_hero

Config (Phase 93):
  TOTAL_CAP = 60s, XFADE = 0.5s. Clip length comes from the pacing tiers
  below (MIN/MAX_PER_PHOTO only bound the uniform curve, PACE_BIMODAL=False).
  dhash Hamming distance < 10 → treat as near-dup.
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
HERO_BOOST_COUNT = 3
HERO_BOOST_SECONDS = 0.5

# ── Pacing (2026-07-28) ──────────────────────────────────────────────────────
# Owner on device: "节奏太慢". The uniform curve above divides a 60s cap by N,
# so a 12-shot tour is 12 × 5s — every shot the same length, which reads as a
# slideshow rather than a tour. A bimodal curve gives the video a beat: heroes
# breathe, the middle keeps pace, the weakest shots pass quickly.
#
#   top HERO_BOOST_COUNT by hero_score      → PACE_HERO_S   (dwell)
#   bottom PACE_FILLER_FRACTION by score    → PACE_FILLER_S (quick pass)
#   everything else                         → PACE_NORMAL_S
#
# Owner 2026-08-09, watching the first depthflow tour: the short beats read as
# too fast to take a room in — "每张照片至少 2-3 秒". The beat stays, the floor
# comes up: nothing is shorter than PACE_FILLER_S now, so the curve compresses
# from 1.0–3.4 to 2.0–3.5.
#
# Owner 2026-08-10: "注意我们的2.5到3.5的约束" — the floor comes up again, so
# every clip now sits inside the 2.5-3.5s band the owner set for taking a room
# in. The 2.0s beat read as a still rather than a quick pass.
#
# A 12-shot tour: 3×3.5 + 3×2.5 + 6×3.0 = 36s of clips → ~30s after xfades.
# Set PACE_BIMODAL = False to restore the uniform curve.
PACE_BIMODAL = True
PACE_HERO_S = 3.5
PACE_NORMAL_S = 3.0
PACE_FILLER_S = 2.5
PACE_FILLER_FRACTION = 0.25

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
    # Owner 2026-08-10: "其他的效果多多少少都分配一点 不要太单一". Measured over
    # 20 simulated tours, two thirds of every video was a push-in, because most
    # of these lists had one entry. Each room now offers moves from several
    # families (push / pull / pan / tilt) so the picker has something to pick
    # BETWEEN — assign_modes then balances what actually gets used.
    "luxury": {
        "exterior": ["push_in_slow", "pull_back", "tilt_td"],
        "living":   ["pull_back", "push_pan_lr", "push_pan_rl"],
        "kitchen":  ["pan_to_subject", "pan_rl", "push_in_slow"],
        "bedroom":  ["push_in_slow", "pan_lr", "pull_back"],
        "bathroom": ["tilt_td", "pan_rl", "push_in_slow"],
        "pool":     ["pull_back", "pan_to_subject", "pan_lr"],
        "backyard": ["pull_back", "pan_rl", "push_in_slow"],
        "balcony":  ["pan_to_subject", "tilt_td", "pull_back"],
    },
    "modern": {
        "exterior": ["push_in", "pull_back", "pan_lr", "tilt_td"],
        "living":   ["push_pan_lr", "push_pan_rl", "pull_back", "push_in"],
        "kitchen":  ["pan_to_subject", "pan_lr", "push_in", "tilt_td"],
        "bedroom":  ["push_in", "pan_rl", "pull_back"],
        "bathroom": ["tilt_td", "pan_rl", "push_in_slow"],
        "backyard": ["pull_back", "pan_lr", "push_in"],
        "balcony":  ["pan_to_subject", "tilt_td", "push_in"],
    },
    "traditional": {
        "exterior": ["push_in", "pull_back", "tilt_td"],
        "living":   ["push_in", "pan_lr", "push_pan_rl", "pull_back"],
        "kitchen":  ["pan_to_subject", "pan_rl", "push_in"],
        "bedroom":  ["push_in", "pan_lr", "pull_back"],
        "bathroom": ["tilt_td", "pan_rl", "push_in_slow"],
        "backyard": ["pull_back", "pan_lr", "push_in_slow"],
    },
    "cozy": {
        "exterior": ["push_in", "pull_back", "pan_rl"],
        "living":   ["push_pan_lr", "push_in", "pull_back", "pan_rl"],
        "kitchen":  ["pan_lr", "pan_to_subject", "push_in"],
        "bedroom":  ["push_in", "pan_rl", "tilt_td"],
        "bathroom": ["tilt_td", "pan_lr", "push_in_slow"],
    },
    "rural": {
        "exterior": ["pull_back", "push_in_slow", "pan_lr", "tilt_td"],
        "backyard": ["pull_back", "pan_rl", "push_in_slow"],
        "living":   ["push_in", "push_pan_lr", "pull_back"],
    },
}


def default_modes_for_room(room_type: str) -> list[str]:
    return {
        "exterior":          ["push_in", "pull_back", "pan_lr", "tilt_td"],
        "living":            ["push_pan_lr", "push_pan_rl", "pull_back", "push_in"],
        "kitchen":           ["pan_to_subject", "pan_lr", "push_in", "tilt_td"],
        "dining":            ["push_in", "pan_rl", "pull_back"],
        "bedroom":           ["push_in", "pan_lr", "pull_back"],
        "bathroom":          ["tilt_td", "pan_rl", "push_in_slow"],
        "office":            ["push_in", "pan_lr", "tilt_td"],
        "backyard":          ["pull_back", "pan_lr", "push_in"],
        "pool":              ["pull_back", "pan_to_subject", "pan_rl"],
        "balcony":           ["pan_to_subject", "tilt_td", "pull_back"],
        "community_amenity": ["pull_back", "pan_lr", "push_in_slow"],
        "hallway":           ["push_in_slow", "pan_rl", "tilt_td"],
        "garage":            ["push_in_slow", "pan_lr"],
        "basement":          ["push_in_slow", "push_in", "pan_rl"],
        "other":             ["push_in_slow", "push_in", "pan_lr"],
    }.get(room_type, ["push_in"])


def hamming(a: int, b: int) -> int:
    return bin(a ^ b).count("1")


def dedupe(
    photos: list[dict[str, Any]],
    dropped: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    """Drop near-duplicates by dHash; keep the higher-quality one.

    `dropped` collects photo_id -> why, for the admin table. Every rejection in
    this file used to be invisible: the plan step reported one string listing
    all three possible causes, which told the reviewer nothing and could not be
    argued with (owner 2026-08-21). A verdict you cannot question is a verdict
    you cannot fix.
    """
    photos = sorted(photos, key=lambda p: -p.get("quality", 0))
    kept: list[dict[str, Any]] = []
    for p in photos:
        h = p.get("_dhash")
        if h is None:
            kept.append(p)
            continue
        twin = None
        for k in kept:
            kh = k.get("_dhash")
            if kh is not None and hamming(h, kh) < DHASH_THRESHOLD:
                twin = k
                break
        if twin is None:
            kept.append(p)
        elif dropped is not None and p.get("id"):
            # Name the survivor and the quality gap, so "why this one and not
            # that one" is answerable from the row.
            twin_label = twin.get("room_type") or "another photo"
            dropped[p["id"]] = (
                f"near-duplicate of a {twin_label} shot that scored higher "
                f"({twin.get('quality', 0):.2f} vs {p.get('quality', 0):.2f})"
            )
    return kept


def select_by_quota(
    photos: list[dict[str, Any]],
    budget: int,
    dropped: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    """
    Fill quotas.min for every room type first (basic coverage), then fill
    remaining budget by priority × hero_score. Never exceed quota.max.

    `dropped` distinguishes the two ways a photo loses here, which want
    different responses from the reviewer: the room is FULL (raise the quota,
    or reject a sibling), or the film is full (nothing to do — it lost on
    merit).
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
        full = False
        for _prio, _neg, p, rt in pool:
            if len(picked) >= budget:
                # Everything from here on lost to the clock, not to a rule.
                full = True
            if full:
                if dropped is not None and p.get("id"):
                    dropped[p["id"]] = (
                        f"the film was already full at {budget} shots — "
                        f"ranked below the ones that made it"
                    )
                continue
            if used[rt] >= QUOTAS[rt]["max"]:
                if dropped is not None and p.get("id"):
                    dropped[p["id"]] = (
                        f"{rt} quota full — the film already has "
                        f"{QUOTAS[rt]['max']} {rt} shot(s)"
                    )
                continue
            picked.append(p)
            used[rt] += 1

    # Final sweep: anything still unexplained.
    #
    # Pass 2 only runs when pass 1 left room, so a listing whose minimums
    # already fill the budget skips it entirely and every leftover photo comes
    # out of here with no verdict. A test caught exactly that — the fallback
    # string in the plan step is meant to be unreachable, so a silent drop is
    # the bug, not the message.
    if dropped is not None:
        chosen = {id(p) for p in picked}
        for p in photos:
            pid = p.get("id")
            if not pid or id(p) in chosen or pid in dropped:
                continue
            rt = p.get("room_type", "other")
            rt = rt if rt in QUOTAS else "other"
            if QUOTAS[rt]["max"] <= 0:
                dropped[pid] = f"{rt} is never shown in a tour"
            elif used.get(rt, 0) >= QUOTAS[rt]["max"]:
                dropped[pid] = (
                    f"{rt} quota full — the film already has "
                    f"{QUOTAS[rt]['max']} {rt} shot(s)"
                )
            else:
                dropped[pid] = (
                    f"the film was already full at {budget} shots — "
                    f"ranked below the ones that made it"
                )

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


def square_overflow(photo: dict[str, Any]) -> float:
    """How much of this photo the square canvas cannot show at once.

    Expressed as a fraction of the frame: a 3:2 photo is 0.50, meaning the
    frame has to travel half its own width to reveal the whole thing. 0.0 for
    a photo already square, or one whose dimensions we never learned.
    """
    w, h = photo.get("width"), photo.get("height")
    if not w or not h:
        return 0.0
    ar = w / h
    return abs(ar - 1.0) if ar >= 1.0 else abs(1.0 / ar - 1.0)


def plan_durations(n: int, hero_ranks: list[int],
                   filler_ranks: list[int] | None = None) -> list[float]:
    """
    Per-clip durations.

    Bimodal (default, PACE_BIMODAL): heroes dwell, filler passes quickly,
    the rest keeps a walking pace. Total length is whatever the beats add up
    to — deliberately NOT stretched to fill TOTAL_CAP, because filling a fixed
    budget is exactly what made every clip the same length.

    Uniform (PACE_BIMODAL = False): the Phase 93 curve — fill ~TOTAL_CAP,
    clamp to [MIN,MAX], +HERO_BOOST_SECONDS on heroes taken from the others.
    """
    if n == 0:
        return []

    if PACE_BIMODAL:
        fillers = set(filler_ranks or [])
        heroes = set(hero_ranks)
        out: list[float] = []
        for i in range(n):
            if i in heroes:
                out.append(PACE_HERO_S)
            elif i in fillers:
                out.append(PACE_FILLER_S)
            else:
                out.append(PACE_NORMAL_S)
        return out

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


# Modes that read as the same gesture to a viewer. Balancing by family rather
# than by mode is what "不要太单一" actually means: push_in and push_in_slow are
# two names for pushing in, and a tour that alternates between them still looks
# like one long push.
MODE_FAMILY = {
    "push_in": "push", "push_in_slow": "push",
    "pull_back": "pull",
    "pan_lr": "pan", "pan_rl": "pan", "pan_to_subject": "pan",
    "push_pan_lr": "push_pan", "push_pan_rl": "push_pan",
    "tilt_td": "tilt",
}
# No family may exceed this share of a tour while another family is available
# from the same room's pool.
FAMILY_MAX_SHARE = 0.40


def family_of(mode: str) -> str:
    return MODE_FAMILY.get(mode, mode)


def balance_families(modes: list[str], pools: list[list[str]],
                     rng: random.Random) -> list[str]:
    """Trade clips out of over-used families into under-used ones.

    Only ever swaps a clip for another mode its own room offered, so the shot
    stays appropriate to the room; a clip whose pool has nothing else to give
    is left alone. Bounded by construction — every swap strictly reduces the
    leading family's count.
    """
    n = len(modes)
    if n < 3:
        return modes
    limit = max(1, int(n * FAMILY_MAX_SHARE))
    for _ in range(n):
        counts: dict[str, int] = {}
        for m in modes:
            counts[family_of(m)] = counts.get(family_of(m), 0) + 1
        worst = max(counts, key=lambda f: counts[f])
        if counts[worst] <= limit:
            break
        # Prefer moving a clip into the family used least so far.
        candidates = [
            (i, alt)
            for i, m in enumerate(modes) if family_of(m) == worst
            for alt in pools[i] if family_of(alt) != worst
        ]
        if not candidates:
            break
        i, alt = min(
            candidates,
            key=lambda ia: (counts.get(family_of(ia[1]), 0), rng.random()),
        )
        modes[i] = alt
    return modes


def assign_modes(picked: list[dict[str, Any]], style: str, seed: int) -> list[str]:
    rng = random.Random(seed)
    modes: list[str] = []
    pools: list[list[str]] = []
    templates = STYLE_ROOM_TEMPLATES.get(style, {})
    for p in picked:
        rt = p.get("room_type", "other")
        pool = templates.get(rt) or default_modes_for_room(rt)
        # If subject_bbox is missing/degenerate, drop pan_to_subject from pool
        bbox = p.get("subject_bbox")
        if not bbox or len(bbox) != 4 or bbox[2] < 0.05 or bbox[3] < 0.05:
            pool = [m for m in pool if m != "pan_to_subject"] or ["push_in"]
        pools.append(pool)
        modes.append(rng.choice(pool))

    # Random picks from per-room pools still clump — every room's pool leans on
    # push variants, so the tour does too. Spread them across families.
    modes = balance_families(modes, pools, rng)

    # Owner 2026-08-09: "不要静止的图片". Every clip moves. The forced-static
    # rule (10% of clips, lowest hero_score, as a breath between energetic
    # shots) is gone, and no room template offers `static` any more. The
    # renderers still implement the mode — it is reachable by hand through
    # --zoom-mode — the shot planner just never asks for it.
    return modes


def build_plan(
    photos: list[dict[str, Any]],
    style: str,
    listing_id: str,
    max_photos: int | None = None,
    dropped: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    """
    Main entry point. Returns list of shot dicts ready for the renderer.

    `dropped`, when given, is filled with photo_id -> the reason that photo is
    not in the cut. One reason, the real one, from the stage that actually made
    the call.
    """
    # 1. drop unusable / no-video room types
    usable = []
    for p in photos:
        rt = p.get("room_type", "other")
        quota = QUOTAS.get(rt, QUOTAS["other"])
        if not p.get("usable", True):
            if dropped is not None and p.get("id"):
                # The tagger's own words when it has them — "blurry", "dark" —
                # rather than a bare "unusable".
                why = (p.get("unusable_reason") or "").strip()
                dropped[p["id"]] = f"tagged unusable{f': {why}' if why else ''}"
            continue
        if quota["max"] <= 0:
            if dropped is not None and p.get("id"):
                dropped[p["id"]] = f"{rt} is never shown in a tour"
            continue
        usable.append(p)

    # 2. dedupe by dHash
    usable = dedupe(usable, dropped)

    # 3. determine budget
    #    total_clip_time = cap + (n-1)*xfade, so n <= (cap + xfade) / per_clip.
    #    Which "per clip" is the honest divisor depends on the curve: under the
    #    uniform curve every clip sits at >= MIN_PER_PHOTO, but under the
    #    bimodal curve MIN_PER_PHOTO is not a bound at all — the tiers are the
    #    bound, and PACE_NORMAL_S is the one most clips land on (heroes run
    #    longer, fillers shorter, and those roughly cancel). Deriving it from
    #    the tier keeps TOTAL_CAP honest when the pacing constants get retuned.
    per_clip = PACE_NORMAL_S if PACE_BIMODAL else MIN_PER_PHOTO
    max_n_by_budget = int((TOTAL_CAP + XFADE) / per_clip)
    budget = min(max_n_by_budget, max_photos or 9999, len(usable))

    # 4. quota-based selection
    picked = select_by_quota(usable, budget, dropped)

    # 5. narrative sort
    ordered = narrative_sort(picked)

    # 6. duration plan (hero boost = top-3 hero_score positions)
    by_hero_desc = sorted(range(len(ordered)),
                          key=lambda i: -ordered[i].get("hero_score", 0))
    hero_ranks = by_hero_desc[:HERO_BOOST_COUNT]
    # Weakest quarter (excluding heroes) passes quickly — the bimodal curve's
    # short beat. Empty when the tour is too short for a filler tier to matter.
    #
    # Owner 2026-08-09, "我们首先要保证的是信息量": a clip reveals its photo by
    # travelling across it, so a short beat is also the beat that shows the
    # least of the photo it was given. Among the weak candidates, spend the
    # short beats on the photos that have the LEAST to reveal, so the widest
    # ones keep the time they need. Ties (and photos of unknown shape) fall
    # back to hero_score order, which is what this did before.
    #
    # Overflow is measured against the SQUARE canvas on purpose. iOS is the
    # primary surface and square is the harder canvas — a 3:2 photo overflows
    # 50% of the frame there versus 18.5% on the web landscape one. Balancing
    # the two would mean letting web's easier geometry shorten iOS's clips.
    n_filler = int(len(ordered) * PACE_FILLER_FRACTION)
    weak = [i for i in reversed(by_hero_desc) if i not in hero_ranks]
    filler_ranks = sorted(weak, key=lambda i: square_overflow(ordered[i]))[:n_filler]
    durations = plan_durations(len(ordered), hero_ranks, filler_ranks)

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
