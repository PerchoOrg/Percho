# BGM vibe map — 6 buckets for render-worker

Render-worker picks a BGM track that matches the listing's vibe. Target
library size: **50 tracks** across 6 buckets. All tracks CC-BY / CC0 /
free-commercial (Kevin MacLeod, Bensound free, FMA CC-BY/CC0, YouTube Audio
Library). No commercially-distributed artists. Instrumental only — Bucket E
uses pure-instrumental Asian-fusion (guzheng, bamboo flute), never vocal.

## Buckets

| ID | Slug | Vibe | Typical listing | Target count |
|----|------|------|-----------------|--------------|
| A | `a-warm-acoustic` | breezy ukulele, whistle, HGTV feel-good | starter homes, family SFH, suburbs | 10 |
| B | `b-tropical` | steel drums, marimba, sunny mid-tempo | FL/CA/HI beach houses, pools, sunny yards | 8 |
| C | `c-lofi` | chill jazzy, mellow hip-hop-adjacent, urban | condos, downtown, modern lofts | 8 |
| D | `d-uplift` | corporate-inspiring, bright piano/strings, gentle build | new construction, luxury, hero shots | 8 |
| E | `e-cn-fusion` | **instrumental** East-Asian fusion — guzheng, erhu, shakuhachi, bamboo flute over light pads | zen aesthetic, japandi, tea-room, garden, feng-shui-forward | 8 |
| F | `f-ambient` | soft pads, reflective, slightly cinematic (contrast slot) | historic homes, large estates, dusk exteriors | 8 |

Total target: 50.

## Rules

- **Length ≥ 40s** so a 10–24s tour loops cleanly on the fade-out.
- **No vocals** in any bucket. Bucket E specifically excludes Mandarin/Cantonese
  vocal tracks — pure instrumental only.
- **Attribution** captured per-track in `manifest.json`; aggregate credit
  string rendered at `percho.co/legal`.
- **Not tracked in git** — fetch script pulls to each host; `.mp3` is
  gitignored recursively.

## Selection heuristic (worker.py)

`pick_bgm()` reads listing metadata (property_type, price band, region,
tags) and maps to a bucket, then `random.choice()` within the bucket. If the
chosen bucket dir is empty, fall back to Bucket A. If Bucket A is also
empty, fall back to silent.
