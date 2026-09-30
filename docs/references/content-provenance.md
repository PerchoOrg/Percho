# Content provenance — what third-party material reaches a user

Written 2026-09-29 (phase305) for the iOS store launch. App Store Connect
asks the account holder to attest that the app has the rights to any
third-party content it shows; FMLS has already found scraped listing data
once (phase304). This is the inventory that attestation rests on.

Method: code read of every ingest path that feeds `/api/mobile/*` or the
mobile screens, with the key claims re-checked at the cited lines.
**Not done**: production counts (how many live communities / films use each
source) — the agent's read-only production query was refused by the harness
permission classifier. The owner can run it or allow it.

Not legal advice. Items marked *counsel* need a lawyer or the rights holder,
not an engineer.

## Inventory

| Source | Where a user sees it | How it got in | Stored | Credit shown | Derivative |
|---|---|---|---|---|---|
| **Nextdoor neighbourhood data** — names, boundaries, resident count, owner %, attributes, interests, description | Community cards (feed), `app/community/[slug].tsx`, Compare. Boundaries are not drawn (phase288 removed them; the Search map draws county outlines) but place listings and map taps in communities server-side | Scraped: `scripts/nextdoor-seed/01_scrape_cities.py`, `02b_scrape_batched.py`, `05_live_import.py` | `communities` (`source='nextdoor'`), ~8.7k rows | Detail page footer only ("…from Nextdoor neighbourhood profiles", `app/community/[slug].tsx:401`); none on the card | "Why people love it" reasons (`lib/feed/community-reasons.ts`) |
| **Nextdoor cover photos** | Community card hero, detail hero, Search, Saved, city cards (`heroUrl`) | Downloaded from Nextdoor: `scripts/nextdoor-seed/06_upload_covers.py` | `community-covers/nextdoor/<slug>.jpg` | None | Video poster frame |
| **Google Places photos** | Community tour films | Places API (New) `/{name}/media`: `apps/web/lib/poi/poi-actions-core.ts:399-421` | Permanently, `listing-photos/poi/<poi_id>/…`; author in `poi_photos.attribution` | None to users — author shown only in admin review | Enhanced, sometimes Gemini-outpainted, cut into Ken Burns / DepthFlow / Seedance clips, assembled into films |
| **`community_site` photos** | Community tour films | Website crawl (`lib/poi/ingest-page-photos.ts` via `tour-steps/ingest.ts`) or folder upload (`scripts/admin/ingest-community-photos.ts`) | `listing-photos/poi/…`, `poi_photos.source='community_site'` | None | Same as above |
| **Bridge (FMLS) listing photos** | Listing cards, listing screen, trade-off card | Bridge API: `scripts/admin/import-bridge-listings.ts` | `listing-photos`; agent/office in `listings.external_*` | **None on mobile** (no "Listing courtesy of" anywhere in `apps/mobile`); web shows it | Ken Burns films; photos reused in trade-off cards away from the listing |
| **Seedance clips / Gemini outpaint** | Community films | AI (OpenRouter, Gemini) from the photos above | `ai-videos`, `photo_clips` | No AI label | They are the derivative |
| **Kevin MacLeod music** (CC BY 4.0) | Film soundtracks | `scripts/render-worker/bgm/fetch.sh`; tracks listed in `bgm/manifest.json` (e.g. Carefree, Wallpaper, Daily Beetle) | `bgm` bucket | **None to users.** `lib/bgm/incompetech.ts:9-10` says attribution "is already handled in the render output" — `worker.py` has no such code; the credit exists only on admin pages | Mixed under narration |
| Other music (Pixabay-style tracks in `manifest.json`, Lyria-generated) | Film soundtracks | Download / Lyria | `bgm` bucket | None | Mixed |
| Zillow ZORI rent index | Listing ROI, Compare | Public CSV, rescaled (`scripts/admin/refresh-rent-index.ts`) | `apps/web/data/rent-by-zip.json` | Name only, "Zillow ZORI" (`RoiBlock.tsx`) | Rescaled values |
| Freddie Mac PMMS, NCES + GOSA schools, county GIS, Georgia tax / EFC / EIA / USGS area data | Cost, schools, boundaries, area pages | Public data | Various | Yes, or public record | No |
| GreatSchools reviews/photos (legacy) | Not read by any app code | Scraped (migration `20260718020000_k12_schools_pipeline.sql`) | `k12_school_reviews`, `k12_school_photos` | n/a | No — but both tables have **anon SELECT policies** (lines 241-248) and the anon key ships in the app, so any rows are publicly readable |

Already gone: every scraped listing (FMLS, Redfin, John Wieland imports) —
purged 2026-09-26, phase304. Community films were not touched by that purge.

## Risk, highest first

1. **Nextdoor is the backbone of the community layer.** The seed tool's own
   README says "Nextdoor's ToS forbids scraping. Do NOT wire this into
   production … or any user-facing surface" (`scripts/nextdoor-seed/README.md:12`,
   §11). It now supplies community covers, stats, reasons and most boundaries
   in the public app. *Counsel + engineering.* Engineering path: identity and
   boundaries from county GIS subdivisions (the `county_gis` source already
   exists), covers from our own footage or an in-app map, Nextdoor-derived
   stats and prose removed from user surfaces.
2. **Google Places photos are stored, altered and edited into films without
   credit.** `docs/pipelines/poi-content.md` itself records "attribution
   mandatory". Google's Maps Platform terms also restrict storing and
   modifying Places content. The community film — the product's lead — is
   built largely from these. *Counsel*, then either our own photography /
   footage or a licensed source.
3. **Scraped builder and agent imagery in shipped films.** Windward's
   amenity set came from "a listing agent's Redfin gallery"
   (`scripts/admin/ingest-community-photos.ts:25`); Toll Brothers imagery was
   logged as "demo/review only" pending their OK (DEVLOG 2026-09-19), and
   the Northbrooke film was re-shipped on 2026-09-23; Bellmoore Park came
   from a builder-site crawl (`scripts/admin/prune-community-site-photos.ts`).
   Needs written permission or removal.
4. **No MLS attribution on mobile.** Required by any IDX licence; must be on
   the card and listing screen before licensed listings go live (also open
   from phase304). The trade-off card's reuse of listing photos away from
   the listing should be checked against the licence terms.
5. **MacLeod CC BY with no credit.** Cheapest fix on the list — a Credits
   row (You tab) and a line in the film description satisfies CC BY's
   "reasonable manner" attribution.
6. **Store copy overclaims.** The description draft says "Every clip is made
   from real photos of that place" (`docs/ios-release.md`); Seedance motion
   and outpainted edges are AI-generated. Reword, and decide whether films
   carry an "AI-assisted" note.
7. **Legacy GreatSchools tables are world-readable if they hold rows.**
   Drop the anon policies (or the data) in a migration — needs a production
   row count first.

## What this means for the launch

Items 1–3 sit under the community film and the community card, which are
the core of the app — they are a bigger launch gate than the FMLS licence,
and none of them is fixed by that licence. Items 4–7 are small and can be
done ahead of submission.
