# mock-listings/ — E1 output

**Purpose**: 3 mock GA for-sale listings with 5 photos each (15 total), simulating
what MLS photo pipeline will consume in E2. **NOT real listings.** Photos are
free-use Unsplash imagery flagged `mock:true` in `listings.json`. Do not ship
these anywhere agent-facing.

## Contents

- `listings.json` — canonical metadata (address, price, beds/baths, agent, photo roles)
- `fetch_mock.py` — reproducible fetcher (uses `/usr/bin/python3`, stdlib only)
- `listing-001-alpharetta/` — 4bd/3.5ba, $875k, Preston Ridge / Fulton
- `listing-002-decatur/` — 3bd/2ba, $645k, Oakhurst / CSD (1948 bungalow)
- `listing-003-peachtree-corners/` — 5bd/4ba, $1.12M, Forum area / Gwinnett

Each subdir: `01-exterior.jpg 02-kitchen.jpg 03-living.jpg 04-bedroom.jpg 05-backyard.jpg`.
All 1080px wide (portrait ranges 608–1620 tall). Total ~2.6 MB, git-ignored via
`poc-output/` .gitignore rule (photos are binary, not source of truth).

## GA-only / selling-only alignment (memory)

- All 3 listings `state=GA`, `intent=for-sale`. No rentals, no out-of-state.
- Cities span 3 GA metros already in pipeline scope: Alpharetta (Fulton),
  Decatur (DeKalb, already has a POC reel), Peachtree Corners (Gwinnett,
  already has the flagship reel).
- Photo `role` enum (`exterior_front | kitchen | living_room | primary_bedroom
  | backyard`) matches what a listing-focused reel needs — hook (exterior),
  interior vibe (kitchen/living/bedroom), outdoor/CTA (backyard).

## For E2 (next tick)

- Combine each listing's 5 photos with PTC B-roll (`../peachtree/assets/*`)
  and compose 1 listing-focused 60s reel.
- Suggested slot mapping (per `video-composition.md` §复盘 C6 improvements):
  - hook (0–4s): listing exterior_front (Ken Burns push-in)
  - context (4–12s): 2× neighborhood B-roll (aerial/streetscape)
  - listing tour (12–48s): kitchen → living → bedroom → backyard
  - CTA (48–60s): logo card + address text overlay
- Duration: 60s @ 1080×1920 @ 30fps, h264+aac, matches PTC/Decatur output spec.

## Reproducibility

```bash
cd ~/Percho/docs/pipelines/poc-output/mock-listings
/usr/bin/python3 fetch_mock.py   # idempotent; skips existing files
```

## Known limits (not blockers, log for E3/E4)

1. Unsplash photos have inconsistent aspect ratios (720–1620 tall) — E2 composer
   must letterbox/crop to 1920 height. Real MLS photos are typically 3:2 or 4:3
   landscape; our composer already handles this for B-roll.
2. No floor plan / drone / video walkthroughs — real MLS packages often include
   these. Note in `agent-upload-flow.md` (E4) as future asset kinds.
3. Photos are stock, not the actual address — do not overlay real MLS numbers
   on final reel or run any facial/text OCR against them.
