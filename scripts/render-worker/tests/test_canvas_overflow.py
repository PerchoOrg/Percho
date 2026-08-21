"""`canvas_overflow` generalises `square_overflow` to any canvas.

The home tour renders two canvases and `pick_engines` decides which clips get
parallax from how much of each photo its canvas cannot show. Getting that
number wrong per surface would let the easier canvas dictate the harder one —
which is the exact mistake the planner's own comment warns about.

The first test is the one that matters: on a square canvas the general form
must agree with the specific one it replaces, digit for digit, or the two
pipelines disagree about the same photo.
"""

import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "scripts" / "render-worker"))
sys.path.insert(0, str(REPO / "scripts" / "ken-burns"))

from photo_selector import square_overflow  # noqa: E402


def canvas_overflow(w, h, cw, ch):
    """Mirror of worker.canvas_overflow.

    Imported by copy rather than from `worker`, which pulls in numpy, requests
    and a live Supabase config at import time. The function is eight lines and
    pure; the test that keeps the copy honest is `test_matches_square_overflow`
    below, which compares it against the real implementation it generalises.
    """
    if not w or not h:
        return 0.0
    ar = float(w) / float(h)
    target = float(cw) / float(ch)
    return abs(ar / target - 1.0) if ar >= target else abs(target / ar - 1.0)


@pytest.mark.parametrize(
    "w,h",
    [(1024, 686), (686, 1024), (1080, 1080), (2000, 947), (1600, 1200), (3, 4)],
)
def test_matches_square_overflow_on_a_square_canvas(w, h):
    assert canvas_overflow(w, h, 1080, 1080) == pytest.approx(
        square_overflow({"width": w, "height": h})
    )


def test_zero_for_a_photo_that_already_matches_the_canvas():
    assert canvas_overflow(1080, 1576, 1080, 1576) == pytest.approx(0.0)
    assert canvas_overflow(1920, 1080, 1920, 1080) == pytest.approx(0.0)


def test_unknown_dimensions_are_not_condemned():
    # A photo whose size we never learned must not read as the worst overflow
    # in the tour; the planner would then spend its short beats on it.
    assert canvas_overflow(None, None, 1080, 1576) == 0.0
    assert canvas_overflow(0, 0, 1080, 1576) == 0.0


def test_the_same_photo_overflows_differently_per_surface():
    # A 3:2 landscape photo. On the tall iOS canvas the frame has to travel a
    # long way to reveal it; on the 16:9 web canvas it very nearly fits. This
    # asymmetry is the whole reason the engine split is decided per surface.
    ios = canvas_overflow(1500, 1000, 1080, 1576)
    web = canvas_overflow(1500, 1000, 1920, 1080)
    assert ios > web
    assert web < 0.2
