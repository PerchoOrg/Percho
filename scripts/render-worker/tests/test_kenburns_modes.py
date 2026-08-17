"""Every mode a planner can emit must actually move the camera that way.

Owner 2026-08-17: a community-tour clip planned `zoom-out` rendered as a slow
push-in. `zoom-out` is a v1 name; `kenburns_filter_v2` has no branch for it and
fell through to a default push, so the wrong move looked like a plausible one
and nothing said otherwise.

These tests pin the two halves of that: the mode lists a planner may draw from
are all implemented, and an unimplemented one is loud instead of silent.
"""

import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "scripts" / "ken-burns"))

from generate import kenburns_filter_v2  # noqa: E402

# Mirrors KEN_BURNS_MOVES in apps/web/lib/poi/tour-orchestrator/scheduler.ts
# and POI_CLIP_MODES in scripts/render-worker/worker.py. Three copies is two
# too many, but they live in three languages; this test is the seam that keeps
# them honest.
PLANNER_MODES = [
    "push_in",
    "push_in_slow",
    "pull_back",
    "pan_lr",
    "pan_rl",
    "push_pan_lr",
    "push_pan_rl",
    "tilt_td",
]

# The v1 vocabulary that still reaches this filter from older shot plans and
# from photo_clips rows planned before 2026-08-17.
V1_ALIASES = {
    "zoom-in": "push_in",
    "zoom-out": "pull_back",
    "pan-lr": "pan_lr",
    "pan-tb": "tilt_td",
}


def _filter(mode: str) -> str:
    return kenburns_filter_v2(mode, 3.0, 1080, 1920, 1080, 1920, cover=True)


def test_every_planner_mode_is_implemented():
    """No planner mode may collapse onto another's filter.

    The bug was a shared default: two modes rendered identically to a third.
    Distinct filters is what proves each branch was reached.
    """
    seen: dict[str, str] = {}
    for mode in PLANNER_MODES:
        vf = _filter(mode)
        assert mode not in seen
        for other, other_vf in seen.items():
            assert vf != other_vf, f"{mode} renders identically to {other}"
        seen[mode] = vf


def test_v1_aliases_translate_to_their_v2_equivalent():
    for alias, canonical in V1_ALIASES.items():
        assert _filter(alias) == _filter(canonical), f"{alias} != {canonical}"


def test_zoom_out_pulls_back_rather_than_pushing_in():
    """The reported symptom, pinned directly."""
    assert _filter("zoom-out") == _filter("pull_back")
    assert _filter("zoom-out") != _filter("push_in")
    assert _filter("zoom-out") != _filter("push_in_slow")


def test_unknown_mode_dies_instead_of_defaulting():
    with pytest.raises(SystemExit):
        _filter("barrel_roll")
