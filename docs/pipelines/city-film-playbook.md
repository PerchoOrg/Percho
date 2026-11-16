# City film & city card — playbook

**Status**: in use · **Last updated**: 2026-11-15 · **Built on**: Suwanee, GA (phase318–333)
**Read this before making the next city** (Johns Creek → Alpharetta → Milton → Cumming → Sugar Hill/Buford).

Suwanee took fifteen phases, two rejected finished films and a dozen assemblies.
Everything below is what the owner's feedback settled, so the next city should
take one pass. The DEVLOG entries from 2026-11-14 to 2026-11-15 carry the full
history; this is the distilled version.

---

## 1. What a city card is

The card hierarchy is country → state → city → community → home. A city
answers **"what is this place as a whole"** — not "what is near this house".

- **The film** gives the feeling and three or four facts. ~1:30–1:50, never over 2:00.
- **The city page** carries the fundamentals, as charts a reader can stop on.
- **Never** a reel of places (v1, "看完我对这个城市没有基本的了解"), and never
  figures as slides (v2, "像ppt").

## 2. The film's shape — "one claim, then the proof"

Open on one sentence that says what the city IS ("Most suburbs just spread.
Suwanee built itself a downtown."). Every line after it is evidence. Suwanee's
chapters, in order — reuse the order, not the words:

| Chapter (`chapter`) | What the line does | Typical figure |
|---|---|---|
| overview | the claim; one ranking that makes it credible | #1 in Georgia for families |
| history | where it came from, in one or two lines | founding year over an old map |
| growth | how fast it grew | population counter, 1990 → 2020 |
| downtown | what it chose to build; where people gather; public art | the year it was built |
| schools | **every level**: elementary, middle, high, plus any college | each school's state rank |
| outdoor | trails, lakes, parks | — |
| commute | the drive to the big city | minutes, off-peak and rush |
| future | what is being built now | the year it opened |
| overview | one closing sentence | — |

14 lines, ~200 words, ~25 shots, cuts every 3–5 s.

## 3. Rules the owner set (each one cost a round)

**Pictures**
- **Every spoken line has its own photograph of what it says.** No "related"
  stand-ins (the 70/30 allowance was withdrawn). If no photo exists, source one or
  rewrite the line.
- **One subject, once.** City Hall appeared four times in v1 and three times in v3.
  A subject filed under two POIs (City Hall / Town Center Park) is still one subject.
- **No people at home or as a family**, no children as the subject. Look at every
  frame — the tagger's description ("a sensory path") missed a parent and two kids.
- No storefronts or single businesses, no food or object close-ups, no animals.
- Nothing about safety or crime; no places of worship; culture shows through
  events, places, public art — never through who lives there.

**Words on screen**
- A figure is a **callout over the shot it belongs to** (`stat`, or `count` for a
  trend), one at a time, with its source in small type.
- **Place names are drawn by the card**, top-left, not burned into the film — and
  only for a real named place. No pill on maps, streets, skylines, art, or the
  opening aerial (the card already shows the city's name).
- Figures sit in the band the card leaves free: **55–69 % of the frame height**.
  The card draws its pill and controls over the top 8 % and its name, link and
  progress bar from ~84 % down.

**Facts**
- Every figure has a named source and year; rankings only where a publisher
  made one. Read the primary report (e.g. Patch's write-up of each U.S. News
  list), not directory summaries — they disagree.
- Say where a ZIP crosses a county line. Suwanee's 30024 spans Gwinnett and
  Forsyth: "Around Suwanee" in the film, and the page names which schools are
  Forsyth County.

## 4. Steps for the next city

1. **Row**: insert into `cities` (slug, name, state, county, lat/lng of the town
   centre, `geo_unit_id` = the feed's `city:<slug>` unit).
2. **Research → profile**: write `scripts/admin/city-profiles/<slug>.json`
   (rankings, compare-vs-state, history with short labels, growth series, schools
   by level, getting around with drive minutes, planning, sources). Validate with
   `pnpm city:profile <slug> --check`.
3. **Pipeline photos**: `pnpm tour <slug> --city` (research → resolve → photos).
4. **More photos** — the pipeline's ~40 are never enough (Suwanee: ~10 usable subjects):
   - `pnpm city:photos <slug> topup` — up to 10 Google photos per place;
   - `pnpm city:photos <slug> place "<name>"` — schools, colleges, new parks, the
     town centre; refused if it resolves >15 km away;
   - `pnpm city:photos <slug> commons-search "<query>"`, then `commons "<label>" "File:…"` —
     public domain / CC0 / CC BY only (share-alike is refused: a film is a derivative work).
   - Then `pnpm tour <slug> --city --steps tag,filter`.
   - **Verdicts are the city's own** (phase343): filter, plan and the review page
     at `/admin/pipeline/city-tours/<id>` read and write `city_poi_photos`, never
     the shared `poi_photos.status`. What communities and other cities decided is
     shown under each row as a reference, not applied. The ⚖ button rejects a
     photo EVERYWHERE and is for legal reasons only (licence, likeness, fair
     housing); any other "no" is the X, for this city.
5. **Pick photos by eye** from a contact sheet; write `film.lines` naming photo ids,
   `label` only for real places, `chapter` per line, callouts per §3.
6. **Storyboard first** for any new shape of film (a playable HTML page on
   percho.co/demos). Suwanee's two rejected films were made without one.
7. `pnpm city:profile <slug>`, then `pnpm tour <slug> --city --steps plan,generate,assemble`.
   The plan step refuses a line whose photo the city does not hold or has rejected,
   and stamps the film's photos `approved` for the city (any other approval goes
   back to pending) — so the review page's Approved section IS the film.
8. **Check the cut** frame by frame against the card's chrome zones before telling
   the owner; check the feed and `/api/mobile/city/<slug>` serve it.

## 5. Costs and limits

- Suwanee's film used **no new paid AI motion** (Seedance): only the free engines
  plus five Seedance clips bought earlier for communities. Ask before paying.
- Google Places photos and searches: a couple of dollars at list price for a city.
- Narration TTS: each Gemini TTS model allows **100 requests a day**; one line is
  one request. The worker falls back through three models (≈300 lines/day) and
  voices a whole film on one model. Never voice storyboards.
- A city film assembly takes ~4 minutes; clips render on the Mac mini workers.

## 6. Mistakes not to repeat

- Telling the owner a cut is ready without looking at its frames.
- Assuming one successful TTS request means the daily quota has reset — wait for two.
- Reading a page's data through Next's fetch cache (`createAnonClient`): an edited
  profile 404'd because the cached copy no longer fit the schema. Use the uncached clients.
- Before redoing work on feedback, check WHICH version the owner saw (the app's
  `mobile_events` timestamps) — one round of feedback was about a build he
  reviewed before the fix went live.
- Running `biome --write` on a whole folder: it reformats unrelated files.
