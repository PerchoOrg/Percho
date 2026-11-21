"""The card's place label follows the film only if the clips record what played."""

import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "render-worker"))

from film_timeline import played_timeline  # noqa: E402


def clip(photo, seconds):
    return {"photo_id": photo, "poi_name": photo, "duration_s": seconds}


def test_records_the_probed_length_not_the_planned_one():
    # A planned 2s Ken Burns shot whose photo has a 5.04s Seedance clip.
    out = played_timeline([clip("a", 2), clip("b", 3)], {0: 5.04, 1: 3.0}, 2.4)
    assert [c["duration_s"] for c in out] == [5.04, 3.0]


def test_marks_a_skipped_clip_and_puts_the_end_card_on_the_last_played():
    out = played_timeline([clip("a", 2), clip("b", 3), clip("c", 3)], {0: 2.0, 1: 3.0}, 2.4)
    assert out[2]["skipped"] is True
    assert out[1]["end_card_s"] == 2.4
    assert "end_card_s" not in out[0] and "end_card_s" not in out[2]


def test_a_reassembly_clears_what_the_last_one_recorded():
    before = played_timeline([clip("a", 2), clip("b", 3)], {0: 2.0}, 2.4)
    after = played_timeline(before, {0: 2.0, 1: 3.0}, 0.0)
    assert "skipped" not in after[1]
    assert "end_card_s" not in after[0]
    assert after[1]["end_card_s"] == 0.0


def test_does_not_mutate_the_input():
    ordered = [clip("a", 2)]
    played_timeline(ordered, {0: 4.0}, 2.4)
    assert ordered[0]["duration_s"] == 2
