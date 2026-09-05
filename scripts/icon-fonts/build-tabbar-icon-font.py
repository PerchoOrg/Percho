#!/usr/bin/env python3
"""Rebuild the TabBar icon subset fonts (outline + fill).

The TabBar spec (owner 2026-08-14): one icon library (Phosphor), outline
style. The project's existing icon fonts are the redline's (PerchoIconsFill /
PerchoIconsOutline); the TabBar is OUTSIDE the redline — its tokens come from
theme/tokens `colors` (warm paper, amber accent), not the redline green — so
it gets its own font.

2026-09-05 (owner): new glyph set — house-line / compass / heart /
hand-waving — and the active tab is DUOTONE: the fill glyph at low opacity
sits under the outline glyph. That needs the same four drawings in both
weights, so this script now builds two subsets from two upstream TTFs.
Codepoints are identical across weights, so one table addresses both.

Source: Phosphor's regular (outline) weight TTF from the @phosphor-icons/web
npm package (`package/src/regular/Phosphor.ttf`), subset with fontTools
subset — the same reproducible path `scripts/icon-fonts/build-icon-font.py` uses for the
fill weight. The fill-weight codepoints are the same across weights, so they
line up with `brand/icons/phosphor-selection.json`.

Why the official TTF and not SVG→TTF: the first version hand-built the font
from Phosphor's regular SVG paths, and CoreText filled every interior hole —
the icons rendered as solid blobs on device (owner: "三个一模一样"). The
official TTF carries correct winding; subsetting it preserves the outlines.

Usage:
    python3 scripts/icon-fonts/build-tabbar-icon-font.py

Prints the codepoints for TAB_BAR_GLYPH in TabBarIconFont.ts.
"""
import subprocess
import sys
import urllib.request
import gzip
import io
import tarfile
from pathlib import Path
# scripts/icon-fonts/<this file> -> repo root is three levels up. (Was two,
# left stale when the script moved into scripts/icon-fonts/.)
REPO = Path(__file__).resolve().parent.parent.parent
TMP = Path("/tmp/phosphor-web")
PKG_URL = "https://registry.npmjs.org/@phosphor-icons/web/-/web-2.1.2.tgz"

# (upstream TTF inside the package, output font, registered family name)
WEIGHTS = [
    ("regular", "TabBarIcons.ttf", "TabBarIcons"),
    ("fill", "TabBarIconsFill.ttf", "TabBarIconsFill"),
]

GLYPHS = ["house-line", "compass", "heart", "hand-waving"]

# Codepoints (phosphor-selection.json) — identical in every weight.
CODEPOINTS = {
    "house-line": 0xE2C4,
    "compass": 0xE1C8,
    "heart": 0xE2A8,
    "hand-waving": 0xE580,
}


def fetch_ttf(weight: str) -> Path:
    """Return the TTF path for `weight` (cached in /tmp)."""
    member = f"package/src/{weight}/{'Phosphor' if weight == 'regular' else 'Phosphor-' + weight.capitalize()}.ttf"
    src = TMP / member
    if src.exists():
        return src
    print(f"fetching {PKG_URL}")
    req = urllib.request.Request(
        PKG_URL,
        headers={"User-Agent": "curl/8.0", "Accept-Encoding": "identity"},
    )
    data = urllib.request.urlopen(req, timeout=90).read()
    if data[:2] == b"\x1f\x8b":  # npm tarball: gzip'd tar
        data = gzip.decompress(data)
    TMP.mkdir(parents=True, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(data)) as t:
        t.extractall(TMP, members=[m for m in t.getmembers() if m.name.endswith(".ttf")])
    return src


def main() -> int:
    unicodes = ",".join(f"U+{CODEPOINTS[g]:04X}" for g in GLYPHS)
    for weight, filename, family in WEIGHTS:
        src = fetch_ttf(weight)
        out = REPO / "apps/mobile/assets/fonts" / filename
        subprocess.run(
            [
                sys.executable,
                "-m",
                "fontTools.subset",
                str(src),
                f"--unicodes={unicodes}",
                f"--output-file={out}",
                "--no-hinting",
                "--name-IDs=*",
            ],
            check=True,
        )
        # The source family name is "Phosphor" — identical to
        # `PerchoIconsOutline.ttf` (the redline outline set). expo-font/CoreText
        # key fonts by their INTERNAL name table, so a second font registering the
        # same family silently loses, the glyph falls back to an emoji/PUA glyph,
        # and every tab icon renders as a colored blob (owner: "我的 expo 视频都没有声音"
        # — same class of breakage). Rename each subset so it registers uniquely.
        rename_family(out, family)
        print(f"wrote {out} ({unicodes})")
    for g in GLYPHS:
        print(f"{g} = U+{CODEPOINTS[g]:04X}")
    return 0


def rename_family(ttf_path: Path, family: str) -> None:
    """Rewrite name IDs 1/3/4/6/16/17 to `family` (fontTools API)."""
    from fontTools.ttLib import TTFont

    font = TTFont(ttf_path)
    name = font["name"]
    # Family (1), unique (3), full (4), postscript (6), typographic family (16),
    # typographic subfamily (17). Keep subfamily names (2/5) as-is.
    for name_id in (1, 3, 4, 6, 16, 17):
        for record in name.names:
            if record.nameID == name_id:
                record.string = family.encode(record.getEncoding() or "utf-8")
    font.save(ttf_path)


if __name__ == "__main__":
    raise SystemExit(main())
