# FMLS → Percho listing seed pipeline

One-shot pipeline that scrapes FMLS (First Multiple Listing Service, Atlanta)
detail pages via Playwright, downloads the listing photos, and imports the
result into `public.listings` + `public.listing_photos`.

**First shipped:** Phase 94 (2026-07) — 250 north-Atlanta listings with real
photos. Checked into the repo 2026-08-04 during the EC2 → Mac mini migration;
before that it only ever existed in `~/fmls-scrape/` on the EC2 box.

> ⚠️ **One-shot seed tool, manual runs only.** FMLS is an anti-scrape source
> behind a logged-in session. Do not wire this into cron or any user-facing
> surface. The photo URLs carry session-bound `ust=` tokens, so photos MUST be
> fetched inside the same Playwright browser context that scraped the page —
> that constraint is the whole reason `scrape_details.py` downloads inline
> instead of handing URLs to a separate downloader.

---

## Order of operations

| # | Script | Reads | Writes |
|---|---|---|---|
| 0 | `ids_h1.js` / `ids_h2.js` | paste into the FMLS search-results page console | prints listing ids → save as `ids.json` |
| 1 | `scrape_details.py` | `ids.json` | `details/{id}.json`, `photos/{id}/{nn}.jpg` |
| 2 | `merge_import.py` | `details/`, `photos_manifest.json` | `fmls_import.json` |
| 3 | `upload_photos.py` | `photos/` | Supabase Storage `listing-photos/fmls-import/{id}/{nn}.jpg` + `photos_manifest.json` |
| 4 | `import_listings.py` | `fmls_import.json` | PostgREST upsert into `listings` (+ replace `listing_photos`) |

Steps 1 and 3-4 are resumable / idempotent. Step 3 must run before step 2's
manifest inputs exist for a fresh scrape — in practice: scrape → upload →
merge → import.

## Working directory

All scripts hardcode `BASE = Path.home() / "fmls-scrape"` and read/write there,
NOT inside the repo. Create it on a fresh host:

```bash
mkdir -p ~/fmls-scrape && cd ~/fmls-scrape
# drop ids.json here, then:
python3 ~/Percho/scripts/fmls-scrape/scrape_details.py
```

Everything they produce (`photos/`, `details/`, `*.json`, `*.log`, saved HTML)
is gitignored — it's regenerable and the photo URLs expire anyway.

## Requirements

`playwright` (+ `playwright install chromium`) and `requests`. Credentials come
from `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) —
`import_listings.py` uses the service-role key and bypasses RLS.
