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

- **Which tracks / why these buckets** → `docs/bgm/vibe-map.md`
- **License / attribution** → `manifest.json`
- **How to add more** → `fetch.sh` (curl script; mp3 is gitignored)

**Do not commit mp3 files.** The `.gitignore` at the repo root blocks
`*.mp3` and `*.mp4`. Tracks are re-fetched on each host via `fetch.sh`.
