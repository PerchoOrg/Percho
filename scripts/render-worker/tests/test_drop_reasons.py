"""Every photo the planner drops must say WHY, in its own words.

The plan step used to report one string for all of them: "not selected — room
quota, near-duplicate, or over the length budget". That is a list of the rules
that exist, not a verdict about this photo. The reviewer could not tell whether
a good photo lost to a duplicate, to a full room, or to the clock — and so
could not tell whether the planner was right (owner 2026-08-21: "lets rethink
this rejection reason, planning should make better decision").

The three causes want three different responses: raise a quota, reject the
sibling that beat it, or accept that the film is full. Collapsing them removed
the only information that made the difference actionable.
"""

import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "scripts" / "render-worker"))

from photo_selector import QUOTAS, build_plan  # noqa: E402


def photo(pid, room, hero=0.5, quality=0.8, usable=True, dhash=None, **extra):
    p = {
        "id": pid,
        "_id": pid,
        "room_type": room,
        "hero_score": hero,
        "quality": quality,
        "usable": usable,
        "sort_order": int(pid[1:]) if pid[1:].isdigit() else 0,
        "width": 1500,
        "height": 1000,
    }
    if dhash is not None:
        p["_dhash"] = dhash
    p.update(extra)
    return p


def plan_with_drops(photos, **kw):
    dropped: dict[str, str] = {}
    plan = build_plan(photos, "modern", "listing-1", dropped=dropped, **kw)
    return {s["id"] for s in plan}, dropped


def test_an_unusable_photo_says_so_and_quotes_the_tagger():
    photos = [photo(f"p{i}", "bedroom") for i in range(3)]
    photos.append(photo("bad", "living", usable=False, unusable_reason="motion blur"))
    kept, dropped = plan_with_drops(photos)
    assert "bad" not in kept
    assert "unusable" in dropped["bad"] and "motion blur" in dropped["bad"]


def test_a_room_type_that_is_never_filmed_says_which():
    assert QUOTAS["closet"]["max"] == 0
    photos = [photo(f"p{i}", "bedroom") for i in range(3)] + [photo("c1", "closet")]
    kept, dropped = plan_with_drops(photos)
    assert "c1" not in kept
    assert dropped["c1"] == "closet is never shown in a tour"


def test_a_near_duplicate_names_the_shot_that_beat_it():
    photos = [
        photo("keep", "living", quality=0.9, dhash=0),
        photo("dupe", "living", quality=0.4, dhash=1),  # hamming 1 < threshold
        photo("p3", "bedroom"),
    ]
    kept, dropped = plan_with_drops(photos)
    assert "dupe" not in kept and "keep" in kept
    assert "near-duplicate" in dropped["dupe"]
    # The survivor and the gap, so "why that one" is answerable from the row.
    assert "living" in dropped["dupe"]
    assert "0.90" in dropped["dupe"] and "0.40" in dropped["dupe"]


def test_a_full_room_says_the_room_and_the_cap():
    cap = QUOTAS["bathroom"]["max"]
    photos = [photo(f"b{i}", "bathroom", hero=0.9 - i * 0.01) for i in range(cap + 2)]
    photos += [photo("liv", "living"), photo("kit", "kitchen"), photo("ext", "exterior")]
    kept, dropped = plan_with_drops(photos)
    overflow = [p["id"] for p in photos if p["room_type"] == "bathroom" and p["id"] not in kept]
    assert overflow, "expected at least one bathroom over the cap"
    for pid in overflow:
        assert "bathroom quota full" in dropped[pid]
        assert str(cap) in dropped[pid]


def test_losing_to_the_clock_is_not_reported_as_a_quota():
    # Many rooms, each within quota, more than the length budget allows.
    photos = []
    for room in ("bedroom", "bathroom", "living", "kitchen", "exterior", "backyard"):
        for i in range(QUOTAS[room]["max"]):
            photos.append(photo(f"{room}{i}", room, hero=0.5))
    kept, dropped = plan_with_drops(photos, max_photos=4)
    losers = [p["id"] for p in photos if p["id"] not in kept]
    assert losers
    assert any("film was already full" in dropped[pid] for pid in losers)


def test_every_dropped_photo_gets_exactly_one_reason():
    # The fallback in the plan step ("no reason recorded") must be unreachable.
    photos = [
        photo("dupe", "living", quality=0.3, dhash=1),
        photo("keep", "living", quality=0.9, dhash=0),
        photo("closet", "closet"),
        photo("blur", "kitchen", usable=False),
    ]
    for room in ("bedroom", "bathroom", "exterior"):
        for i in range(QUOTAS[room]["max"] + 1):
            photos.append(photo(f"{room}{i}", room, hero=0.4))
    kept, dropped = plan_with_drops(photos, max_photos=5)
    for p in photos:
        if p["id"] in kept:
            continue
        assert p["id"] in dropped, f"{p['id']} ({p['room_type']}) dropped with no reason"
        assert dropped[p["id"]].strip(), f"{p['id']} got an empty reason"


def test_a_kept_photo_never_gets_a_drop_reason():
    photos = [photo(f"p{i}", "bedroom") for i in range(2)] + [photo("ext", "exterior")]
    kept, dropped = plan_with_drops(photos)
    assert kept, "expected some photos in the plan"
    assert not (kept & set(dropped)), "a photo in the cut also has a rejection reason"
