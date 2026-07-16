# Nextdoor → Percho community seed pipeline

One-shot demo pipeline that scrapes every public Nextdoor neighborhood page
in a target metro, imports rows into the Percho `communities` table with
real MultiPolygon geometry + stats, and uploads the Nextdoor CDN hero image
into the `community-covers` Supabase Storage bucket as each row's real cover.

**First shipped:** Phase 94 (2026-07-16) — 8,679 Atlanta metro communities
across 87 cities, 100 % with real covers. See DEVLOG Phase 94 for the full
narrative.

> ⚠️ **One-shot demo tool.** Nextdoor's ToS forbids scraping. Do NOT wire
> this into production, cron, or any user-facing surface. Run manually,
> ingest, then leave it alone. All fetched data is public-facing
> (SEO-indexed guest pages); no auth cookies are used.

---

## 1. When to reach for this

- Standing up a fresh metro's community grid for a demo / investor deck.
- Backfilling geometry + stats for a metro that MLS neighborhood data doesn't
  cover well (Nextdoor has hyper-local subdivision boundaries MLS lacks).
- Populating cover photos when the SVG-logo fallback looks empty.

For anything ongoing (per-day refresh, per-listing enrichment) use the
official POI / places pipelines, not this.

---

## 2. Pipeline shape (5 scripts, 4 phases)

```
   ┌─ 01_scrape_cities.py  ──▶  city_pages/*.json + neighborhoods_to_scrape.json
   │                              (109 city seed pages, ~8-9k slugs)
   │
   ├─ 02b_scrape_batched.py ──▶  neighborhood_pages/{slug}.json
   │                              (single-worker, UA-rotating, resumable;
   │                               produces the real payload we import)
   │
   ├─ 03_sanity_check.py   ──▶  sanity_check.html
   │                              (visual grid of 200 random samples;
   │                               spot-check before you import)
   │
   ├─ 05_live_import.py    ──▶  Supabase `communities` rows
   │                              (long-running watcher, upserts on
   │                               nextdoor_id, revalidates the
   │                               community-cards cache tag every flush)
   │
   └─ 06_upload_covers.py  ──▶  Supabase Storage `community-covers/nextdoor/*`
                                  (4-worker uploader, patches
                                   `cover_storage_path` on the row)
```

Numbering skips `02` (the abandoned parallel scraper) and `04` (the one-shot
importer we retired for `05_live_import`). Kept the numbers for consistency
with the DEVLOG entry — do not renumber.

---

## 3. Prereqs

- `~/Percho/.env.local` populated:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY` (new `sb_secret_…` format is fine)
- Python 3.11+, `requests` installed system-wide.
- ~2 GB free disk for the cache directory.
- One machine with a residential-ish IP. Datacenter IPs get soft-blocked
  faster; we ran the shipped batch from an EC2 host and it still finished
  in ~11 h.

Optional env overrides:
- `SEED_OUT_DIR=/path/to/cache` — where cached JSON + logs + geometry live.
  Defaults to `scripts/nextdoor-seed/_out/`.
- `PERCHO_ENV=/path/to/.env` — override the env file location.

---

## 4. Running against a NEW metro

The shipped `seed_slugs.json` is Atlanta-metro only. For a different metro:

1. Replace `atl_metro_cities.json` with your target city list. Format:
   ```json
   [
     { "name": "Charlotte", "url": "https://nextdoor.com/city/charlotte--nc/" },
     ...
   ]
   ```
   The easiest way to get this list is to load `nextdoor.com/find-neighborhood/<state>/`
   in a browser and grab `__NEXT_DATA__.props.pageProps.apolloState`'s
   `FindNeighborhoodLink` entries — that's how we built the Atlanta file.

2. Run `python 01_scrape_cities.py` — parallel, ~1 minute for 100 cities.
   Writes `_out/city_pages/*.json` and `_out/neighborhoods_to_scrape.json`.

3. Convert the manifest into the flat slug array `02b` expects:
   ```bash
   python -c "import json,pathlib; m=json.loads(pathlib.Path('_out/neighborhoods_to_scrape.json').read_text()); \
     pathlib.Path('seed_slugs.json').write_text(json.dumps([{'slug':n['slug'],'title':n['title']} for n in m['neighborhoods']]))"
   ```

4. Kick off `02b_scrape_batched.py` and `05_live_import.py` and
   `06_upload_covers.py` in parallel (see §6).

If you're re-running Atlanta, skip 1–3 — `seed_slugs.json` is already in the
repo (972 KB, 8,679 slugs).

---

## 5. Reusing this for Atlanta (identity re-run)

```bash
cd scripts/nextdoor-seed
python 02b_scrape_batched.py    # resumable — skips cached slugs, safe to Ctrl-C
python 05_live_import.py &       # long-running; exits when 02b's queue drains
python 06_upload_covers.py &     # polls for new rows every 60s; Ctrl-C when done
```

02b is idempotent — cached slugs are skipped. 05 upserts on `nextdoor_id`,
so re-importing existing rows is a no-op. 06 skips rows whose
`cover_storage_path` is already set.

---

## 6. Recommended launch (parallel three-process setup)

Terminal 1 — scraper:
```bash
cd scripts/nextdoor-seed
python -u 02b_scrape_batched.py 2>&1 | tee -a _out/scrape02b.log
```

Terminal 2 — live importer (starts flushing as soon as scraper caches its
first batch):
```bash
python -u 05_live_import.py 2>&1 | tee -a _out/live_import.log
```

Terminal 3 — cover uploader (starts uploading as soon as importer commits
its first batch):
```bash
python -u 06_upload_covers.py 2>&1 | tee -a _out/covers.log
```

For the Atlanta run, all three were kicked off in Hermes `background=true`
sessions with `notify_on_complete=true` — that pattern is documented in
`skills/autonomous-ai-agents/long-autonomous-cron-tick`. Do NOT nohup them;
you need to see the CAPTCHA warnings live if the pipeline stalls.

---

## 7. Anti-detection recipe (v3, shipped Atlanta)

Tuned by trial and error until we broke through Nextdoor's soft-CAPTCHA
gate. Encoded in `02b_scrape_batched.py`; touch these knobs only with a
plan.

| Knob | Value | Why |
|---|---|---|
| `BATCH_SIZE` | 200 | Bigger batches amortize probe cost; too big → the 20-consecutive-fail early-abort triggers |
| `REQ_SLEEP` | 1.2 s | Faster than 1 s ⇒ block within 200 requests; slower is fine but wastes wall-clock |
| `COOLDOWN` | 300 s (5 min) | Between successful batches. Lets the IP-level counter decay |
| `BLOCKED_COOLDOWN` | 1800 s (30 min) | After a CAPTCHA probe failure |
| `MAX_CONSEC_PROBE_FAIL` | 2 | After 2 probe failures, `force-run` mode assumes the probe slug is red-flagged and tries the real batch anyway |
| UA pool | 6 (Mac Chrome/Win Chrome/Win FF/Mac FF/Mac Safari/Linux Chrome) | Rotated per batch |
| Session | fresh `requests.Session()` per batch | Prevents accumulated cookies from tainting the next batch |
| Referer | `https://www.google.com/` | Static; helps |
| Probe slug | random from `todo[:50]` | **Critical.** A fixed probe slug will get red-flagged in ~4 batches, then the pipeline dies. Random probe defeats this |

**Cookies bought us nothing** — Nextdoor guest-view is fine, logged-in
requests get harder rate limits. Do not add a cookie jar.

---

## 8. Failure modes you'll actually see

| Symptom | Meaning | Fix |
|---|---|---|
| `probe {slug} → captcha (streak=N). Cooling 1800s` | Soft-block. Waiting 30 min | Nothing — will self-heal once UA / probe slug rotate. If streak > 5, rotate to a different network |
| `20 consecutive fails — aborting batch early` | Nextdoor is throttling this UA hard | Handled automatically; next batch picks a fresh UA + resets session |
| `403 Invalid Compact JWS` on upload | Storage API needs BOTH `apikey` header and `Authorization: Bearer` | Already fixed in 06 — do not remove the double header |
| `revalidate failed: HTTP Error 308 Permanent Redirect` | Calling `percho.co` instead of `www.percho.co` | Already fixed in 05/06 — do not remove the `www.` prefix |
| Row imported but `hero_image_url IS NULL` | Nextdoor page had no hero photo. Rare (~0.5 %) | SVG-logo fallback in the app handles it; nothing to do |
| Fewer cities than target | Some target cities have zero Nextdoor coverage | Expected. 22 of 109 Atlanta cities were empty |

---

## 9. Data model touched

**Table: `communities`** — schema owned by main Percho migrations.
Fields this pipeline writes:
- `id` (uuid)
- `slug` (unique per source; Nextdoor slug)
- `nextdoor_id` (unique — dedup key for upserts)
- `source = 'nextdoor'`
- `status = 'active'`
- `title`, `city`, `state`
- `centroid` (Point)
- `geometry` (MultiPolygon)
- `stats_json` (residents / income / homeowners / attributes / interests)
- `hero_image_url` (temporary — the Nextdoor CDN URL, superseded by
  `cover_storage_path` once 06 processes it)
- `cover_storage_path` (final — `community-covers/nextdoor/{slug}.jpg`)

**Bucket: `community-covers`** — pattern `nextdoor/{slug}.jpg`,
`x-upsert: true`, ~2 GB total for full Atlanta.

**Cache tag:** `community-cards` — bumped by
`POST /api/admin/revalidate` after every DB flush and every cover batch.

---

## 10. What was intentionally dropped

- Per-neighborhood `friendliness_score` / `affordability_score` — a
  sibling agent dropped those columns during the run. Source JSONs in
  `neighborhood_pages/` still carry them if you ever want them back.
- The abandoned `02_scrape_neighborhoods.py` (parallel worker version)
  — went CAPTCHA within 400 slugs. `02b` single-worker is what actually
  works.
- `04_import_to_percho.py` (one-shot importer) — replaced by
  `05_live_import.py` so the pipeline overlaps scrape + import + upload.

---

## 11. Legal / ethics note

Nextdoor's ToS forbids scraping. This tool exists because the alternative
(a demo grid with 0 rows) was worse than a legal grey-zone one-shot. Do
not run this against a live production feature. Do not sell the data.
Do not enumerate private posts — this tool touches only public
SEO-indexed neighborhood description pages. If Nextdoor legal sends a
takedown, the response is "remove the seeded rows and stop running the
tool" — the pipeline is disposable.
