"""Crossfade offsets: the first transition is never at zero.

Owner 2026-08-17: a 14-clip community tour played as roughly six clips. The
assembly step had its own copy of the offset loop that appended before
accumulating, so the chain started at offset 0. Each xfade truncates the
accumulated chain at its offset, so the error compounds: reproduced with ffmpeg
on the real clip durations, 45.5s of footage came out as 16.7s (production
measured 16.6s).
"""

import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "scripts" / "ken-burns"))

from xfade import crossfade_offsets, crossfade_total  # noqa: E402

# The clips that produced the 16.6s tour, from the render-worker log.
PRODUCTION_DURATIONS = [
    4.042, 4.041, 4.042, 4.042, 4.041, 2.5, 4.042,
    4.042, 2.5, 2.5, 4.041, 4.042, 4.04, 4.04,
]


def test_first_offset_is_one_clip_in_not_zero():
    offsets = crossfade_offsets([4.0, 4.0, 4.0, 4.0], 0.5)
    assert offsets[0] == 3.5
    assert offsets == [3.5, 7.0, 10.5]


def test_offsets_follow_the_cumulative_formula():
    durs = [4.0, 2.5, 3.5, 3.0]
    xfade = 0.5
    offsets = crossfade_offsets(durs, xfade)
    assert len(offsets) == len(durs) - 1
    for i, offset in enumerate(offsets):
        assert offset == sum(durs[: i + 1]) - (i + 1) * xfade


def test_last_offset_leaves_room_for_the_final_clip():
    """offset[-1] + xfade + (last - xfade) must equal the whole timeline."""
    durs = PRODUCTION_DURATIONS
    xfade = 0.5
    offsets = crossfade_offsets(durs, xfade)
    assert offsets[-1] + durs[-1] == crossfade_total(durs, xfade)


def test_production_case_keeps_its_full_length():
    """The regression, in numbers: 45.45s of tour."""
    total = crossfade_total(PRODUCTION_DURATIONS, 0.5)
    assert round(total, 2) == 45.45
    offsets = crossfade_offsets(PRODUCTION_DURATIONS, 0.5)
    assert round(offsets[-1] + PRODUCTION_DURATIONS[-1], 2) == 45.45


def test_the_old_loop_fired_every_transition_one_clip_early():
    """Pin the shape of the bug, not a duration.

    What the wrong offsets cost cannot be read off the arithmetic — they
    predict 41.9s, while ffmpeg actually produced 16.7s, because each xfade
    truncates the accumulated chain at its offset and the loss compounds. What
    IS checkable is the shape: transition i got transition i-1's offset, and
    the first one got zero.
    """
    correct = crossfade_offsets(PRODUCTION_DURATIONS, 0.5)
    acc, wrong = 0.0, []
    for d in PRODUCTION_DURATIONS[:-1]:
        wrong.append(acc)
        acc += d - 0.5

    assert wrong[0] == 0.0
    assert correct[0] != 0.0
    for i in range(1, len(wrong)):
        assert wrong[i] == correct[i - 1]


def test_edge_cases():
    assert crossfade_offsets([], 0.5) == []
    assert crossfade_offsets([4.0], 0.5) == []
    assert crossfade_total([], 0.5) == 0.0
    assert crossfade_total([4.0], 0.5) == 4.0
