"""The hero prompt's fence: pool-only effects, verbatim clauses, safe fallback.

Owner 2026-08-22, after reviewing the filmed effect vocabulary (Hero Shot
Lab): the model picks the move and writes scene/motion/focus, but the camera
sentence is looked up, the mandatory clauses are appended verbatim, the
rejected effects are not in the pool at all, and a birdview needs a real
aerial photo. Every rule here is one the model must not be able to break.
"""

import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "scripts" / "render-worker"))

from hero_prompt import (  # noqa: E402
    BIRDVIEW_EFFECTS,
    CAMERA,
    MANDATORY_CLAUSES,
    choose_hero_prompt,
    compose_prompt,
    fallback_hero,
    looks_aerial,
)

HERO = b"fake-hero-bytes"
AERIALS = [{"id": "aer-1", "bytes": b"a1"}, {"id": "aer-2", "bytes": b"a2"}]


def fake_call(reply):
    def call(system, user_prompt, images):
        return dict(reply)
    return call


GOOD = {
    "effect": "establish_push",
    "aerial_index": None,
    "scene": "A two-story brick home with a covered porch.",
    "motion": "The only movement is leaves swaying gently; everything else stays completely still.",
    "focus": "Ending on the front entry.",
}


def test_good_pick_carries_camera_and_clauses_verbatim():
    out = choose_hero_prompt(HERO, [], call=fake_call(GOOD))
    assert out["effect"] == "establish_push"
    assert CAMERA["establish_push"] in out["prompt"]
    for clause in MANDATORY_CLAUSES:
        assert clause in out["prompt"]
    assert GOOD["scene"] in out["prompt"]
    assert GOOD["focus"] in out["prompt"]
    assert out["pair_photo_id"] is None and out["pair_role"] is None


def test_effect_outside_pool_falls_back():
    for bad in ["aerial_pull_away", "facade_tilt_up", "streetscape_glide", "zoom", None]:
        out = choose_hero_prompt(HERO, [], call=fake_call({**GOOD, "effect": bad}))
        assert out["effect"] == "full_frame_hold"


def test_rejected_effects_are_not_in_the_pool():
    # The owner's explicit rejections must not merely be discouraged — they
    # must have no camera sentence to render from.
    for rejected in ["aerial_pull_away", "facade_tilt_up", "streetscape_glide"]:
        assert rejected not in CAMERA


def test_birdview_maps_pair_role_by_direction():
    # aerial_index is the GLOBAL image number: hero is 1, aerials start at 2.
    # The first live run proved the model counts this way — it answered 2 for
    # the only aerial in a two-image call.
    descend = {**GOOD, "effect": "birdview_descend", "aerial_index": 3}
    out = choose_hero_prompt(HERO, AERIALS, call=fake_call(descend))
    assert out["pair_photo_id"] == "aer-2" and out["pair_role"] == "first"

    rise = {**GOOD, "effect": "rise_to_birdview", "aerial_index": 2}
    out = choose_hero_prompt(HERO, AERIALS, call=fake_call(rise))
    assert out["pair_photo_id"] == "aer-1" and out["pair_role"] == "last"


def test_birdview_accepts_digit_string_index():
    pick = {**GOOD, "effect": "birdview_descend", "aerial_index": "2"}
    out = choose_hero_prompt(HERO, AERIALS, call=fake_call(pick))
    assert out["pair_photo_id"] == "aer-1" and out["pair_role"] == "first"


def test_birdview_without_valid_aerial_falls_back():
    # 1 is the hero itself; 4 is past the last aerial; no aerials at all.
    for idx, aerials in [(None, AERIALS), (1, AERIALS), (4, AERIALS), (2, [])]:
        pick = {**GOOD, "effect": "birdview_descend", "aerial_index": idx}
        out = choose_hero_prompt(HERO, aerials, call=fake_call(pick))
        assert out["effect"] == "full_frame_hold"
        assert out["pair_photo_id"] is None


def test_banned_words_are_stripped_from_model_text():
    noisy = {**GOOD, "scene": "A dramatic cinematic home with a porch.",
             "focus": "A fast dynamic ending."}
    out = choose_hero_prompt(HERO, [], call=fake_call(noisy))
    low = out["prompt"].lower()
    for word in ["fast", "cinematic", "epic", "dramatic", "dynamic"]:
        assert word not in low


def test_overlong_focus_is_dropped_not_fatal():
    out = choose_hero_prompt(HERO, [], call=fake_call({**GOOD, "focus": "x" * 300}))
    assert out["effect"] == "establish_push"
    assert "x" * 50 not in out["prompt"]


def test_call_failure_falls_back_with_caption():
    def boom(system, user_prompt, images):
        raise RuntimeError("network down")

    out = choose_hero_prompt(HERO, [], caption="Brick home at dusk", call=boom)
    assert out["effect"] == "full_frame_hold"
    assert "Brick home at dusk." in out["prompt"]
    for clause in MANDATORY_CLAUSES:
        assert clause in out["prompt"]


def test_compose_rejects_unknown_effect():
    try:
        compose_prompt("dolly_zoom", "scene.", "motion.")
        raise AssertionError("should have raised")
    except Exception:
        pass


def test_fallback_is_always_legal():
    out = fallback_hero(None)
    assert out["effect"] == "full_frame_hold"
    for clause in MANDATORY_CLAUSES:
        assert clause in out["prompt"]


def test_birdview_effects_all_have_cameras():
    for e in BIRDVIEW_EFFECTS:
        assert e in CAMERA


def test_looks_aerial_keyword_filter():
    assert looks_aerial({"caption": "Aerial view of two-story home"})
    assert looks_aerial({"caption": "Drone shot of the lot"})
    assert not looks_aerial({"caption": "Bright kitchen with marble island"})
    assert not looks_aerial(None)
    assert not looks_aerial({"caption": None})
