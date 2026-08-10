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

from depthflow_modes import FROM_KENBURNS, MOVES, plan_moves, resolve  # noqa: E402
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
