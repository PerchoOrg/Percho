# Render-worker BGM library

10 curated instrumental tracks that the render worker randomly picks from when
generating a listing walkthrough video. Vibe: **light, upbeat, HGTV /
lifestyle-vlog** — not moody/cinematic ambient. First iteration used ambient
tracks and the owner said they felt too serious for house tours.

## Source & license

All tracks are by **Kevin MacLeod** (https://incompetech.com), released under
the **Creative Commons Attribution 4.0 International (CC-BY 4.0)** license.

- License text: https://creativecommons.org/licenses/by/4.0/
- Attribution required (to be added to `percho.co/legal`):

  > Music by Kevin MacLeod (incompetech.com) — Licensed under Creative
  > Commons: By Attribution 4.0 License

## Files

Not tracked in git (see repo `.gitignore`). Fetch on each host with:

```
bash scripts/render-worker/bgm/fetch.sh
```

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
