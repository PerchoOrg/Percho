# Percho Discovery Feed v3 — Prototype

Client-only. HTML + CSS + JS + localStorage. Throwaway.

## Files
- `feed.html` — swipe feed, 6 card types (Preference / Listing / Community / Trade-off / Challenge / Insight)
- `listing.html` — Listing Explore (guided tour → transition → free explore w/ hotspot sheet)
- `_data.js` — mocked pools + state helpers

## Serve
```
cd /tmp/percho-mechanics/discovery-v3
python3 -m http.server 8788
```

## Tunnel
```
cloudflared tunnel --url http://localhost:8788
```

## Entry
`<tunnel-url>/feed.html`  (state persists in localStorage; reset button at end of feed)

## 30-Second Rule (vision-v3 §8) — per feature
- Preference card → #1 learn buyer
- Listing card WHY → #4 trust AI understands · Explore → #3 confidence
- Community card WHY → #4 · anchor at subdivision teaches (#2)
- Trade-off card → #1 (highest signal density)
- Challenge card → #1 + #2 (market ed)
- Insight card → #4 (only fires with real evidence)
- Guided tour stop → #4 · Free Explore hotspot Save → #1
