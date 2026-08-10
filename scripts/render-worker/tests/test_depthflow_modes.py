"""Every shot-plan mode must have a parallax counterpart.

photo_selector picks modes per room type with no idea which engine will render
them. If someone adds a Ken Burns mode and forgets the mapping, `--engine
depthflow` fails at render time on whichever listing happens to hit that room
type — which is a bad way to find out.
"""

import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "scripts" / "ken-burns"))
sys.path.insert(0, str(REPO / "scripts" / "render-worker"))

from depthflow_modes import (  # noqa: E402
    FROM_KENBURNS,
    MOVES,
    PARALLAX_MAX_OVERFLOW,
    PARALLAX_MAX_SHARE,
    PARALLAX_MIN_CLIPS,
    PARALLAX_MIN_SHARE,
    pick_engines,
    plan_moves,
    resolve,
)
import photo_selector  # noqa: E402


def planner_modes() -> set[str]:
    """Every mode the shot planner can emit: the style x room table plus the
    per-room defaults it falls back to."""
    modes: set[str] = set()
    for rooms in photo_selector.STYLE_ROOM_TEMPLATES.values():
        for pool in rooms.values():
            modes.update(pool)
    for room in photo_selector.NARRATIVE_ORDER:
        modes.update(photo_selector.default_modes_for_room(room))
    return modes


def test_every_planner_mode_maps_to_a_parallax_move():
    unmapped = sorted(m for m in planner_modes() if resolve(m) is None)
    assert unmapped == [], f"no parallax counterpart for: {unmapped}"


def test_mapped_moves_are_all_implemented():
    for mode in planner_modes():
        for room in photo_selector.NARRATIVE_ORDER:
            for i in range(len(MOVES)):
                assert resolve(mode, room, i) in MOVES


def test_unknown_mode_is_reported_not_guessed():
    assert resolve("no_such_mode") is None


def test_resolve_is_deterministic():
    # Same plan in, same video out — the rotation must not be random, or a
    # re-render of the same listing silently produces different motion.
    for _ in range(3):
        assert resolve("push_in", "kitchen", 4) == resolve("push_in", "kitchen", 4)


def test_rotation_actually_varies_within_a_tour():
    # The bug this whole table exists to fix: a tour full of push_ins used to
    # render the identical move every time.
    seen = {resolve("push_in", "living", i) for i in range(6)}
    assert len(seen) == len(FROM_KENBURNS["push_in"]), (
        f"push_in only ever produced {seen}")


def test_plan_moves_breaks_up_adjacent_repeats():
    # Same mode, different rooms, is exactly the case a per-clip decision
    # can't fix: the rotation is keyed on room, so two rooms can land on the
    # same move back to back.
    shots = [("push_in", "hallway"), ("push_in", "garage"),
             ("push_in", "office"), ("push_in", "dining")]
    moves = plan_moves(shots)
    repeats = [i for i in range(1, len(moves)) if moves[i] == moves[i - 1]]
    assert repeats == [], f"{moves} repeats at {repeats}"


def test_plan_moves_leaves_single_candidate_modes_alone():
    # tilt_td has one parallax counterpart. Two bathrooms in a row do repeat,
    # and that beats swapping in a move that contradicts the shot.
    assert plan_moves([("tilt_td", "bathroom")] * 2) == \
        ["tilt_parallax", "tilt_parallax"]


def test_plan_moves_matches_resolve_when_there_is_no_clash():
    shots = [("push_in", "kitchen"), ("tilt_td", "bathroom")]
    assert plan_moves(shots) == [resolve("push_in", "kitchen", 0),
                                 resolve("tilt_td", "bathroom", 1)]


def test_plan_moves_reports_unknown_modes_rather_than_guessing():
    assert plan_moves([("no_such_mode", "kitchen")]) == [None]


def test_every_non_static_move_is_reachable_from_the_planner():
    # Owner 2026-08-09: "效果很多你只用了很少". zoom_in and parallax_bloom were
    # implemented but unreachable under the old one-to-one mapping. Nothing in
    # MOVES should be dead code again — except static, which the planner is no
    # longer allowed to emit at all (see test_planner_never_emits_static).
    reachable = {m for cands in FROM_KENBURNS.values() for m in cands}
    unreachable = sorted(set(MOVES) - reachable - {"static"})
    assert unreachable == [], f"parallax moves nothing can select: {unreachable}"


# ── mixed rendering ──────────────────────────────────────────────────────────
# Owner 2026-08-09: "两种可以混合渲染 各取所长". The split is decided by how much
# of a photo the canvas cannot show at once, because that is exactly what
# separates the engines: travel reveals, parallax cannot.

def test_photos_with_a_lot_to_reveal_go_to_ken_burns():
    # 3:2 on the square card overflows 50% of the frame — far too much to give
    # up to an engine that cannot travel. Parallax still gets its floor (owner
    # 2026-08-10, "旋转的图少了"), but travel keeps the majority.
    n = 8
    engines = pick_engines([0.5] * n)
    assert engines.count("kenburns") > engines.count("depthflow")
    assert engines.count("depthflow") == round(n * PARALLAX_MIN_SHARE)


def test_photos_with_nothing_to_reveal_go_to_depthflow():
    engines = pick_engines([0.0] * 8)
    assert "depthflow" in engines


def test_parallax_never_lands_on_two_adjacent_clips():
    for overflows in ([0.0] * 10, [0.05] * 6, [0.0, 0.5] * 5):
        engines = pick_engines(overflows)
        pairs = [i for i in range(1, len(engines))
                 if engines[i] == engines[i - 1] == "depthflow"]
        assert pairs == [], f"{engines} adjacent at {pairs}"


def test_every_video_keeps_some_parallax():
    # Even when every photo overflows badly — the square card with 3:2 photos,
    # which is the common case — the tour should not silently become all
    # Ken Burns, or the mixed engine is mixed in name only.
    engines = pick_engines([0.6] * 9)
    assert engines.count("depthflow") >= PARALLAX_MIN_CLIPS


def test_parallax_share_is_capped():
    # Depth inference is the render-time cost, so the share is bounded even
    # when every clip qualifies.
    n = 20
    engines = pick_engines([0.0] * n)
    assert engines.count("depthflow") <= int(n * PARALLAX_MAX_SHARE)


def test_parallax_goes_to_the_clips_with_least_to_reveal():
    overflows = [0.9, 0.02, 0.9, 0.9, 0.01, 0.9]
    engines = pick_engines(overflows)
    chosen = [i for i, e in enumerate(engines) if e == "depthflow"]
    assert set(chosen) == {1, 4}, f"{engines}"


def test_threshold_is_the_documented_one():
    # A photo right at the threshold is still parallax-eligible; past it, not.
    assert pick_engines([PARALLAX_MAX_OVERFLOW, 0.9, 0.9, 0.9])[0] == "depthflow"


def test_empty_plan_is_not_a_crash():
    assert pick_engines([]) == []
