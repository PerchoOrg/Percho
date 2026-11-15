"""City-film data frames draw inside the canvas, and build up with progress."""

import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "scripts" / "render-worker"))

from data_frames import draw_overlay, render_background  # noqa: E402

W, H = 1080, 1576

FRAMES = {
    "title": {
        "type": "title",
        "eyebrow": "City · Gwinnett County, Georgia",
        "headline": "Suwanee",
        "chip": "#1 in Georgia for families · Fortune 2024",
        "sub": "33 miles northeast of downtown Atlanta",
    },
    "rows": {
        "type": "rows",
        "eyebrow": "History",
        "headline": "A railroad town",
        "rows": [
            {"k": "1871", "v": "A depot on the Air Line Railroad — the village grows around it"},
            {"k": "1949", "v": "Incorporated as a city"},
            {"k": "1979–98", "v": "Home of the Atlanta Falcons' training camp"},
            {"k": "2005–09", "v": "Town Center Park and City Hall are built"},
        ],
    },
    "bars": {
        "type": "bars",
        "eyebrow": "Growth",
        "headline": "8.6× since 1990",
        "sub": "Population, by census",
        "bars": [
            {"label": "1990", "value": 2412, "display": "2,412"},
            {"label": "2000", "value": 8725, "display": "8,725"},
            {"label": "2010", "value": 15355, "display": "15,355"},
            {"label": "2020", "value": 20786, "display": "20,786"},
        ],
        "source": "U.S. Census Bureau, decennial census",
    },
    "stats": {
        "type": "stats",
        "eyebrow": "Schools",
        "headline": "North Gwinnett High",
        "stats": [
            {"value": "#16", "label": "in Georgia — U.S. News Best High Schools, 2025–26"},
            {"value": "95%", "label": "graduate in four years"},
            {"value": "A+", "label": "Niche overall grade"},
        ],
        "source": "U.S. News; SchoolDigger; Niche",
    },
}


def ink_box(img):
    return img.getchannel("A").getbbox()


@pytest.mark.parametrize("kind", sorted(FRAMES))
def test_a_full_frame_stays_inside_the_side_margins_and_the_canvas(kind):
    img = draw_overlay(FRAMES[kind], W, H, 1.0)
    assert img.size == (W, H)
    left, top, right, bottom = ink_box(img)
    margin = round(W * 0.085)
    assert left >= margin - 2
    assert right <= W - margin + 2
    # Clear of the app's chrome at the top and of the card's foot.
    assert top >= H * 0.20
    assert bottom <= H * 0.93


@pytest.mark.parametrize("kind", sorted(FRAMES))
def test_nothing_is_drawn_before_the_build_starts(kind):
    assert ink_box(draw_overlay(FRAMES[kind], W, H, 0.0)) is None


def test_bars_grow_with_progress():
    # The tallest bar's top climbs as the chart builds.
    half = ink_box(draw_overlay({**FRAMES["bars"], "eyebrow": "", "headline": "", "sub": ""}, W, H, 0.6))
    full = ink_box(draw_overlay({**FRAMES["bars"], "eyebrow": "", "headline": "", "sub": ""}, W, H, 1.0))
    assert half is not None and full is not None
    assert full[1] < half[1]


def test_the_longest_headline_the_schema_allows_shrinks_to_fit():
    # 28 characters — the cap in apps/web/lib/zod/city-profile.ts.
    frame = {**FRAMES["rows"], "headline": "Peachtree Corners and Duluth"}
    _, _, right, _ = ink_box(draw_overlay(frame, W, H, 1.0))
    assert right <= W - round(W * 0.085) + 2


def test_background_is_twice_the_canvas(tmp_path):
    from PIL import Image

    photo = tmp_path / "p.jpg"
    Image.new("RGB", (1600, 900), (120, 160, 200)).save(photo)
    for sharp in (True, False):
        assert render_background(photo, W, H, sharp).size == (W * 2, H * 2)
