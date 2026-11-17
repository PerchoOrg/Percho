# City film & city card — playbook

**Status**: in use · **Last updated**: 2026-11-16 · **Built on**: Suwanee, GA (phase318–333), Johns Creek, GA (phase344)
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
chapters, in order. **This table is Suwanee's film, not a template** — owner
2026-11-16, on Johns Creek, which followed it line for line and spent 41 of
110 s on history: "刚开始一段历史讲了很多 … 不要千篇一律完全仿照suwanee 有没有什么
特色的 形式也不一定都一样". Start from what only this city has; history is one
line unless history IS the city; the next city takes a different spine and
opening from the one before it. What stays fixed is §3 and the city page.

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

### 2.1 The spine is chosen per city (owner 2026-11-16: "保证基准不乱 并且变化多一些")

**Fixed for every city** — the baseline: the rules in §3; the facts a film must
cover (one credible claim, schools at every level, the commute, what is new); the
city page's structure, which is where cities stay comparable.

**Chosen per city**: the spine, the opening, the hero subject, the form (length,
voice, pacing). Before writing, answer "what does only this city have?" — if the
answer fits the city next door, keep researching. Spines so far:

| Spine | How it runs | Suits |
|---|---|---|
| Claim → proof | one sentence of what the city IS, then evidence in chapter order | a city with one clear thesis (Suwanee) |
| Contradiction | now-first: the surprising gap, "it had X, it had Y…", the gap closed; history one line | a city with a tension (Johns Creek) |
| A route | follow a river, a road or a greenway; facts appear where the route passes them | a city with a strong line through it |
| A Saturday | one day, morning to night; figures only as callouts (direction D, phase324) | a city people use on foot |
| A hero subject | one signature thing takes a third of the film | horse country, a lake, a mill town |
| A calendar | the year's events as the spine; culture first | only with licence-clean event photos |

No two consecutive cities share a spine or an opening. Record each film here:

| City | Spine | Opens on | History | Hero | Length |
|---|---|---|---|---|---|
| Suwanee | Claim → proof | aerial of Town Center + the claim | 2 lines + growth | the downtown it built | ~1:50 |
| Johns Creek | Contradiction | a pond + the #1 ranking | 1 line (~10 s) | golf: Bobby Jones's club, four majors | ~1:30 |

### 2.2 The chapters (owner 2026-11-16/17: "模块化内容 可以让人自主选择 … 每一个章节可以做得独立一些可以单独拉出来看 … 每个city尽量覆盖")

A city film is told in chapters a viewer can jump to — the card's bar is cut by
them, the city page (app and web) has a chip for each — because nobody wants all
of it: one buyer only compares schools across cities. Every line's `chapter` is
one of these; the list is the same for every city.

| `chapter` | Chip | The question it answers | What it always contains | |
|---|---|---|---|---|
| `overview` | Overview | What kind of place is this? | one sentence of identity + one sourced ranking | **required** |
| `schools` | Schools | How are the schools? | the best-ranked elementary, middle and high school, graduation rate against the district; a college if there is one | **required** |
| `homes` | Homes | What does living here cost? | median home value, against the state, the recent trend, share owner-occupied — over streetscapes, never one house | **required** |
| `commute` | Commute | How long to get anywhere? | downtown Atlanta off-peak and at rush, the airport, the nearest job centre, rail and interstate | **required** |
| `daily` | Daily life | Is everyday life easy? | hospital, library, where people shop | when it has the material |
| `outdoor` | Parks | Where do weekends go? | parks, trails, rivers and lakes | when it has the material |
| `downtown` | Downtown | Is there a centre? | what the centre is and when it was built | when it has the material |
| `events` | Events | What happens in a year? | festivals, concerts, public art | when it has the material |
| `signature` | named per city (`film.signature`: "Golf") | What does only this city have? | the one thing | when it has the material |
| `growth` | Growth | Is it growing; where is the work? | population trend, the main job districts | when it has the material |
| `history` | History | Where did it come from? | two or three dates | when it has the material |
| `future` | What's next | What is being built? | projects under way or approved | when it has the material |

Never a chapter: safety ("安全数据先不放"), who lives there, places of worship.

**What makes a chapter watchable alone** (`lib/cities/chapters.ts` refuses a
profile that breaks the first four; `pnpm city:profile <slug> --check`):
- every line belongs to a chapter, and a chapter is ONE unbroken block;
- the four required chapters are there, and the film opens on the overview;
- a `signature` chapter has its name in `film.signature`;
- a chapter's first sentence stands on its own — no "it also had…", no pronoun
  reaching back into the chapter before; the card prints "CITY · <chapter>";
- at least two shots, and its own callouts;
- the four required chapters say the same KIND of thing in every city, so one
  city's Schools can be watched against another's.

The spine (§2.1) still varies: it is how the overview is put, the ORDER of the
chapters, and which one is the hero and runs longer. Length stays under 2:00 —
8–12 s a chapter, schools up to 20 — so a city carries nine or ten of the twelve.
There is no closing line that returns to the overview: the end card closes.

Suwanee and Johns Creek predate the list (no `homes`, a chapter told twice); they
are redone once the owner has judged the first city made this way.

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
   centre, `geo_unit_id` = the feed's `city:<slug>` unit), `status = 'inactive'`
   until the film has been checked.
2. **Research → profile**: write `scripts/admin/city-profiles/<slug>.json`
   (rankings, compare-vs-state, history with short labels, growth series, schools
   by level, getting around with drive minutes, planning, sources). Validate with
   `pnpm city:profile <slug> --check`.
   - census.gov (QuickFacts and the API) and usnews.com refuse scripts from here.
     ACS 5-year figures: MMCG Analytics / Data USA, which name the vintage. School
     ranks: Patch's write-up of each U.S. News list; usnews.com pages via search.
     Drive times: Google Routes (`computeRoutes`, `BEST_GUESS`, a weekday 10:30 and
     7:45 departure) — `PESSIMISTIC` overstates them by a third.
3. **Pipeline photos**: `pnpm tour <slug> --city` (research → resolve → photos).
   Then check every resolved place is IN the city: Johns Creek's research returned
   Suwanee's Town Center Park and Peachtree Corners' Forum. Reject those, single
   businesses and dog parks at the place level (`city_pois.status = 'rejected'`)
   before topping up, so no photos are fetched for them.
4. **More photos** — the pipeline's ~40 are never enough (Suwanee: ~10 usable subjects):
   - `pnpm city:photos <slug> topup` — up to 10 Google photos per place;
   - `pnpm city:photos <slug> place "<name>"` — schools, colleges, new parks, the
     town centre; refused if it resolves >15 km away;
   - `pnpm city:photos <slug> commons-search "<query>"`, then `commons "<label>" "File:…"` —
     public domain / CC0 / CC BY only (share-alike is refused: a film is a derivative work).
   - Then `pnpm tour <slug> --city --steps tag` (the filter runs at the end of tag).
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
- Planning without reading the plan's warnings: a photo with a paid Seedance clip
  plays for a fixed 4 s, so a longer line over it runs late — give that line a
  second photo. The CLI now prints the warnings.
- A single Ken Burns shot of 9–10 s (one line, one photo): give a long line two
  photos so the cut stays at 3–5 s.
- Writing a line before knowing a photo exists for it: Medley (Johns Creek's new
  district) had only a restaurant front with people in it, so it is on the page,
  not in the film. Look at the contact sheet first, then write.
