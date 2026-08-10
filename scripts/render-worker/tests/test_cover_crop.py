"""The cover crop aims at the tagged subject instead of the frame centre.

Owner 2026-08-09: "16:9 的照片截取的部分把房子切成了两半". A square canvas keeps
only ~56% of a 16:9 photo's width, and the crop used to be hard-centred, so an
off-centre subject was simply cut away. Both engines crop, so both are asserted
here.

These check the filter STRING. The expressions were verified against a real
ffmpeg run (an off-centre marker survives the aimed crop at full size and is
100% absent from the centred one) — what can silently regress afterwards is the
string, not ffmpeg's arithmetic.
"""

import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "scripts" / "ken-burns"))

from generate import (  # noqa: E402
    compose_filter,
    cover_crop_xy,
    kenburns_filter_v2,
    subject_center,
)

LEFT_SUBJECT = [0.08, 0.33, 0.08, 0.34]   # centroid x = 0.12
RIGHT_SUBJECT = [0.80, 0.33, 0.10, 0.34]  # centroid x = 0.85
HIGH_SUBJECT = [0.375, 0.037, 0.25, 0.113]  # centroid y = 0.09


def test_subject_center_uses_the_bbox_centroid():
    assert subject_center(LEFT_SUBJECT) == (0.12, 0.5)


def test_subject_center_falls_back_to_the_frame_centre():
    assert subject_center(None) == (0.5, 0.5)
    # Degenerate boxes are what the tagger emits when it found nothing worth
    # pointing at; they must not drag the crop to a corner.
    assert subject_center([0.4, 0.4, 0.0, 0.0]) == (0.5, 0.5)


def test_crop_is_clamped_to_the_image():
    # A subject near the edge must not push the crop window off the photo.
    expr = cover_crop_xy(0.02, 0.5)
    assert "clip(" in expr
    assert "0,in_w-out_w" in expr
    assert "0,in_h-out_h" in expr


def test_depthflow_cover_crop_aims_at_the_subject():
    aimed = compose_filter(1080, 1080, cover=True, bbox=LEFT_SUBJECT)
    centred = compose_filter(1080, 1080, cover=True)
    assert "0.1200*in_w" in aimed
    assert "0.5000*in_w" in centred
    assert aimed != centred


def test_kenburns_cover_crop_aims_at_the_subject():
    aimed = kenburns_filter_v2("push_in", 3.0, 1080, 1080, 1080, 810,
                               bbox=RIGHT_SUBJECT, cover=True)
    centred = kenburns_filter_v2("push_in", 3.0, 1080, 1080, 1080, 810,
                                 cover=True)
    assert "0.8500*in_w" in aimed
    assert "0.5000*in_w" in centred


def test_both_engines_aim_the_same_way():
    # The two engines must put the photo on the canvas identically — the only
    # thing that should differ between them is how the camera moves.
    kb = kenburns_filter_v2("push_in", 3.0, 1080, 1080, 1080, 810,
                            bbox=LEFT_SUBJECT, cover=True)
    df = compose_filter(1080, 1080, cover=True, bbox=LEFT_SUBJECT)
    offsets = cover_crop_xy(*subject_center(LEFT_SUBJECT))
    assert offsets in kb
    assert offsets in df


def test_crop_aims_vertically_too():
    """Owner 2026-08-09: "有时候不是左右而是上下".

    Which axis actually gets cut is a property of the CANVAS, not the photo.
    Production photos are overwhelmingly 3:2 (145 of 200 sampled):

      square 1080x1080   3:2 is wider than 1:1   → width overflows, cuts L/R
      landscape 1920x1080  3:2 is TALLER than 16:9 → height overflows, cuts T/B

    So the landscape output — which the worker renders by default alongside
    square — crops vertically for 92% of real photos, and dropping the `y`
    expression as redundant would silently reintroduce the bug there.
    """
    high = compose_filter(1920, 1080, cover=True, bbox=HIGH_SUBJECT)
    centred = compose_filter(1920, 1080, cover=True)
    assert "0.0935*in_h" in high
    assert "0.5000*in_h" in centred

    kb_high = kenburns_filter_v2("push_in", 3.0, 1920, 1080, 1620, 1080,
                                 bbox=HIGH_SUBJECT, cover=True)
    assert "0.0935*in_h" in kb_high


def test_blur_letterbox_path_never_crops():
    # Portrait output shows the whole photo; there is nothing to aim, and a
    # crop offset leaking in there would cut a photo that used to be intact.
    vf = compose_filter(1080, 1920, cover=False, bbox=LEFT_SUBJECT)
    assert "in_w-out_w" not in vf


# ── coverage target and the vertical anchor ──────────────────────────────────
# Owner 2026-08-10, on the coverage-first cut: "速度有点快", "上下滑动很奇怪…
# 不用追求100%的信息量上下滑动 而是找到信息量最大的那部分作为基础", "80%信息量
# 就可以了 要多做一些效果".

from generate import (  # noqa: E402
    COVERAGE_TARGET,
    MAX_TRAVEL_PER_S,
    cover_travel,
)

WIDE = (1500, 1000)     # 3:2, the dominant production aspect
SQUARE_CANVAS = (1080, 1080)
LANDSCAPE_CANVAS = (1920, 1080)


def horizontal(duration=2.5, frames=75, forward=True):
    return cover_travel("", duration, frames, 0.5, 0.5,
                        *WIDE, *SQUARE_CANVAS, forward)


def test_horizontal_still_travels():
    # The frame has to move for the clip to reveal anything, so a moving crop
    # is the whole point on the axis that overflows.
    assert "n/" in horizontal()


def test_vertical_does_not_travel():
    # A frame sliding up and down a room reads as restless; there is also far
    # less to gain (18.5% of the frame against 50% on square).
    vf = cover_travel("", 2.5, 75, 0.5, 0.5, *WIDE, *LANDSCAPE_CANVAS, True)
    assert "n/" not in vf, f"vertical axis is still sweeping: {vf}"


def test_travel_stops_at_the_coverage_target():
    # Chasing the last 20% costs the most movement, so the target caps travel
    # before the photo's full width does.
    assert f"{COVERAGE_TARGET}*in_w-out_w" in horizontal()


def test_travel_is_also_capped_by_speed():
    # Budgeted against the PEAK, not the average: smoothstep spends the clip
    # accelerating, so its fastest moment is 1.5x its mean and that is the
    # moment the viewer reads as shake.
    from generate import EASE_PEAK_FACTOR, ZOOM_CEILING
    expected = MAX_TRAVEL_PER_S / ZOOM_CEILING / EASE_PEAK_FACTOR
    assert f"{expected:.6f}*out_w" in horizontal()


def test_longer_clips_move_more_slowly_not_further():
    # Both tiers chase the same 80%, so the extra second buys calm, not
    # coverage — which is what the owner asked for.
    short, long = horizontal(2.0, 60), horizontal(3.5, 105)
    assert "*2.000" in short and "*3.500" in long
    assert f"{COVERAGE_TARGET}*in_w-out_w" in short
    assert f"{COVERAGE_TARGET}*in_w-out_w" in long


def test_direction_alternates():
    assert horizontal(forward=True) != horizontal(forward=False)


def test_vertical_clips_still_move():
    # Owner 2026-08-10: "出现了很多静止的图". The vertical axis stopped
    # travelling, and the cover branch was also zeroing zoompan's pan for every
    # cover clip — so a pan_lr on the landscape canvas, whose zoom is a constant
    # 1.10 rather than a ramp, had no motion left at all. The pan is only
    # silenced when the CROP is the thing moving.
    from generate import kenburns_filter_v2
    vf = kenburns_filter_v2("pan_lr", 3.0, 1920, 1080, 1620, 1080,
                            bbox=[0.35, 0.35, 0.3, 0.3], cover=True,
                            src="", src_w=1500, src_h=1000)
    zp = vf.split("zoompan=")[1]
    assert "iw/2-(iw/zoom/2)" not in zp, f"pan was silenced with nothing else moving: {zp}"
    assert "on/" in zp, f"no zoompan motion left: {zp}"


# ── sweep direction ──────────────────────────────────────────────────────────
# Owner 2026-08-10: "我怎么发现ios的照片都是向左移动？是偶然的吗". It was not.
# Holding one direction for the whole tour fixed the ping-pong but flattened
# pan_rl and push_pan_rl into their _lr counterparts — a distinction the planner
# makes deliberately — and left every undirected mode going the same way.

def swept(forward: bool) -> str:
    return cover_travel("", 2.5, 75, 0.5, 0.5, *WIDE, *SQUARE_CANVAS, forward)


def test_the_two_directions_are_actually_different():
    assert swept(True) != swept(False)


def test_forward_and_backward_are_mirror_progressions():
    # backward is the same travel run in reverse, not a different distance.
    assert "(1-(" in swept(False)
    assert "(1-(" not in swept(True)
