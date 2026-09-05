#!/usr/bin/env python3
"""Rebuild the redline icon fonts — BOTH weights — from the full Phosphor family.

WHY THIS SCRIPT EXISTS
----------------------
The app ships a SUBSET font (~5 KB) rather than the whole Phosphor family
(1512 glyphs, 440 KB). A subset has one sharp edge: adding a name to
`ICON_GLYPH` in `apps/mobile/components/cards/redline/icon-font.ts` without
re-running the subset renders a blank glyph on device and nowhere else. So the
subset must be reproducible, not a one-off artifact somebody made by hand.

`apps/mobile/theme/icon-font.test.ts` fails if the table and the font disagree,
which is what turns "forgot to re-subset" into a red test instead of a bug the
owner finds on his phone.

BOTH WEIGHTS (2026-09-05)
-------------------------
`RedlineIcon` renders the same codepoints in fill or outline
(`weight="outline"` → `PerchoIconsOutline.ttf`), but only the fill font had a
build script — the outline one was a hand-made artifact, so adding a glyph to
it was not reproducible. It is built here now. Verified before the change: the
committed `PerchoIcons.ttf` and `PerchoIconsOutline.ttf` are both byte-identical
to what these two subset calls produce, so nothing about the existing 19 glyphs
moves when a new one is added.

The fill source is committed (`brand/icons/Phosphor-Fill.ttf`); the regular
weight is not, so it is fetched from the pinned npm package — the same source
and version `build-tabbar-icon-font.py` uses, which is why the two fonts'
drawings match.

The two subsets keep their own INTERNAL family names ("Phosphor-Fill" and
"Phosphor"): CoreText keys fonts by that name, so two subsets sharing one would
silently collide and render tofu (see `rename_family` in the tabbar script).

USAGE
-----
    python3 scripts/icon-fonts/build-icon-font.py

Adding an icon:
  1. Find the Phosphor name at https://phosphoricons.com (use the FILL weight).
  2. Add it to GLYPHS below, keyed by the name faces use.
  3. Add the same key + codepoint to `ICON_GLYPH` in `icon-font.ts`, and the
     measured art widths to `ICON_ART_WIDTH` / `OUTLINE_ART_WIDTH` (the script
     prints both).
  4. Run this script, then `npx vitest run theme/icon-font.test.ts`.

Requires `fonttools` (pip install fonttools) and `brand/icons/Phosphor-Fill.ttf`.
"""

import gzip
import io
import json
import subprocess
import sys
import tarfile
import urllib.request
from pathlib import Path

# scripts/icon-fonts/<this file> — three levels up is the repo root. (It was
# `parent.parent` until 2026-09-05, from before the scripts moved into
# `icon-fonts/`, so every path resolved under `scripts/` and the script could
# not find its own source font. `build-tabbar-icon-font.py` still has the
# unfixed copy.)
REPO = Path(__file__).resolve().parent.parent.parent
SOURCE_FONT = REPO / "brand/icons/Phosphor-Fill.ttf"
SELECTION = REPO / "brand/icons/phosphor-selection.json"
OUT_FONT = REPO / "apps/mobile/assets/fonts/PerchoIcons.ttf"
OUT_OUTLINE = REPO / "apps/mobile/assets/fonts/PerchoIconsOutline.ttf"

# Regular (outline) weight — not committed, fetched from the pinned package.
TMP = Path("/tmp/phosphor-web")
PKG_URL = "https://registry.npmjs.org/@phosphor-icons/web/-/web-2.1.2.tgz"
REGULAR_IN_PKG = "package/src/regular/Phosphor.ttf"

# Our icon name -> Phosphor Fill glyph name. Must stay in sync with ICON_GLYPH
# in apps/mobile/components/cards/redline/icon-font.ts.
GLYPHS = {
    "camera": "camera-fill",              # "18 Photos" pill
    "car": "car-fill",                    # commute / drive
    "check": "check-circle-fill",         # "Move-in Ready"
    "cup": "cheers-fill",                 # "Great for Hosting" / nightlife
    "expand": "arrows-out-fill",          # "Spacious"
    "family": "users-three-fill",         # "Family Friendly"
    "moon": "moon-stars-fill",            # "Quiet Streets"
    "path": "path-fill",                  # "Trails Nearby"
    "school": "graduation-cap-fill",      # "Top Schools"
    "shop": "storefront-fill",            # "Cultural Scene"
    "sparkle": "sparkle-fill",            # "Percho noticed"
    "tree": "tree-fill",                  # "Private Backyard"
    "walk": "footprints-fill",            # "Walkable"
    "yard": "picnic-table-fill",          # outdoor space (tradeoff face)
    # Added 2026-08-02 for the community card's resident reasons (layout E).
    # Each exists because the alternative was two different claims sharing art —
    # see the CardIconName docs in packages/shared/src/icons.ts.
    "dog": "dog-fill",                    # "Dog Friendly" (35.8% of communities)
    "handshake": "handshake-fill",        # "Friendly" / "Welcoming" / "Neighbors"
    "shieldCheck": "shield-check-fill",   # "Safe" (41.4%)
    # Added 2026-08-13 for the listing card's save heart (top-right, FILLED
    # when saved) and the right-bottom "Explore home →" link row.
    #
    # `bookmark` was `bookmark-fill` until 2026-09-05 and drawn by nothing —
    # phase140 replaced the glyph with hand-built `View`s. The card corner
    # renders a real glyph again (owner pick "H1"), and it is deliberately
    # `bookmark-simple`, the SAVED TAB's drawing (`TAB_BAR_GLYPH.saved`), so
    # the card's save and the tab it saves into are the same shape.
    "bookmark": "bookmark-simple-fill",   # saved state (filled bookmark)
    "arrowRight": "arrow-right-fill",     # explore link affordance
    # Added 2026-09-05 for the card corner's mute (owner pick "H1"). Neither
    # icon font had a speaker, which is why phase140 drew one from bordered
    # `View`s — at 17pt that art closed into a blob (owner: the icons "look
    # weird"). `-simple-` is the flat-bar speaker, which stays legible at 15pt
    # where the arc-wave one does not.
    "soundOn": "speaker-simple-high-fill",
    "soundOff": "speaker-simple-slash-fill",
}


def fetch_regular_ttf() -> Path:
    """Return the regular-weight TTF path (cached in /tmp), fetched from npm."""
    src = TMP / REGULAR_IN_PKG
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
        t.extract(REGULAR_IN_PKG, TMP)
    return src


def subset(source: Path, out: Path, unicodes: str) -> None:
    """pyftsubset `source` down to `unicodes`. Deterministic — same bytes every run."""
    out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            sys.executable, "-m", "fontTools.subset", str(source),
            f"--unicodes={unicodes}",
            f"--output-file={out}",
            "--no-hinting",
            "--drop-tables+=DSIG",
            "--name-IDs=*",
            "--recalc-bounds",
        ],
        check=True,
    )


def art_widths(font_path: Path, codes: dict[str, int]) -> dict[str, float]:
    """Each glyph's drawn width as a fraction of the em box.

    `RedlineIcon` centres the DRAWING, not the em box (the art is flush left in
    a 1em advance), so it needs this number per glyph per weight. Measuring it
    here is what keeps `ICON_ART_WIDTH` / `OUTLINE_ART_WIDTH` honest — the
    previous numbers were measured by hand with a snippet pasted in a docstring.
    """
    from fontTools.pens.boundsPen import BoundsPen
    from fontTools.ttLib import TTFont

    font = TTFont(font_path)
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    upem = font["head"].unitsPerEm
    out = {}
    for name, code in codes.items():
        pen = BoundsPen(glyphs)
        glyphs[cmap[code]].draw(pen)
        out[name] = round(pen.bounds[2] / upem, 4)
    return out


def main() -> int:
    if not SOURCE_FONT.exists():
        print(f"missing {SOURCE_FONT}", file=sys.stderr)
        return 1
    if not SELECTION.exists():
        print(f"missing {SELECTION}", file=sys.stderr)
        return 1

    # Phosphor's own selection.json maps glyph name -> codepoint.
    by_name = {
        i["properties"]["name"]: i["properties"]["code"]
        for i in json.loads(SELECTION.read_text())["icons"]
    }

    missing = sorted(g for g in GLYPHS.values() if g not in by_name)
    if missing:
        print(f"not in Phosphor Fill: {missing}", file=sys.stderr)
        return 1

    codes = {name: by_name[glyph] for name, glyph in GLYPHS.items()}
    unicodes = ",".join(f"U+{c:04X}" for c in sorted(codes.values()))

    subset(SOURCE_FONT, OUT_FONT, unicodes)
    subset(fetch_regular_ttf(), OUT_OUTLINE, unicodes)

    for out in (OUT_FONT, OUT_OUTLINE):
        print(f"{out.relative_to(REPO)}  {out.stat().st_size:,} bytes")
    print(f"{len(codes)} glyphs\n")
    print("ICON_GLYPH codepoints (must match icon-font.ts):")
    for name in sorted(codes):
        print(f'  {name:12s} "\\u{codes[name]:04x}"  {GLYPHS[name]}')

    fill = art_widths(OUT_FONT, codes)
    outline = art_widths(OUT_OUTLINE, codes)
    print("\nICON_ART_WIDTH / OUTLINE_ART_WIDTH (fill, outline):")
    for name in sorted(codes):
        print(f"  {name:12s} {fill[name]:<8} {outline[name]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
