# Render-worker BGM

Background music for generated listing videos. `worker.pick_bgm()`
picks one track at random from any non-archive bucket below.

```
bgm/
├── warm-acoustic/       # Cozy, human — family homes
├── modern-corporate/    # Clean piano, uplifting — modern homes
├── luxury-ambient/      # Sparse, spacious — high-end
├── chill-electronic/    # Organic electronic — urban condo   (empty, TODO)
├── cinematic/           # Sweeping strings — waterfront      (empty, TODO)
└── _archive/            # Excluded at runtime (see _archive/README.md)
```

<<<<<<< Updated upstream
Track list:

| # | Title | Vibe |
|---|-------|------|
| 01 | Carefree | breezy ukulele, HGTV |
| 02 | Cheery Monday | bouncy piano, morning-vibe |
| 03 | Wallpaper | bright acoustic, whistle |
| 04 | Life of Riley | classic upbeat corporate-chill |
| 05 | Cool Vibes | jazzy, laid-back cool |
| 06 | Bright Wish | soft, hopeful, clean |
| 07 | Amazing Plan | playful, mid-tempo, positive |
| 08 | Wholesome | warm strings, feel-good |
| 09 | Daily Beetle | acoustic, folky, cheerful |
| 10 | Perspectives | mellow, slightly reflective (contrast slot) |

All ≥ 40s so any typical 10–24s home tour can loop cleanly on the fade-out.

## How the worker uses this

`worker.py` calls `random.choice()` over the `*.mp3` files in this directory
and passes the winning path to `generate.py --bgm`. If the directory is empty
the worker falls back to no music (silent video).
=======
- **Which tracks / why these buckets** → `docs/bgm/vibe-map.md`
- **License / attribution** → `manifest.json`
- **How to add more** → `fetch.sh` (curl script; mp3 is gitignored)

**Do not commit mp3 files.** The `.gitignore` at the repo root blocks
`*.mp3` and `*.mp4`. Tracks are re-fetched on each host via `fetch.sh`.
>>>>>>> Stashed changes
