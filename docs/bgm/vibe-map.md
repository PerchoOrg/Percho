# BGM Vibe Map

**Last updated**: 2026-07-15 (phase75)

The render worker picks a random background track for every generated
listing video. Tracks live in vibe-buckets under
`scripts/render-worker/bgm/<bucket>/`. `worker.pick_bgm()` recurses
into every non-archive bucket and picks uniformly at random.

## SOP (from owner, 2026-07-15)

Real-estate video music must feel like premium home-tour production —
never like a nightclub or a coffee-shop playlist. Rules:

**Use** — instrumental, tempo 80–100 BPM, Intro→Verse→Outro (no loops),
natural fade-out. Video length 45s / 60s / 90s.

**Do NOT use** — Jazz, Pop, HipHop, Rock, Vocal tracks, EDM drops,
"boom" hits, cinematic swells that hijack attention. Music is the
supporting layer; the home is the star.

## Buckets (5, active)

| Bucket             | Target | Vibe                                                    | Property fit                                       |
| ------------------ | -----: | ------------------------------------------------------- | -------------------------------------------------- |
| `warm-acoustic`    |     10 | Acoustic guitar, ukulele, hand percussion. Cozy, human. | Single Family, Cabin, Farmhouse, family homes.     |
| `modern-corporate` |     15 | Clean piano + light pads, uplifting but restrained.     | Townhome, Condo, New Construction, modern homes.   |
| `luxury-ambient`   |      8 | Sparse piano, soft strings, spacious reverb.            | $2M+, estates, high-end condos.                    |
| `chill-electronic` |      8 | Organic electronic, mellow beats (NOT lo-fi jazz).      | Urban condo, loft, downtown.                       |
| `cinematic`        |      8 | Sweeping strings + piano, no drops.                     | Waterfront, view lots, hero shots.                 |

**Current inventory** (2026-07-15):

- ✅ `warm-acoustic` — 10 / 10 (KML)
- 🟡 `modern-corporate` — 8 / 15 (needs +7)
- ✅ `luxury-ambient` — 8 / 8 (KML)
- ❌ `chill-electronic` — 0 / 8 (KML has no organic-electronic; buy from Pixabay CC0)
- ❌ `cinematic` — 0 / 8 (KML has candidates; curate next phase)

**Live total**: 26 / 49. Enough to ship variety; expansion tracked in
`next-steps.md` under `bgm-lib-expand-round-2`.

## Archive

`scripts/render-worker/bgm/_archive/` holds 24 tracks that were fetched
but violated the SOP or positioning:

- `tropical/` (8) — Latin/samba/beach vibes take over the video (SOP: music must not lead).
- `lofi-jazz/` (8) — Jazz swing (SOP explicitly excludes jazz).
- `cn-fusion/` (8) — Asian-instrumental fusion violates the "all US
  homebuyers, not a Chinese spinoff" positioning (`CLAUDE.md` §1).

Files stay on disk (mp3 is gitignored anyway) for reference. `pick_bgm()`
skips `_archive/**` at runtime.

## Sources

All active tracks are **Kevin MacLeod / incompetech.com**, licensed
**Creative Commons: By Attribution 4.0**. Full track-level attribution
in `manifest.json`. Attribution rendered in the video description
(TODO: `scripts/render-worker/worker.py cf_upload meta`).

Future buys:

- **Pixabay Music** — CC0 for `chill-electronic` gap (no attribution required, but we still credit).
- **Free Music Archive** — CC-BY for `cinematic` gap if KML curation runs thin.
- **Epidemic Sound** — $19/mo. Deferred until first paying agent lands.
