#!/usr/bin/env python3
"""Rebuild the TabBar icon subset font.

The TabBar spec (owner 2026-08-14): one icon library (Phosphor), outline
style, 22px at ~1.75 stroke. The project's existing icon fonts are the
redline's (PerchoIconsFill / PerchoIconsOutline); the TabBar is OUTSIDE the
redline — its tokens come from theme/tokens `colors` (warm paper, amber
accent), not the redline green — so it gets its own font.

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
REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "apps/mobile/assets/fonts/TabBarIcons.ttf"
TMP = Path("/tmp/phosphor-web")
PKG_URL = "https://registry.npmjs.org/@phosphor-icons/web/-/web-2.1.2.tgz"

GLYPHS = ["house-simple", "magnifying-glass", "bookmark-simple", "user"]

# Fill-weight codepoints (phosphor-selection.json) — same across weights.
FILL_CODEPOINTS = {
    "house-simple": 0xE2C6,
    "magnifying-glass": 0xE30C,
    "bookmark-simple": 0xE0EA,
    "user": 0xE4C2,
}


def fetch_regular_ttf() -> Path:
    """Return the regular-weight TTF path (cached in /tmp)."""
    src = TMP / "package/src/regular/Phosphor.ttf"
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
        t.extract("package/src/regular/Phosphor.ttf", TMP)
    return src


def main() -> int:
    src = fetch_regular_ttf()
    unicodes = ",".join(f"U+{FILL_CODEPOINTS[g]:04X}" for g in GLYPHS)
    subprocess.run(
        [
            sys.executable,
            "-m",
            "fontTools.subset",
            str(src),
            f"--unicodes={unicodes}",
            f"--output-file={OUT}",
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
    # — same class of breakage). Rename this subset so it registers uniquely.
    rename_family(OUT, "TabBarIcons")
    print(f"wrote {OUT} ({unicodes})")
    for g in GLYPHS:
        print(f"{g} = U+{FILL_CODEPOINTS[g]:04X}")
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
