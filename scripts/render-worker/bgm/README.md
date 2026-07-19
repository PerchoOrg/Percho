# Render-worker BGM

Background music for generated listing videos. `worker.pick_bgm()`
picks one track at random from `warm-acoustic/` — the only
production-approved bucket.

```
bgm/
├── warm-acoustic/       # Cozy, human — all property types (ACTIVE)
├── _archive/            # Retired buckets (modern-corporate, luxury-ambient,
│                          chill-electronic, cinematic) — worker skips
└── manifest.json        # Track-level attribution
```

- **Which tracks / why only warm-acoustic** → `docs/bgm/vibe-map.md`
- **License / attribution** → `manifest.json`
- **How to add more** → `fetch.sh` (curl script; mp3 is gitignored)

**Do not commit mp3 files.** The `.gitignore` at the repo root blocks
`*.mp3` and `*.mp4`. Tracks are re-fetched on each host via `fetch.sh`.
