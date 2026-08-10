"""Pacing floor and the no-still-frames rule.

Owner 2026-08-09, on the first depthflow tour: clips were passing too fast to
take a room in ("每张照片至少 2-3 秒"), and still frames were unwanted entirely.
Both are properties of the shot plan, not of either renderer, so they are
asserted here once and hold for Ken Burns and DepthFlow alike.
"""

import hashlib
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "scripts" / "render-worker"))

import photo_selector as ps  # noqa: E402

FLOOR_S = 2.0


def fake_photos(n: int) -> list[dict]:
    """n photos spread across room types, with descending hero scores so the
    hero / normal / filler tiers all get exercised."""
    rooms = ["exterior", "living", "kitchen", "bedroom", "bathroom",
             "backyard", "dining", "office", "hallway", "garage", "other"]
    return [
        {
            "id": f"p{i}",
            "sort_order": i,
            "room_type": rooms[i % len(rooms)],
            "quality": 0.9,
            "hero_score": 1.0 - i / (n + 1),
            "subject_bbox": [0.3, 0.3, 0.4, 0.4],
            # dedupe drops anything within Hamming distance 10, so consecutive
            # integers would collapse the whole set into one photo. Hash them
            # to get ~32 bits of separation.
            "_dhash": int(hashlib.md5(str(i).encode()).hexdigest()[:16], 16),
            "usable": True,
        }
        for i in range(n)
    ]


def plans():
    for n in (1, 4, 12, 24, 40):
        yield n, ps.build_plan(fake_photos(n), style="modern",
                               listing_id=f"listing-{n}")


def test_no_clip_is_shorter_than_the_floor():
    for n, plan in plans():
        short = [s["duration_s"] for s in plan if s["duration_s"] < FLOOR_S]
        assert short == [], f"{n} photos produced clips under {FLOOR_S}s: {short}"


def test_planner_never_emits_static():
    for n, plan in plans():
        still = [s["mode"] for s in plan if s["mode"] == "static"]
        assert still == [], f"{n} photos produced {len(still)} still clips"


def test_no_room_template_offers_static():
    # The forced-static rule is gone; this catches a template putting it back.
    for rooms in ps.STYLE_ROOM_TEMPLATES.values():
        for room, pool in rooms.items():
            assert "static" not in pool, f"style template for {room}"
    for room in ps.NARRATIVE_ORDER:
        assert "static" not in ps.default_modes_for_room(room), room


def test_tour_still_fits_the_total_cap():
    # Raising the floor lengthens every tour; the clip budget has to come down
    # to match or long listings silently blow past TOTAL_CAP.
    for n, plan in plans():
        total = sum(s["duration_s"] for s in plan) - (len(plan) - 1) * ps.XFADE
        assert total <= ps.TOTAL_CAP, f"{n} photos → {total:.1f}s video"


def test_the_beat_survives_the_higher_floor():
    # A floor is not a flattening: a long tour should still have long and short
    # clips, or we are back to the slideshow the bimodal curve replaced.
    plan = ps.build_plan(fake_photos(12), style="modern", listing_id="listing-12")
    durations = {s["duration_s"] for s in plan}
    assert len(durations) > 1, f"every clip is {durations}"
