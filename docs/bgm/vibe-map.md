# BGM Vibe Map

**Last updated**: 2026-07-19

The render worker picks a random background track for every generated
listing video. Tracks live under `scripts/render-worker/bgm/warm-acoustic/`.
`worker.pick_bgm()` picks uniformly at random from that single bucket.

## SOP (from owner)

Real-estate video music must feel like premium home-tour production —
never like a nightclub or a coffee-shop playlist.

**Use** — instrumental, tempo 80–100 BPM, Intro→Verse→Outro (no loops),
natural fade-out. Video length 45s / 60s / 90s.

**Do NOT use** — Jazz, Pop, HipHop, Rock, Vocal tracks, EDM drops,
"boom" hits, cinematic swells that hijack attention. Music is the
supporting layer; the home is the star.

## Active bucket

Only one bucket is production-approved:

| Bucket          | Target | Vibe                                                    | Property fit                                   |
| --------------- | -----: | ------------------------------------------------------- | ---------------------------------------------- |
| `warm-acoustic` |     10 | Acoustic guitar, ukulele, hand percussion. Cozy, human. | All property types — safe universal default.   |

**Current inventory**: 10 / 10 (Kevin MacLeod / incompetech.com).

## Rejected buckets

The following buckets were trialed and pulled from production. They
consistently violated the SOP — the music led the video instead of
supporting it. `worker.pick_bgm()` no longer reads from them.

- `modern-corporate` — clean piano + light pads. Even the "restrained"
  tracks read as ad-music; hijacks attention.
- `luxury-ambient` — sparse piano + soft strings. Ends up feeling
  cinematic / trailer-y on longer pans.
- `chill-electronic` — organic electronic. Any beat, however mellow,
  pulls the eye away from the home.
- `cinematic` — sweeping strings. SOP-explicit "cinematic swells" fail.

Files may stay on disk in `_archive/` for reference; the worker skips
them regardless.

## Sources

Active tracks are **Kevin MacLeod / incompetech.com**, licensed
**Creative Commons: By Attribution 4.0**. Full track-level attribution
in `scripts/render-worker/bgm/manifest.json`.
