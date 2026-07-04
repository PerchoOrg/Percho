# Render-worker BGM library

10 curated instrumental tracks that the render worker randomly picks from when
generating a listing walkthrough video.

## Source & license

All tracks are by **Kevin MacLeod** (https://incompetech.com), released under
the **Creative Commons Attribution 4.0 International (CC-BY 4.0)** license.

- License text: https://creativecommons.org/licenses/by/4.0/
- Attribution required (satisfied on the vicinities.cc `/legal` page):

  > Music by Kevin MacLeod (incompetech.com) — Licensed under Creative
  > Commons: By Attribution 4.0 License

## Files

Not tracked in git (see repo `.gitignore`). Fetch on each host with:

```
bash scripts/render-worker/bgm/fetch.sh
```

Track list:

| # | Title                     | Mood                      |
|---|---------------------------|---------------------------|
| 01 | Cambodian Odyssey        | warm, ambient             |
| 02 | Ether Vox                | airy, cinematic           |
| 03 | Long Note Two            | slow, meditative          |
| 04 | Tranquility Base         | soft ambient              |
| 05 | Peaceful Desolation      | quiet, reflective         |
| 06 | Meditation Impromptu 01  | gentle piano              |
| 07 | Meditation Impromptu 02  | gentle piano              |
| 08 | Nowhere Land             | dreamy                    |
| 09 | Long Note Three          | slow, meditative          |
| 10 | Long Note Four           | slow, meditative          |

## How the worker uses this

`worker.py` calls `random.choice()` over the `*.mp3` files in this directory
and passes the winning path to `generate.py --bgm`. If the directory is empty
the worker falls back to no music (silent video).
