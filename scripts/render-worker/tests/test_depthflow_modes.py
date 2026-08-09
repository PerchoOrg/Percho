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

from depthflow_modes import MOVES, resolve  # noqa: E402
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
        assert resolve(mode) in MOVES


def test_static_stays_static():
    # 10% of clips are forced static by the planner; that has to survive the
    # engine swap or those clips silently gain motion.
    assert resolve("static") == "static"


def test_unknown_mode_is_reported_not_guessed():
    assert resolve("no_such_mode") is None
