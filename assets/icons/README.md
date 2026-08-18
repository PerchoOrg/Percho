# Percho icon set — Phosphor Fill

The card icon set, chosen by the owner on 2026-08-01 after reviewing six real
icon libraries at true chip size (`demo.percho.co/icon-sets`). Saved here so the
next surface (web, email, marketing, agent dashboard) reuses the same drawings
instead of picking a new library.

## What's here

| Path | What | Use it for |
|---|---|---|
| `phosphor-fill/*.svg` | The 14 chosen glyphs, standalone SVGs, `fill="currentColor"` | Web / email / marketing / anywhere that is not React Native |
| `Phosphor-Fill.ttf` | Full upstream font, 1512 glyphs, 440 KB | Source for re-subsetting only — **never ship this** |
| `phosphor-selection.json` | Glyph name → codepoint (slimmed from Phosphor's 2 MB original) | Input to the subset script |
| `phosphor-fill/_preview.html` | Contact sheet of the 14 SVGs at chip size | Eyeballing the set before adding a glyph |
| `../../scripts/icon-fonts/build-icon-font.py` | Rebuilds the app's subset font | Adding/changing an app glyph |
| `../../apps/mobile/assets/fonts/PerchoIcons.ttf` | Shipped subset, 14 glyphs, 5.2 KB | What the mobile app actually loads |

## The 14 glyphs

Names on the left are Percho's (`RedlineIconName`); they are stable API used by
every card face. The Phosphor name is the actual drawing.

| Percho name | Phosphor Fill | Codepoint | Reads as |
|---|---|---|---|
| `school` | `graduation-cap-fill` | U+E62C | Top Schools |
| `tree` | `tree-fill` | U+E6DA | Private Backyard |
| `path` | `path-fill` | U+E39C | Trails Nearby |
| `walk` | `footprints-fill` | U+EA88 | Walkable |
| `moon` | `moon-stars-fill` | U+E58E | Quiet Streets |
| `family` | `users-three-fill` | U+E68E | Family Friendly |
| `shop` | `storefront-fill` | U+E470 | Cultural Scene |
| `cup` | `cheers-fill` | U+EA4A | Great for Hosting / Nightlife |
| `check` | `check-circle-fill` | U+E184 | Move-in Ready |
| `expand` | `arrows-out-fill` | U+E0A2 | Spacious |
| `yard` | `picnic-table-fill` | U+EE26 | Outdoor space (tradeoff face) |
| `car` | `car-fill` | U+E112 | Commute |
| `camera` | `camera-fill` | U+E10E | Photo-count pill |
| `sparkle` | `sparkle-fill` | U+E6A2 | "Percho noticed" |

Licence: Phosphor Icons is MIT. Redistribution is fine, attribution appreciated.

## Why a font in the mobile app, not SVG

`react-native-svg` red screens in Expo Go on this project
(`RNSVGCircle must be a function`, DEVLOG 2026-07-30) and that constraint has not
gone away. Phosphor also ships an icon font, and a font needs no native module —
`expo-font` is a core Expo Go module and a glyph is just a `<Text>`. That is the
general escape hatch: **before adopting an icon library, check whether it ships a
`.ttf`.**

Outside React Native there is no such constraint — use the SVGs.

## Rules

**Never mix libraries.** One glyph from Lucide next to thirteen from Phosphor
reads as a bug. If a needed icon does not exist in Phosphor Fill, either compose
it from Phosphor parts or change the label.

**Fill weight only.** The set is `-fill`; regular/thin/duotone weights look like a
different family beside it. The one exception is the card's unsaved heart, which
is outline by design and stays hand-built (see `RedlineChrome.tsx`).

**Green is the accent.** `redline.accent` (#0E6B57) on card surfaces. Never amber
on a redline face.

## Adding a glyph to the mobile app

Adding a name to `ICON_GLYPH` alone renders a **blank** on device — the subset
font has to be rebuilt too. `apps/mobile/theme/icon-font.test.ts` fails loudly if
the table and the font disagree, so this cannot ship broken silently.

1. Find the name at <https://phosphoricons.com> — pick the **Fill** weight.
2. Add it to `GLYPHS` in `scripts/icon-fonts/build-icon-font.py`.
3. Add the same key to `ICON_GLYPH` in
   `apps/mobile/components/cards/redline/icon-font.ts` (the script prints the
   codepoint to paste).
4. `python3 scripts/icon-fonts/build-icon-font.py` (needs `fonttools`).
5. `cd apps/mobile && npx vitest run theme/icon-font.test.ts`.

To also use it on the web, export the SVG from `@iconify-json/ph` or download it
from phosphoricons.com into `phosphor-fill/`.

## Sizes in use

| Call site | Size | Where |
|---|---|---|
| Listing chip | 12pt | `CHIP_ICON`, `theme/listing-geometry.ts` |
| Community tile | 17pt | `TILE_ICON`, `CommunityFace.tsx` |
| Tradeoff choice | 24pt | `CHOICE_ICON`, `TradeoffFace.tsx` |
| Insight sparkle | 26pt | `SPARKLE`, `InsightFace.tsx` |

`RedlineIcon` multiplies the requested size by `ICON_OPTICAL_SCALE` (1.18)
because Phosphor's art fills only 0.69–0.91em of its em box, so a glyph set at
`fontSize === size` renders smaller than the box it was given.

The chip row is the tight one: three chips, nowrap, and the chip is
`flexShrink: 1`, so an oversized icon **silently squeezes a chip** rather than
erroring. 12pt leaves ~10pt spare on an iPhone SE; 13 leaves 7 and 14 leaves 4.
Do not raise it without redoing that width budget.
