"""City-film callouts stay inside the picture's safe area, and arrive in time."""

import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "scripts" / "render-worker"))

from callouts import (  # noqa: E402
    ARRIVE_S,
    anim_seconds,
    count_progress,
    count_seconds,
    draw_callout,
)

W, H = 1080, 1576

CALLOUTS = {
    "title": {"type": "title", "big": "Suwanee", "label": "Georgia · 33 mi northeast of Atlanta"},
    "stat": {
        "type": "stat",
        "big": "#16",
        "label": "in Georgia · North Gwinnett High · 95% graduate in four years",
        "source": "U.S. News Best High Schools, 2025–26",
    },
    "count": {
        "type": "count",
        "from": 2412,
        "to": 20786,
        "label": "residents · 1990 → 2020",
        "source": "U.S. Census Bureau",
        "series": [
            {"label": "1990", "value": 2412},
            {"label": "2000", "value": 8725},
            {"label": "2010", "value": 15355},
            {"label": "2020", "value": 20786},
        ],
    },
    "tag": {"type": "tag", "kicker": "Suwanee Creek Greenway", "text": "Through the middle of town"},
}
# The schema's limits, all at once: the longest strings it will ever be handed.
WORDS_64 = "wide words fill every label right up to the limit of the schema"[:64]
WORDS_48 = "a source line as long as the schema allows it to"[:48]
WORST = {
    "title": {"type": "title", "big": "W" * 24, "label": WORDS_64},
    "stat": {"type": "stat", "big": "W" * 12, "label": WORDS_64, "source": WORDS_48},
    "count": {**CALLOUTS["count"], "to": 9_999_999, "label": WORDS_64, "source": WORDS_48},
    "tag": {"type": "tag", "kicker": "W" * 28, "text": WORDS_48},
}


@pytest.mark.parametrize("name", sorted(CALLOUTS))
def test_nothing_is_drawn_until_the_crossfade_is_over(name):
    assert draw_callout(CALLOUTS[name], W, H, ARRIVE_S - 0.05, 5.0).getbbox() is None


@pytest.mark.parametrize("name", sorted(CALLOUTS))
@pytest.mark.parametrize("specs", [CALLOUTS, WORST], ids=["typical", "longest"])
def test_arrived_callout_stays_inside_the_safe_area(name, specs):
    img = draw_callout(specs[name], W, H, 10.0, 12.0)
    # The scrim under a figure spans the frame by design; measure the opaque ink.
    box = img.getchannel("A").point(lambda v: 255 if v > 200 else 0).getbbox()
    assert box is not None, "the callout drew nothing"
    left, top, right, bottom = box
    assert left >= W * 0.04 and right <= W * 0.96, f"{name} runs off the side: {box}"
    assert top >= H * 0.04 and bottom <= H * 0.93, f"{name} runs off the frame: {box}"


def test_a_tag_sits_in_the_top_corner_and_a_figure_in_the_lower_third():
    ink = lambda name: (  # noqa: E731
        draw_callout(CALLOUTS[name], W, H, 10.0, 12.0)
        .getchannel("A").point(lambda v: 255 if v > 200 else 0).getbbox()
    )
    assert ink("tag")[3] < H * 0.25
    for name in ("title", "stat", "count"):
        assert ink(name)[1] > H * 0.45, f"{name} covers the picture"


def test_a_counter_starts_at_from_and_ends_at_to_within_its_clip():
    for clip in (3.0, 4.5, 7.5, 12.0):
        assert count_progress(ARRIVE_S, clip) == 0
        assert count_progress(anim_seconds(CALLOUTS["count"], clip), clip) == pytest.approx(1)
        # ...and the result is on screen for a while before the clip ends.
        if clip >= 4:
            assert anim_seconds(CALLOUTS["count"], clip) <= clip - 1.0
    steps = [count_progress(t / 10, 7.5) for t in range(0, 60)]
    assert steps == sorted(steps)
    assert count_seconds(2.0) > 0


def test_a_figure_has_arrived_well_inside_the_shortest_clip():
    for name in ("title", "stat", "tag"):
        assert anim_seconds(CALLOUTS[name], 2.5) <= 1.6
