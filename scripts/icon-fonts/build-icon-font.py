#!/usr/bin/env python3
"""Rebuild `apps/mobile/assets/fonts/PerchoIcons.ttf` from the full Phosphor Fill font.

WHY THIS SCRIPT EXISTS
----------------------
The app ships a SUBSET font (14 glyphs, ~5 KB) rather than the whole Phosphor
Fill family (1512 glyphs, 440 KB). A subset has one sharp edge: adding a name to
`ICON_GLYPH` in `apps/mobile/components/cards/redline/icon-font.ts` without
re-running the subset renders a blank glyph on device and nowhere else. So the
subset must be reproducible, not a one-off artifact somebody made by hand.

`apps/mobile/theme/icon-font.test.ts` fails if the table and the font disagree,
which is what turns "forgot to re-subset" into a red test instead of a bug the
owner finds on his phone.

USAGE
-----
    python3 scripts/icon-fonts/build-icon-font.py

Adding an icon:
  1. Find the Phosphor name at https://phosphoricons.com (use the FILL weight).
  2. Add it to GLYPHS below, keyed by the name faces use.
  3. Add the same key + codepoint to `ICON_GLYPH` in `icon-font.ts`.
  4. Run this script, then `npx vitest run theme/icon-font.test.ts`.

Requires `fonttools` (pip install fonttools) and `assets/icons/Phosphor-Fill.ttf`.
"""

import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SOURCE_FONT = REPO / "assets/icons/Phosphor-Fill.ttf"
SELECTION = REPO / "assets/icons/phosphor-selection.json"
OUT_FONT = REPO / "apps/mobile/assets/fonts/PerchoIcons.ttf"

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
    "bookmark": "bookmark-fill",          # saved state (filled bookmark)
    "arrowRight": "arrow-right-fill",     # explore link affordance
}


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

    OUT_FONT.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            sys.executable, "-m", "fontTools.subset", str(SOURCE_FONT),
            f"--unicodes={unicodes}",
            f"--output-file={OUT_FONT}",
            "--no-hinting",
            "--drop-tables+=DSIG",
            "--name-IDs=*",
            "--recalc-bounds",
        ],
        check=True,
    )

    print(f"{OUT_FONT.relative_to(REPO)}  {OUT_FONT.stat().st_size:,} bytes")
    print(f"{len(codes)} glyphs\n")
    print("ICON_GLYPH codepoints (must match icon-font.ts):")
    for name in sorted(codes):
        print(f'  {name:8s} "\\u{codes[name]:04x}"  {GLYPHS[name]}')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
