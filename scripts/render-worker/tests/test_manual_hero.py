"""A hand-picked hero opens the cut, and nothing automated may overrule it.

The home tour's hero is `plan[0]`: the first shot, and the only shot Seedance
animates. It used to fall out of `narrative_sort` alone — exterior first,
highest hero_score inside the room type — and when that was wrong the only
lever was rejecting the photo that won, which also removed it from the film
(owner 2026-08-23: "most times the hero is selected correctly, but in case we
need to manually change").

The override is only worth having if it beats every gate that could otherwise
drop the photo. Each of those gates gets a test here, because each of them
silently produced a different opening shot before.
"""

import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "scripts" / "render-worker"))

from photo_selector import (  # noqa: E402
    PACE_HERO_S,
    TOTAL_CAP,
    XFADE,
    build_plan,
)


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


def plan_ids(photos, **kw):
    return [s["id"] for s in build_plan(photos, "modern", "listing-1", **kw)]


def test_without_a_pick_the_planner_still_chooses():
    photos = [
        photo("p1", "exterior", hero=0.9),
        photo("p2", "kitchen", hero=0.4),
        photo("p3", "living", hero=0.3),
    ]
    assert plan_ids(photos)[0] == "p1"


def test_the_pick_opens_the_cut():
    photos = [
        photo("p1", "exterior", hero=0.9),
        photo("p2", "kitchen", hero=0.4),
        photo("p3", "living", hero=0.3),
    ]
    ids = plan_ids(photos, hero_id="p2")
    assert ids[0] == "p2"
    # And it is still in the cut exactly once — moved, not duplicated.
    assert ids.count("p2") == 1
    assert set(ids) == {"p1", "p2", "p3"}


def test_the_pick_survives_an_unusable_tag():
    """The tagger's verdict loses to a human looking at the photograph."""
    photos = [
        photo("p1", "exterior", hero=0.9),
        photo("p2", "kitchen", usable=False, unusable_reason="blurry"),
        photo("p3", "living", hero=0.3),
    ]
    assert plan_ids(photos)[0] == "p1"
    assert "p2" not in plan_ids(photos)

    dropped: dict[str, str] = {}
    ids = plan_ids(photos, hero_id="p2", dropped=dropped)
    assert ids[0] == "p2"
    # A photo in the cut must not also carry a reason for being out of it.
    assert "p2" not in dropped


def test_the_pick_survives_a_full_room_quota():
    """`bedroom` maxes out well below five; the pick is not one of the losers."""
    photos = [photo("p1", "exterior", hero=0.9)] + [
        photo(f"b{i}", "bedroom", hero=0.9 - i * 0.1) for i in range(1, 6)
    ]
    assert "b5" not in plan_ids(photos)
    assert plan_ids(photos, hero_id="b5")[0] == "b5"


def test_the_pick_survives_being_a_near_duplicate():
    """dedupe keeps the higher-quality twin; the pick is exempt from the choice."""
    photos = [
        photo("p1", "exterior", hero=0.9, quality=0.95, dhash=0b1010),
        photo("p2", "exterior", hero=0.2, quality=0.10, dhash=0b1010),
        photo("p3", "living", hero=0.3),
    ]
    assert "p2" not in plan_ids(photos)
    assert plan_ids(photos, hero_id="p2")[0] == "p2"


def test_the_pick_gets_the_long_beat_however_it_was_scored():
    photos = [
        photo("p1", "exterior", hero=0.9),
        photo("p2", "kitchen", hero=0.9),
        photo("p3", "living", hero=0.9),
        photo("p4", "bathroom", hero=0.01),
    ]
    shots = build_plan(photos, "modern", "listing-1", hero_id="p4")
    assert shots[0]["id"] == "p4"
    assert shots[0]["is_hero"] is True
    assert shots[0]["duration_s"] == round(PACE_HERO_S, 2)


def test_the_pick_does_not_push_the_film_over_the_clock():
    """The reserved slot: a hero costs a shot, it does not add one."""
    photos = [photo("p1", "exterior", hero=0.9)] + [
        photo(f"k{i}", "kitchen", hero=0.5) for i in range(1, 40)
    ] + [photo(f"l{i}", "living", hero=0.5) for i in range(1, 40)]
    without = plan_ids(photos)
    with_hero = plan_ids(photos, hero_id="p1")
    assert len(with_hero) <= len(without)
    total = sum(s["duration_s"] for s in build_plan(
        photos, "modern", "listing-1", hero_id="p1"
    ))
    assert total - (len(with_hero) - 1) * XFADE <= TOTAL_CAP


def test_an_unknown_id_is_ignored_rather_than_fatal():
    """A hero rejected in review never reaches build_plan. Plan anyway."""
    photos = [
        photo("p1", "exterior", hero=0.9),
        photo("p2", "kitchen", hero=0.4),
    ]
    assert plan_ids(photos, hero_id="gone") == plan_ids(photos)
