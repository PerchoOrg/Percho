#!/usr/bin/env python3
"""Rebuild the TabBar icon subset font.

The TabBar spec (owner 2026-08-14): one icon library (Phosphor), outline
style, 22px at ~1.75 stroke. The project's existing icon fonts are the
redline's (PerchoIconsFill / PerchoIconsOutline); the TabBar is OUTSIDE the
redline — its tokens come from theme/tokens `colors` (warm paper, amber
accent), not the redline green — so it gets its own font.

Source: Phosphor's regular (outline) weight from the @phosphor-icons/core npm
package (assets/regular/*.svg), rendered to a minimal TTF via fontTools.
Codepoints are Phosphor's fill-weight codepoints (same glyphs, same codes
across weights) so they line up with phosphor-selection.json.

Usage:
    python3 scripts/build-tabbar-icon-font.py

Prints the codepoints for ICON_GLYPH in TabBarIconFont.ts.
"""
import io
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "apps/mobile/assets/fonts/TabBarIcons.ttf"
TMP = Path("/tmp/phosphor-core")
PKG_URL = "https://registry.npmjs.org/@phosphor-icons/core/-/core-2.1.1.tgz"

GLYPHS = ["house-simple", "magnifying-glass", "bookmark-simple", "user"]

# Fill-weight codepoints (phosphor-selection.json) — same across weights.
FILL_CODEPOINTS = {
    "house-simple": 0xE2C6,
    "magnifying-glass": 0xE30C,
    "bookmark-simple": 0xE0EA,
    "user": 0xE4C2,
}


def fetch_regular_svgs() -> dict[str, str]:
    """Glyph name -> svg body, from the npm package (cached in /tmp)."""
    cache = {g: TMP / f"package/assets/regular/{g}.svg" for g in GLYPHS}
    if all(p.exists() for p in cache.values()):
        return {g: p.read_text() for g, p in cache.items()}
    print(f"fetching {PKG_URL}")
    req = urllib.request.Request(
        PKG_URL,
        headers={"User-Agent": "curl/8.0", "Accept-Encoding": "identity"},
    )
    data = urllib.request.urlopen(req, timeout=90).read()
    if data[:2] == b"\x1f\x8b":  # npm tarball: gzip'd tar
        data = __import__("gzip").decompress(data)
    import tarfile

    TMP.mkdir(parents=True, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(data)) as z:
        for g in GLYPHS:
            z.extract(f"package/assets/regular/{g}.svg", TMP)
    return {g: p.read_text() for g, p in cache.items()}


def svg_to_ttf(svgs: dict[str, str], out: Path) -> None:
    from fontTools.misc.transform import Transform
    from fontTools.pens.ttGlyphPen import TTGlyphPen
    from fontTools.pens.transformPen import TransformPen
    from fontTools.svgLib import SVGPath
    from fontTools.ttLib import TTFont, newTable

    upe = 1000
    font = TTFont()
    glyph_order = [".notdef", *GLYPHS]
    font.setGlyphOrder(glyph_order)

    cmap = newTable("cmap")
    from fontTools.ttLib.tables._c_m_a_p import CmapSubtable

    sub = CmapSubtable.newSubtable(4)
    sub.platformID, sub.platEncID, sub.language = 3, 1, 0
    sub.format = 4
    sub.cmap = {FILL_CODEPOINTS[g]: g for g in GLYPHS}
    cmap.tableVersion = 0
    cmap.tables = [sub]
    font["cmap"] = cmap

    glyf = newTable("glyf")
    glyf.glyphOrder = glyph_order
    glyf.glyphs = {}
    hmtx = newTable("hmtx")
    hmtx.metrics = {}
    # viewBox 0 0 256 256 -> 0 0 1000 1000, flip Y so +Y is up.
    t = Transform().translate(0, upe).scale(upe / 256, -upe / 256)
    for i, g in enumerate(GLYPHS):
        sp = SVGPath.fromstring(svgs[g])
        pen = TTGlyphPen(None)
        tpen = TransformPen(pen, t)
        sp.draw(tpen)
        glyf.glyphs[g] = pen.glyph()
        hmtx.metrics[g] = (upe, 0)
    glyf.glyphs[".notdef"] = glyf.glyphs[GLYPHS[0]]
    hmtx.metrics[".notdef"] = (upe, 0)
    font["glyf"] = glyf
    font["hmtx"] = hmtx
    # loca needed by readers (decompile of glyf). Empty table is fine — fontTools
    # computes offsets from head.indexToLocFormat when saving.
    font["loca"] = newTable("loca")

    head = newTable("head")
    head.tableVersion = 1.0
    head.unitsPerEm = upe
    head.created = head.modified = 0
    head.indexToLocFormat = 0
    head.glyphDataFormat = 0
    head.magicNumber = 0x5F0F3CF5
    head.checkSumAdjustment = 0
    head.lowestRecPPEM = 8
    head.fontRevision = 1.0
    head.flags = 3
    head.macStyle = 0
    head.fontDirectionHint = 2
    head.xMin, head.yMin, head.xMax, head.yMax = 0, 0, upe, upe
    font["head"] = head

    hhea = newTable("hhea")
    hhea.tableVersion = 0x00010000
    hhea.ascent, hhea.descent = upe, 0
    hhea.lineGap = 0
    hhea.numberOfHMetrics = len(glyph_order)
    hhea.advanceWidthMax = upe
    hhea.minLeftSideBearing = 0
    hhea.minRightSideBearing = 0
    hhea.xMaxExtent = upe
    hhea.caretSlopeRise = 1
    hhea.caretSlopeRun = 0
    hhea.caretOffset = 0
    hhea.reserved0 = hhea.reserved1 = hhea.reserved2 = hhea.reserved3 = 0
    hhea.metricDataFormat = 0
    font["hhea"] = hhea

    maxp = newTable("maxp")
    maxp.tableVersion = 0x00010000
    maxp.numGlyphs = len(glyph_order)
    # v1.0 fields (all zero: no composites, no instructions). Skip recalc —
    # it wants compiled glyph metrics; for this tiny set zeros are exact.
    for f in (
        "maxPoints", "maxContours", "maxCompositePoints", "maxCompositeContours",
        "maxZones", "maxTwilightPoints", "maxStorage", "maxFunctionDefs",
        "maxInstructionDefs", "maxStackElements", "maxSizeOfInstructions",
        "maxComponentElements", "maxComponentDepth",
    ):
        setattr(maxp, f, 0)
    font["maxp"] = maxp

    name = newTable("name")
    name.names = []
    font["name"] = name

    post = newTable("post")
    post.formatType = 3.0
    post.italicAngle = 0
    post.underlinePosition = -100
    post.underlineThickness = 50
    post.isFixedPitch = 0
    post.minMemType42 = post.maxMemType42 = post.minMemType1 = post.maxMemType1 = 0
    font["post"] = post

    from fontTools.ttLib.tables import O_S_2f_2 as os2mod

    os2 = newTable("OS/2")
    os2.version = 4
    os2.xAvgCharWidth = upe
    os2.usWeightClass = 400
    os2.usWidthClass = 5
    os2.fsType = 0
    os2.ySubscriptXSize = os2.ySubscriptYSize = 650
    os2.ySubscriptXOffset = 0
    os2.ySubscriptYOffset = 140
    os2.ySuperscriptXSize = os2.ySuperscriptYSize = 650
    os2.ySuperscriptXOffset = 0
    os2.ySuperscriptYOffset = 477
    os2.yStrikeoutSize = 50
    os2.yStrikeoutPosition = 258
    os2.sFamilyClass = 0
    os2.panose = {k: 0 for k in os2mod.sstruct.getformat(os2mod.panoseFormat)[1]}
    os2.ulUnicodeRange1 = os2.ulUnicodeRange2 = os2.ulUnicodeRange3 = os2.ulUnicodeRange4 = 0
    os2.achVendID = "PCHO"
    os2.fsSelection = 0x40
    os2.usFirstCharIndex = min(FILL_CODEPOINTS.values())
    os2.usLastCharIndex = max(FILL_CODEPOINTS.values())
    os2.sTypoAscender, os2.sTypoDescender = upe, 0
    os2.sTypoLineGap = 0
    os2.usWinAscent, os2.usWinDescent = upe, 0
    os2.ulCodePageRange1 = os2.ulCodePageRange2 = 0
    os2.sxHeight = 500
    os2.sCapHeight = 700
    os2.usDefaultChar = 0
    os2.usBreakChar = 32
    os2.usMaxContext = 0
    font["OS/2"] = os2

    font.save(out)
    print(f"wrote {out} ({len(GLYPHS)} glyphs, {out.stat().st_size} bytes)")


def main() -> int:
    svgs = fetch_regular_svgs()
    svg_to_ttf(svgs, OUT)
    for g in GLYPHS:
        print(f"{g} = U+{FILL_CODEPOINTS[g]:04X}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
