"""Two narration lines must never be spoken at the same time.

Owner 2026-08-23, on Bellmoore Park's 31-clip cut: "there is overlap of the tts
for last two sentences" — "Try beloved Breakfast Bar." and "Newtown Dog Park is
well worth the drive." played almost entirely on top of each other.

The anchors below are that film's, read off the render worker's own ffmpeg
command line (the xfade offsets). Durations come from the plan's word counts at
the pace two leftover TTS files measured at — 0.44 s/word plus about half a
second of padding, checked against a 48-word line at 21.64s and a 12-word line
at 5.68s.
"""

import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "render-worker"))

from narration_timing import (  # noqa: E402
    NARRATION_MAX_TEMPO,
    NARRATION_MIN_GAP_S,
    plan_narration_starts,
)

# 75.708s of clips, plus a 3s end card less its 0.6s fade.
BELLMOORE_TOTAL = 78.108

# (clip index -> anchor, words) as the film SHIPPED: sections were measured on
# the sum of the clip durations, which ignores 30 crossfades, so every section
# was budgeted for ~17% more time than its footage occupies. The two-second
# Breakfast Bar shot is 1.5 seconds of screen time and was given four words.
SHIPPED = {
    0: (0.000, 42), 8: (20.542, 35), 14: (36.625, 15), 16: (43.167, 25),
    20: (54.667, 16), 23: (61.667, 8), 25: (64.667, 7), 27: (67.667, 7),
    29: (70.667, 4), 30: (72.167, 8),
}

# The same cut once `buildSections` measures the crossfaded timeline: the 1.5s
# section falls below MIN_SECTION_SECONDS and gets no line at all, and the
# three-second sections budget six words rather than seven or eight.
CORRECTED = {
    0: (0.000, 42), 8: (20.542, 33), 14: (36.625, 13), 16: (43.167, 23),
    20: (54.667, 14), 23: (61.667, 7), 25: (64.667, 7), 27: (67.667, 7),
    30: (72.167, 8),
}


def spoken(words: int) -> float:
    return 0.44 * words + 0.5


def lines(plan: dict[int, tuple[float, int]]) -> list[dict]:
    return [
        {"wav": Path(f"vo-{clip}.wav"), "start": start, "dur": spoken(words)}
        for clip, (start, words) in sorted(plan.items(), key=lambda kv: kv[1][0])
    ]


def pretend_speed_up(src, tempo, dest):
    """Stand in for ffmpeg atempo; the caller does the arithmetic itself."""
    return True


def assert_no_overlap(kept: list[dict]) -> None:
    for a, b in zip(kept, kept[1:]):
        assert a["start"] + a["dur"] <= b["start"] + 1e-6, (
            f"{a['wav'].name} runs to {a['start'] + a['dur']:.2f} "
            f"but {b['wav'].name} starts at {b['start']:.2f}"
        )


def test_the_shipped_cut_no_longer_talks_over_itself():
    # THE BUG. The loop this replaces gave up with `room <= 0` at exactly this
    # point: earlier pushes had carried the Breakfast Bar line past the dog
    # park's anchor, so it did nothing — no speed-up, and no push for the line
    # it was about to speak over.
    kept, *_ = plan_narration_starts(lines(SHIPPED), BELLMOORE_TOTAL, pretend_speed_up)
    assert_no_overlap(kept)


def test_no_line_starts_before_its_own_anchor():
    # Late is a cost this module accepts; early is not. A line moved earlier is
    # talking about footage that has not arrived — and the old clamp,
    # `min(need, total - dur)`, could do exactly that and still count it fixed.
    made = lines(SHIPPED)
    anchors = [m["start"] for m in made]
    plan_narration_starts(made, BELLMOORE_TOTAL, pretend_speed_up)
    for m, anchor in zip(made, anchors):
        assert m["start"] >= anchor - 1e-6


def test_every_placed_line_keeps_its_gap():
    kept, *_ = plan_narration_starts(lines(SHIPPED), BELLMOORE_TOTAL, pretend_speed_up)
    for a, b in zip(kept, kept[1:]):
        assert b["start"] - (a["start"] + a["dur"]) >= NARRATION_MIN_GAP_S - 1e-6


def test_corrected_sections_need_no_line_dropped():
    # With the sections measured right, the pressure that produced the overlap
    # is gone: nothing is dropped, and the closing line lands on its own clip
    # rather than a second late over the end card.
    made = lines(CORRECTED)
    kept, _shifted, _sped, dropped = plan_narration_starts(
        made, BELLMOORE_TOTAL, pretend_speed_up
    )
    assert dropped == 0
    assert len(kept) == len(made)
    assert_no_overlap(kept)
    assert kept[-1]["start"] == CORRECTED[30][0]


def test_a_line_that_cannot_finish_before_the_film_does_is_dropped():
    # Silence over those clips, rather than a sentence the end of the video
    # cuts in half — and never a clamp back on top of its neighbour.
    made = [
        {"wav": Path("vo-0.wav"), "start": 0.0, "dur": 9.0},
        {"wav": Path("vo-1.wav"), "start": 8.0, "dur": 6.0},
    ]
    kept, _shifted, _sped, dropped = plan_narration_starts(made, 10.0, pretend_speed_up)
    assert dropped == 1
    assert [m["wav"].name.replace("-fast", "") for m in kept] == ["vo-0.wav"]
    assert_no_overlap(kept)


def test_a_roomy_cut_is_left_exactly_where_it_was_anchored():
    made = [
        {"wav": Path("vo-0.wav"), "start": 0.0, "dur": 4.0},
        {"wav": Path("vo-1.wav"), "start": 10.0, "dur": 4.0},
        {"wav": Path("vo-2.wav"), "start": 20.0, "dur": 4.0},
    ]
    kept, shifted, sped, dropped = plan_narration_starts(made, 30.0, pretend_speed_up)
    assert (shifted, sped, dropped) == (0, 0, 0)
    assert [m["start"] for m in kept] == [0.0, 10.0, 20.0]


def test_speed_up_is_never_beyond_taste():
    asked: list[float] = []

    def record(src, tempo, dest):
        asked.append(tempo)
        return True

    plan_narration_starts(lines(SHIPPED), BELLMOORE_TOTAL, record)
    assert asked, "nothing was sped up on a cut that needs it"
    assert max(asked) <= NARRATION_MAX_TEMPO + 1e-9


def test_a_line_atempo_refuses_to_re_render_is_still_placed_safely():
    # _speed_up returns False on ffmpeg failure and keeps the original file.
    # The line then runs its full length, and the sweep must still not let the
    # next one start underneath it.
    made = lines(SHIPPED)
    kept, *_ = plan_narration_starts(made, BELLMOORE_TOTAL, lambda *_a: False)
    assert_no_overlap(kept)


def test_empty_is_empty():
    assert plan_narration_starts([], 30.0, pretend_speed_up) == ([], 0, 0, 0)
