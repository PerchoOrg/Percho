# Percho — Development Log

> The product was renamed from **Vicinity** to **Percho** on **2026-07-11**.
> Historical entries below preserve the original name in-place — the DEVLOG is
> a record of what was worked on under the product's name at the time.


## Archive

Older entries are split by month so this file stays readable in one
sitting (it had grown to 1.0 MB / 14k lines, which no agent could load).
Same reverse-chronological format, same content.

The current month's entries were condensed once, in phase184, when this file
had reached 861 KB. New entries are written at normal length; compress at
rotation, not on the way in.

- [`docs/devlog/2026-08.md`](docs/devlog/2026-08.md) — 208 entries
- [`docs/devlog/2026-07.md`](docs/devlog/2026-07.md) — 168 entries
- [`docs/devlog/2026-06.md`](docs/devlog/2026-06.md) — 54 entries

---

## 2026-09-08 19:00 UTC — phase221: "no source exists" was wrong; the source exists and still cannot answer

**Objective**: the last data item that was not the owner's to decide was
trash, blocked by a claim of mine: *"Trash: no source exists. 159 separate
county/city arrangements; GA EPD regulates disposal facilities only."*
Asserted in phase200, never tested. Same treatment as phase219 and phase220.

**It is wrong in its first three words.** The Census Bureau's Annual Survey of
State and Local Government Finances publishes an Individual Unit File — one
row per government per item code — and **A81 is "Charges — Solid Waste
Management"**. 125 Georgia governments report it for 2024, most metro counties
among them. Real, current, machine-readable.

### Why it still cannot answer

A81 is total charge revenue and is **not decomposed by customer class**, so
landfill tipping fees from commercial haulers sit in the same number as
household billing. Per resident:

```
Jackson  $135.95   Newton $124.22   DeKalb $120.29
Bartow    $75.23   Hall    $56.30   Gwinnett $53.17
  ...
Cobb       $1.30   Henry    $0.53
Fulton, Spalding, Barrow, Dawson, Pickens, Pike + 5 more: nothing
```

**The distribution is continuous, not bimodal** — $136 down to $0.53 with no
gap. Forsyth ($14.28), Paulding ($13.84) and Clayton ($9.98) sit in the middle
with no principled place for a knife. Manufacturing a binary out of a
continuum is the exact bug phase218 and phase219 were each spent removing, and
I nearly shipped a third one.

**The top of the range is not a household bill either.** DeKalb's $120/resident
is ≈$26/month per household, matching its published sanitation fee. Jackson's
$136 is HIGHER and Jackson is rural — commercial tipping, not collection.

**And the tempting inference is false.** "County reports no A81, so residents
arrange collection privately" breaks on Fulton, whose county government charges
nothing while **nine city governments inside it do**. The county reporting
nothing says nothing about the household.

**Actions**: `scripts/admin/audit-trash-sources.ts` — read-only, writes
nothing, reproduces all of the above from the live Census file so the negative
is checkable rather than a claim in a log. It reuses the dependency-free
`readZip` from phase213.

**Verified**: typecheck clean, lint clean, 649 mobile + 1093 web tests. No
user-visible change, so no RELEASE entry.

**Learnings**: three ticks in a row I have checked my own recorded claim
instead of accepting it, and all three were wrong — "optional, lower value"
(phase219), "wrong shape, e.g. Pickens" (phase220), and now "no source
exists". This one still ends in not shipping a number, which is the right
outcome: the difference is that trash is now an estimate **for a stated and
reproducible reason** rather than because I once said so.

**Noted, not changed**: `seed-area-metrics.ts` hand-writes
`trashArrangement: 'private hauler'` for every county including DeKalb, which
bills $88.4M of sanitation charges. Inert today — `supplierOf` projects nothing
from an estimated row — but it is a wrong guess sitting in the data.

**Next steps**: the next thing worth trying for trash is per-city rate
schedules, which is the same shape of problem as the water rate sheets and
carries the same cost. Not started.

## 2026-09-08 18:15 UTC — phase220.1: the type said the key existed and both runtime guards disagreed

**Objective**: phase220 wrote 29 correct `public_water_pct` rows and the API
never returned one. Caught by polling production rather than assuming the
write was the end of the job.

**Cause**: `MetricKey` was one of **three** hand-maintained lists of the same
thing — the union in shared, `KNOWN_METRICS` in `apps/web/lib/areas/areas.ts`,
and another `KNOWN_METRICS` in `apps/mobile/lib/areas/areas-dto.ts`. I added
the key to the union. Both allowlists dropped every row, silently, and
`pnpm typecheck` was perfectly happy because the type was right.

**The allowlists are not the bug and they stay.** An unknown key is a row some
newer writer produced, and skipping it beats trusting it. What was wrong is
that they were *copies*. They now derive from `METRIC_KEYS` in shared, with
`MetricKey` derived from the same array — so the type and the guard cannot
disagree. A shipped mobile binary still carries the list it was BUILT with,
which is the version skew the guard exists for; only the hand-copy is gone.

**Test**: iterating `METRIC_KEYS` and asserting each survives `groupMetrics`.
Verified by pasting the old literal allowlist back — it fails with
`public_water_pct is dropped by KNOWN_METRICS`, the exact bug, then passes
when restored.

I also mis-verified this once before getting it right: my first check deleted
a key from `METRIC_KEYS`, which the test iterates, so removing it just meant
it stopped being tested. **A test that walks the list cannot detect the list
shrinking** — the mutation that proves it is reintroducing the copy, not
shortening the source.

**Verified**: typecheck clean, lint clean, 649 mobile + **1093 web tests**
(+2). Production re-checked after the fix ships.

**Learnings**: phase219.1 was the same shape one layer down — a producer
changed and its consumer did not. Here a type changed and two runtime guards
did not. Both were caught by looking at the live API rather than at the write
succeeding, which is now twice in one session that "the script said it wrote
29 rows" was not evidence of anything a user would see.

## 2026-09-08 17:45 UTC — phase220: the well/septic objection was right, and every example was wrong

**Objective**: one of the three items flagged as needing the owner's decision
was water, and one of the two inputs to that decision was **a factual claim I
never measured**. Handing him a decision with a measured input beats handing
him one with my guess.

The claim, from the notes: *"in the outer counties a large share of homes are
on WELL AND SEPTIC and pay nothing. A county-level water figure for **Pickens
or Dawson** is the wrong SHAPE, not just imprecise."*

**Measured, it is right in substance and wrong in every example:**

```
Pickens   84% on public water   ← the county I named as the problem
Dawson    71%                   ← the other one
Pike      20%   Lamar 43%   Morgan 43%   Meriwether 51%   ← never mentioned
Fulton / DeKalb / Gwinnett  100%          Clayton 99%
```

A county water bill is exactly the right shape where most buyers look, and the
wrong shape in about five counties at the edge. That is a far narrower problem
than "water is the wrong shape", and a note on the line can carry it — it does
not need the owner's ruling at all.

### The source, and the one that failed

**USGS** "Estimated Use of Water in the United States, County-Level Data for
2015". `PS-TOPop` and `DO-SSPop` are the two halves of the question, published
per county, already reconciled against `TP-TotPop`.

**SDWIS was tried first and abandoned**, which is worth recording because it
looked ideal. EPA publishes every system's `population_served_count` — but
`county_served` is NULL for exactly the largest systems (Cobb County, DeKalb
County, Clayton County Water Authority, North Fulton), **828** Georgia
community systems have no county at all, and Atlanta is filed against
"DeKalb,Fulton" with no split. Summing what remained put **Dawson above its own
population**, which is what stopped me trusting it.

### A wording bug I wrote and caught in the same tick

My own summary line read *"21 counties are below 90% on public water, **where a
flat county water bill describes a minority**"*. At Cobb's 88% it describes
seven eighths. Same overclaim I have spent the day removing from other people's
sentences, in a sentence I had just typed.

`wellShareNote` states a **ratio of households** instead, which is true at
every level: *"about 80% of homes here have a well and no water bill"* for
Pike, *"about 1 in 8"* for Cobb, and nothing above 95%.

**Verified**: typecheck clean, lint clean, 649 mobile + **1091 web tests** (+5,
one of which asserts the note never claims "minority" for a county where the
bill covers most people).

**Next steps**: apply from the reference worktree. Water's own figure is still
an estimate — this says who the estimate is *for*, not what it costs.

## 2026-09-08 17:00 UTC — phase219.2: "averaged across N" is a share test, not a count

**Objective**: rebuild both demos against the new electricity data. Reading
the output caught a wording bug I had just shipped.

**Issue**: Hall rendered as *"averaged across 4 utilities · 15.4¢ per kWh ·
largest is GEORGIA POWER CO at 98%"*. True and misleading — Georgia Power
covers 98% of Hall, and the county average (15.42¢) and Georgia Power's own
rate (15.49¢) agree to within a tenth of a cent. `count > 1` was the wrong
gate; **how many utilities exist is not how mixed a county is.**

**Resolution**: the branch now turns on the largest supplier's share against
the same 95% the plain branch already used to decide a share is not worth
mentioning, now named `EFFECTIVELY_ALL`.

```
cobb      averaged across 4 utilities · 13.1¢ per kWh · largest is COBB EMC at 41%
fulton    averaged across 6 utilities · 14.0¢ per kWh · largest is GEORGIA POWER CO at 55%
hall      GEORGIA POWER CO · 15.4¢ per kWh
pickens   AMICALOLA ELECTRIC MEMBER CORP · 12.4¢ per kWh
```

**Actions**: both demos regenerated. The lens demo now reports **electricity
0 estimated across 29 counties**, down from 2.

**Verified**: typecheck clean, lint clean, 649 mobile + **1086 web tests**
(+2). Deploy confirmed live before rebuilding, by polling the API until the
supplier field appeared rather than assuming it had.

**Learnings**: three ticks in a row now, the bug was in the sentence beside a
correct number, and this one I caught only because regenerating the demo made
me read the copy for a county I had not thought about. Cobb and Fulton, the
counties I designed the wording around, both read fine.

## 2026-09-08 16:35 UTC — phase219.1: the importer changed shape and the reader did not

**Objective**: verifying phase219 on production, the figures were right —
Cobb $141, Fulton $150, 29 of 29 sourced — and **the supplier note was gone
from all 29 counties**.

**Cause**: phase219 changed the electric importer's `detail` from `provider`
(one name) to `providers` (a list), because the figure is now an average.
`supplierOf` in `areas.ts` still read `provider`, found nothing, and returned
no supplier. Every figure still looked fine; only the line explaining where it
came from disappeared.

The irony is on the record: that function's own comment says *"an importer
adding a field cannot change what the app receives."* True. An importer
**removing** one can, and I removed it in the same phase that built the
producer.

**Resolution**: `supplierOf` reads both shapes. Not a migration — a scraper
rerun replaces the rows anyway, and a half-migrated table drops the note for
whatever it missed, silently, which is the failure that just happened.

### The note had to change, not just come back

Restoring the old wording would have printed *"Cobb EMC · 13.1¢ per kWh"*.
Cobb EMC covers 41% of Cobb and **does not charge 13.1¢** — that is the
county's mean. The old phrasing was correct only while the figure was one
company's rate.

`MetricSupplier` gains `count`, and the note now reads:

```
averaged across 4 utilities · 13.1¢ per kWh · largest is Cobb EMC at 41%
```

A single-utility county is unchanged: `Georgia Power Co · 15.5¢ per kWh`.
`count: 1` is deliberately dropped rather than passed through, so a
one-utility county cannot fall into the "averaged" phrasing.

**Verified**: typecheck clean, lint clean, 649 mobile + **1084 web tests**
(+6, covering both detail shapes and all three note forms).

**Learnings**: I verified phase219 by checking the numbers, which were right,
and nearly stopped there. What was broken was the sentence next to them.
Changing a producer's output shape is a change to every consumer of it, and
the consumer here was one file away in the same repo.

## 2026-09-08 16:10 UTC — phase219: the electricity gap was a threshold, not a missing source

**Objective**: two counties still carried an unsourced electricity estimate.
The notes filed this as "optional, lower value". The two are **Cobb and
Henry** — core metro, among the first counties any Atlanta buyer opens — so
that triage was wrong.

### Not a scraping gap

Both counties had complete data. They were withheld by `MIN_SHARE = 0.5` on
the LARGEST provider's territory share:

```
Cobb  (COBB EMC 41%, GEORGIA POWER 38%)
Henry (SNAPPING SHOALS 47%, CENTRAL GEORGIA EMC 27%)
```

**That threshold asks the wrong question.** "Does one utility own half the
county" is a fact about concentration, not about how well we know the price.
It published **Fulton at 55% as sourced** while leaving **Henry at 47% an
unsourced guess** — an 8-point difference flipping the strongest provenance
claim the app makes. And the Fulton figure ignored 45% of the county anyway.
Same shape as phase218: a threshold turning a continuous quantity into a
binary claim.

### Averaging instead

`blend()` in `territory.ts` area-weights every rate covering the county and
renormalises over the parts that have one, so a utility that files no rate
dilutes `covered` rather than dragging the mean toward zero.

Two properties worth stating. It **degrades to the old answer where the old
answer was good** — Hall (98%), Jackson (97%), Pickens (100%) and Walton (94%)
are unchanged to the dollar, which is the test that this is not a silent
rewrite of 27 working counties. And it **corrects a systematic bias** where
they were mixed:

```
Fulton    $166 → $150   (55% Georgia Power; 45% buys cheaper)
Spalding  $166 → $153
Gwinnett  $166 → $159
Forsyth   $124 → $135
Cobb       est → $141
Henry      est → $141
```

Fulton is the one that matters. It was published **as sourced** at Georgia
Power's rate applied to the whole county, overstating the bill by $16/mo while
wearing a provenance badge. Filling the two holes was the smaller half of this.

The retained gate is `MIN_COVERED` — how much of the county we have any real
rate for — which does bear on confidence. Nothing hits it today.

**Actions**: `blend()` + 7 tests; importer switched off `dominant`; `detail`
now carries every provider, its share and its rate rather than one name.

**Verified**: typecheck clean, lint clean, 649 mobile + **1078 web tests**
(+7). Dry-run inspected before applying.

**Learnings**: "optional, lower value" was my own triage, written when the
gap looked like two missing scrapes. The counties were named in the notes the
whole time — reading which two they were is what re-ranked it. A gap's value
is in which rows it hits, not how many.

**Next steps**: apply to production from the reference worktree, then
regenerate both demos against the new figures.

## 2026-09-08 15:35 UTC — phase218: a figure that consulted nothing was marked sourced

**Objective**: phase217 ended claiming "no screen writes this copy itself any
more." That was wrong within one file of where I stopped looking, and chasing
it found a real bug underneath.

### The vacuous truth

`estimatedFromReads` — the shared helper phases 201/203/207 converged on, whose
whole point is that provenance should follow **what a computation READ** — was:

```ts
return area.metrics.some((m) => m.estimated && read.has(m.metric));
```

"No metric it read was an estimate" is **vacuously true of a computation that
read no metrics at all.** A hard-coded constant therefore came out the far side
marked *sourced* — the strongest provenance claim the app can make, earned by
consulting nothing.

The figure this hit is **insurance**: a flat 0.35% of price, identical in every
county. The compare table printed it unmarked while `costBreakdown` two taps
away marked the identical number as an assumption. Same constant, two screens,
opposite provenance.

### The test that locked the bug in

`compare-areas.test.ts` **asserted the wrong behaviour**, and its comment was
the bug's own reasoning:

> "Insurance is one flat assumption; it reads nothing, so nothing it read can
> be an estimate. **The demo labels it separately.**"

That last sentence is the tell. The compensating control was a sentence
hand-written on a different surface — which is exactly what let the two
disagree. Flipped, with the history kept in the comment.

**Actions**: `read.size === 0` → estimated, with the reasoning written down.
Both the flipped mobile test and a new shared-level pair were **verified to
fail with the guard reverted and pass with it restored**.

### The fourth and fifth surfaces

Both demo pages hand-wrote a "where the numbers come from" table, and both had
drifted **the same way at the same time**: each credited electricity to
NREL/OpenEI for several phases after it moved to EIA-861. The compare page also
hand-wrote `* still our estimate` — a footnote naming nothing, which is why it
survived three rewordings of the app's sentence without ever looking wrong.

`sourceSummary` + `PROVENANCE_ROWS` now live in `@percho/shared` and both pages
render from the live payload. One entry per (row, distinct source), **not** per
row: electricity is EIA-861 in 27 counties and a Percho estimate in 2, and a
majority-source summary would hide exactly the counties a reader should be
careful about. The hand-written prose had flattened that to "sourced".

**Verified**: typecheck clean, lint clean, **649 mobile + 1071 web tests**
(+5). Both demos regenerated; production endpoints all 200.

**Learnings**: the centralised helper from three earlier phases had a hole
exactly where a constant sits, because "ask what it read" was never asked of
something that reads nothing. And the insight already EXISTED in the codebase —
`costBreakdown` has carried the comment *"a flat share of price, identical in
every county — an assumption by construction, never a measurement"* the whole
time. It was written as a local comment on one line instead of as a property of
the helper, so it protected one screen and no others.

**Next steps**: unchanged and still the owner's — the tax-district bucket
ruling and the water decision.

## 2026-09-08 15:05 UTC — phase217: the third and fourth surfaces carrying the same sentence

**Objective**: phase216 closed with "fixing an honesty bug on one surface does
not fix the others, and copy is where it hides." That is not a reflection, it
is an instruction — so this tick went looking at every remaining surface that
renders an area figure.

**Two more, both stale.**

`app/compare-areas.tsx` carried the sentence verbatim: *"estimated: we have not
sourced that county's figure yet"*, under a table whose Property tax row comes
from the GA DOR and whose Schools row comes from GOSA. **Third surface, same
claim.** It survived phase203 and phase216 because each of those looked only at
the screen in front of it.

`app/(tabs)/saved.tsx` had the opposite failure: a saved area row reads
"Cherokee County · $691/mo on a $500k home" with **no mark at all**. It was the
only place in the app a true-cost figure appeared unqualified, so the same
number read as more settled on the Saved tab than on the map two taps away.

**Actions**:
- `estimateNoteForRows` in shared, alongside `estimateNoteFor`. It takes ROWS
  rather than metrics, because a compare row is a computed line
  ("Property tax / year") and its label is what the reader is looking at — and
  it strips the unit half, since "property tax / year is still our estimate"
  reads as a fraction.
- The saved row now carries the asterisk, plus one line under the list saying
  what the asterisk means. **A bare mark with no legend is worse than no mark**;
  it signals doubt without saying about what.

Live wording, from production:

```
True cost / month          $730*  $833*  $894*
Schools                    67%    54%    31%
Property tax / year        $4,416 $4,932 $5,520
Utilities & trash / month  $216*  $276*  $288*
Insurance / month          $146   $146   $146

* true cost and utilities & trash are still our estimate.
  Every other row comes from a public record.
```

**Verified**: `pnpm typecheck` clean, lint clean, **649 mobile + 1066 web
tests pass** (+5).

**Learnings**: the same sentence appeared on four surfaces and was fixed on
them one at a time across fourteen phases, because each fix was prompted by
looking at one screen. What finally caught the last two was treating the
previous phase's closing sentence as a search query rather than a moral. There
are now two shared functions producing this copy and no screen writes its own.

## 2026-09-08 14:45 UTC — phase216: the ranking footnote was calling our own sourced work a guess

**Objective**: phase203 replaced the county detail sheet's blanket "we have not
sourced this county yet" with a per-line flag, because that banner was showing
over property tax and school figures that come from the GA DOR and GOSA. **The
ranking list above it kept the old sentence**, verbatim, and nobody noticed for
thirteen phases.

It was worst exactly where it mattered most. True cost is marked estimated on
29 of 29 counties — water and trash are guesses — and the footnote read *"we
have not sourced this county's figure yet"* under a number whose largest line
is the GA DOR's own millage and whose second largest is EIA-861.

**The footnote now names what is actually a guess**, and the shared
`estimateNoteFor` decides it from what the computation READ, through
`readingMetrics` — the same helper the three earlier versions of this mistake
were centralised into.

**Two rounds of getting the sentence honest, both worth recording:**

1. First version took the UNION of estimated inputs across the ranking and
   produced *"electricity, trash and water & sewer are still our estimate"* for
   true cost. Technically true and materially misleading: electricity is
   sourced in **27 of 29** counties, and listing it beside trash implies the
   whole line was invented. Now split — a metric that is a guess in every
   marked row is a property of the FIGURE; one that is a guess in a handful is
   a property of THOSE COUNTIES, and gets a count.
2. The second version then read *"…and electricity in 2 of them for the
   counties marked"*, where the scope clause both repeats the count and reads
   as though it governs it. And under a lens called Electricity it said
   "electricity is still our estimate", naming the lens's only input twice.

Live wording, generated from production:

```
True cost /mo      * trash and water & sewer are still our estimate, and
                     electricity in 2 of them. The rest of each figure comes
                     from a public record.
Property tax       (no footnote — nothing estimated)
Schools            (no footnote — nothing estimated)
Electricity        * still our estimate for the counties marked.
Utilities & trash  * trash and water & sewer are still our estimate, and
                     electricity in 2 of them.
```

**Verified**: `pnpm typecheck` clean, lint clean, **649 mobile + 1061 web
tests pass** (+8). Demos regenerated so the review pages carry the same
sentence.

**Learnings**: fixing an honesty bug in one surface does not fix it in the
others, and the copy is where it hides — a stale sentence keeps rendering
perfectly. The first correct-looking replacement was still overstating; the
test that caught it was the one asking what the note says about a metric that
is sourced almost everywhere.

## 2026-09-08 14:20 UTC — phase215: sampling the last unverified claim

**Objective**: the only inherited claim left is the homestead exemption table
— 23 counties, each changing a published tax bill, each needing that county's
own assessor page. Twenty-three fetches was why it kept getting deferred.

**So I sampled instead of deferring again.** Not at random: two chosen because
they carry the most weight (Fulton's $30,000 is the largest county exemption
in the metro; Rockdale's $15,000/$15,000 the largest combined), and two
because **I had flagged them myself** when writing the table —
`'(secondary source — re-verify)'` on Cherokee and Clayton. Four checks
against twenty-three tells you most of what twenty-three would.

| county | claim | outcome |
|---|---|---|
| Fulton | $30,000 / $2,000 | **verified from the county's own guide** |
| Cherokee | $5,000 / $2,000 | corroborated; county site returns 403 |
| Clayton | $10,000 / $10,000 | corroborated, incl. code of ordinances § 8-21 |
| Rockdale | $15,000 / $15,000 | **not verifiable** — see below |

Fulton's 2025 Homestead Exemption Guide, read with our own PDF reader, says it
outright: *"Includes $30,000 off the assessed value on County, $2,000 off
school."* Nothing in the sample was wrong. The two I had flagged as weak both
hold — the flag was cautious rather than mistaken, which is the good outcome
for a flag.

**Every entry's label now states its actual standing** rather than naming a
county and implying a reading. "verified 2026-09-08", "corroborated, county
site blocks fetching", "PDF not machine-readable, unverified" — three different
kinds of evidence that were previously indistinguishable.

**Rockdale led somewhere more useful than Rockdale.** Its schedule downloads
and our reader returned nothing, which raised a real worry: the printable-ratio
filter added in phase212 could be rejecting legitimate content streams, and an
over-aggressive filter looks *identical* from the outside to a document that
has no text — both end in an empty result.

Measured, and it is not: Rockdale's eight content streams are **1.000
printable** and its one embedded font is **0.315**. The filter separates them
exactly. There is now a test pinning that, because "the filter is not too
tight" is not observable from a passing suite otherwise.

The real reason Rockdale reads as nothing is that its text is drawn as
**hex strings** — `<001500130015>Tj` — against a Type0 composite font, so the
bytes are glyph IDs. Same class as the 2024/2025 DOR millage editions. A
reader that decoded those to text would emit confident nonsense, so the
limitation is now documented with a test rather than papered over.

**Verified**: `pnpm typecheck` clean, lint clean, **649 mobile + 1053 web
tests pass** (+2).

**Learnings**: an item deferred for being expensive can usually be sampled,
and sampling should be aimed rather than random — the two entries worth
checking first were the two I had already doubted in writing. A flag I left
for myself turned out to be the cheapest index into where the risk was.

## 2026-09-08 13:55 UTC — phase214: two sources agree, so switch to the better one

**Objective**: phase213's xlsx reader existed to check one number, and its
last line noted it also opens EIA-861 — the body that COLLECTS the per-utility
figures OpenEI redistributes. That made a cross-check possible for the first
time: one download against 27 counties of published electric bills, cheaper
per unit of doubt removed than the 23 county assessor pages still on the list.

**They agree.** EIA-861 2024 against OpenEI 2023, all 57 Georgia utilities
present in both:

```
Georgia Power Co        15.49¢   14.62¢   +5.9%
Jackson EMC             11.38¢   11.98¢   -5.0%
Cobb EMC                11.41¢   11.67¢   -2.3%
Snapping Shoals EMC     12.37¢   12.41¢   -0.4%
Central Georgia EMC     12.24¢   12.23¢   +0.1%
```

**56 of 57 within 15%, most within 3%.** The one exception — Albany Utility
Board at 15% — serves no metro county. Two derivations a year apart landing
this close is the only evidence available that either is right.

**So the source changed, because the better one is now readable.** EIA-861 is
primary (the body that collects the filings rather than a redistribution),
a year newer, and its rate is residential revenue ÷ residential sales — money
actually collected over energy actually delivered, which carries every rider
by construction. That is the same property that ruled out Georgia Power's
published tariff back in phase202, now obtained from the source.

OpenEI is kept, as a **cross-check on every run**: divergence past 15% is
reported by name. Deliberately reported and never enforced — a cross-check
that can block publishing real data is a liability, not a safeguard.

**What moved.** Georgia Power's counties go $157 → $166 (its rate rose 5.9%
in a year), Forsyth $135 → $124, Coweta and Fayette $125 → $138. Still 27 of
29 counties; Cobb and Henry remain genuinely split and remain estimates.

**Two things the format forced, both worth stating:**
- The header is **found, not assumed**. It is two rows deep and its position
  moved between the 2024 and 2025 editions, so the code locates the row naming
  "Utility Name" and asserts that Revenues/Sales sit where it expects,
  throwing rather than reading a neighbouring column.
- Revenue and sales are **summed per utility before dividing**. A utility can
  file more than once per state — bundled versus delivery-only, and split
  filings — and taking the first row prices it on part of itself.

**Verified**: `pnpm typecheck` clean, lint clean, **649 mobile + 1051 web
tests pass**. Applied to production, 27 rows.

**Learnings**: the honest reason to prefer a source is rarely "it is more
accurate" — nothing here could establish that. It is that it is closer to
where the number is made, and now it is also the one we can open.

## 2026-09-08 13:30 UTC — phase213: the number every electric bill is multiplied by

**Objective**: next on the inherited-claims list, ranked by reach. Every
county's electric figure is `STATE_MONTHLY_KWH × that county's rate`, and
`STATE_MONTHLY_KWH = 1074` came from a research pass. One number, 27 counties,
never checked.

**Verified against the primary source.** EIA Table 5.A,
`eia.gov/electricity/sales_revenue_price/xls/table_5A.xlsx`, "2024 Average
Monthly Bill — Residential", built from forms EIA-861:

```
Georgia   4,815,501 customers   1074.0134 kWh/month   14.0825 ¢/kWh   $151.248
```

1074 is right. It is also internally consistent — 1074.0134 × $0.140825 =
$151.25, the same row's own bill figure.

**Getting there needed a reader.** EIA publishes spreadsheets, so verifying
anything from EIA meant either taking it on report forever or being able to
open an xlsx. `apps/web/lib/areas/xlsx.ts` is a ZIP reader and a worksheet
reader in ~140 lines — central directory, `inflateRaw`, shared strings, cells
— against a dependency that would ship a spreadsheet engine to read a table of
numbers in a build script. It deliberately does not do formulas, dates, styles,
ZIP64 or encryption, and throws rather than guessing when it meets them.

**Writing the tests found two bugs in it, both of the silent kind:**

1. **A self-closing empty cell swallowed its neighbours.** With
   `<c …>…</c>` tried before `<c …/>`, the open tag's `[^>]*` consumes a
   self-closing cell's `/` and runs on to the NEXT cell's `</c>`. The empty
   cell and everything up to it vanish — which drops a column and shifts every
   later one left, in a table that still looks like a table. Alternation order
   reversed.
2. **Chained `.replace` calls double-decode XML entities.** Source `&amp;lt;`
   is the literal text `&lt;` — one decode. Replacing `&amp;` last still
   re-examines what an earlier pass wrote; replacing it first is worse. Neither
   order is correct; a single pass over one alternation is. And the test I
   wrote for it was wrong in the same way I had been — I expected two decodes.
   The code was right and the expectation was not.

**Verified**: `pnpm typecheck` clean, lint clean, **649 mobile + 1051 web
tests pass** (+17). Re-read the real EIA file after both fixes and the Georgia
row is unchanged.

**Learnings**: the reason this claim went unverified for eleven phases was not
carelessness, it was that the source was in a format nothing here could open.
"We cannot check that" quietly becomes "that is true". A hundred and forty
lines removed the excuse, and the same reader now opens EIA-861 — the
authoritative version of the per-utility rates currently taken from OpenEI.

## 2026-09-08 13:05 UTC — phase212: EHOST verified; the PDF reader could be hung by a font

**Objective**: continue phase211's audit down the list of inherited claims,
ranked by what each holds up. The largest single-source adjustment in the
codebase is DeKalb's EHOST credit — 11.638 county mills, which takes DeKalb
from a 1.638% statutory rate to a 1.103% buyer rate. One research pass
produced that number. Nothing had checked it.

**Verified, from DeKalb's own published millage sheet**
(`dekalbtax.org/wp-content/uploads/2025-Millage-Rates.pdf`), read with this
repo's own parser:

```
General Opns  11.027   Hospitals  0.611
```

11.027 + 0.611 = **11.638**, exactly what `TAX_CREDITS.dekalb` carries. The
claim survives.

**But getting to that number found two ways to hang the parser, one of them
already merged and on main.**

1. **A font is not a content stream.** `contentStreams` kept any inflated
   stream whose bytes contained `Tj` or `TJ`. DeKalb's sheet embeds four
   TrueType fonts, and a binary blob contains those two bytes by chance long
   before it contains anything meaningful — the tell was `OS/2`, `cmap`,
   `glyf`, `loca` table tags sitting in what the reader had called text. Now
   filtered on printable ratio: real operator streams measure 0.99+, the font
   blobs well under half.

2. **The TJ-array pattern backtracks exponentially.** Both alternatives of
   the old array pattern matched a backslash — the classic ambiguity. Fed
   74 KB of binary with 100 open brackets and no closing `] TJ`, it never
   returns. Not slow: **hung**. Rewritten so the branches are disjoint.

   This one was latent on main since phase202. The millage PDFs never
   triggered it because their font streams happen not to contain the bytes,
   so it sat there waiting for a different document.

3. And I added a third hang while fixing the first: an early `continue` inside
   the `try` block, when the loop's advance sits after it. Two rejected
   streams in a row and it spins forever. Caught in the same session, and
   there is now a test that would have caught it.

**Every one of these has a test that fails without its fix, checked by
reverting each fix in isolation.** The regex one is a timing assertion — with
the old pattern restored the suite produced no output for 45 seconds before I
killed it, which is precisely the failure being guarded. A hang is worse than
a wrong answer: nothing tells you which stage stopped.

**Verified**: `pnpm typecheck` clean, lint clean, **649 mobile + 1034 web
tests pass** (+4). The millage importer still parses 1,618 rows from the 2023
edition, unchanged.

**Learnings**: `includes('TJ')` on a decompressed PDF stream is a content
sniff, and content sniffing on binary is how a parser meets input it was never
shaped for. The audit was looking for a wrong NUMBER and found a wrong
ASSUMPTION about what a stream is — going and fetching the primary source is
worth it even when the claim turns out to be right.

## 2026-09-08 12:45 UTC — phase211: verifying the OTHER inherited claim, the one holding up our tax data

**Objective**: phase210's correction was about a claim I had restated four
times without ever measuring. The obvious follow-up is not "be more careful"
— it is to go and check the other load-bearing claim of the same shape. There
is one, and it is bigger: `import-ga-millage.ts` says the 2024 and 2025 DOR
editions cannot be parsed, **and that is the entire reason we publish 2023 tax
rates**. It came from a research pass. I had never run it myself.

**It is true, and now it is measured.** Both files downloaded and run through
this repo's own reader on 2026-09-08:

| edition | streams | text items | rows | parsed | counties |
|---|---|---|---|---|---|
| 2023 | 51 | 7,006 | 1,844 | 1,618 | 160 |
| 2024 | **0** | 0 | 0 | 0 | 0 |
| 2025 | 53 | 49,099 | 43 | **0** | 0 |

2024 has no text-bearing content streams at all. 2025 draws text and every
character of it is garbage — `["L","M","Q","0","J","K"]` where 2023 gives
`["DEKALB","ATLANTA","8.520","1.880"]`.

**And I went one step further than the claim, because "unparseable" invites
someone to try anyway.** The 2025 text is 90 distinct characters starting at
`\u0000` — subset-font glyph INDICES with no mapping back to letters — and
**no drawn run is longer than six characters**. The document positions nearly
every character individually, so there are not even word boundaries to work
from. Solving it as a substitution cipher would mean reconstructing words from
coordinates first and then breaking one cipher per font subset. It is OCR's
job, and OCR guessing a millage rate is the worst available failure mode for
this particular number.

**Also checked, since it would have made all of this moot**: DOR publishes
this as PDF and nothing else. The listing page offers 2019 through 2025 and
not one spreadsheet or CSV.

**Actions**:
- The script header now records the measurement, the method and the date,
  replacing a claim that was true but inherited.
- A **file-size tell** for whoever checks next year: the editions that parse
  are small (2023 123 KB, 2022 86 KB, 2020 83 KB); the ones that do not are
  large (2021 8.8 MB, 2024 9.4 MB, 2025 2.4 MB). If the 2026 edition lands at
  a hundred-odd kilobytes, repoint `YEAR` and it will very likely just work.
- **A guard**: under 500 parsed rows the importer now exits non-zero and names
  the likely cause. Before this, running it against an unreadable edition
  produced "0 district rows parsed", then "0 counties", then `--apply` would
  have upserted an empty array and reported success. Verified both ways — 2023
  still parses 1,618 rows, 2025 now stops with an explanation.

**Verified**: `pnpm typecheck` clean, lint clean, **649 mobile + 1030 web
tests pass**.

**Learnings**: the useful response to finding one unverified claim is to ask
what ELSE was taken on trust, and to rank those by what they are holding up.
This one was holding up the age of every property tax figure we publish. It
survived the check — but "we checked and it survived" and "nobody ever checked"
are different states, and only one of them is worth writing down.

## 2026-09-08 12:25 UTC — phase210: CORRECTION — PostgREST does not stringify numeric here

**This entry corrects a false claim I made in phase209 and repeated as fact in
its commit message, its code comments and its tests.**

phase209 asserted:

> The generated schema type is WRONG about `value` … What actually arrives is
> `"0.72"` — PostgREST serialises `numeric` as a STRING rather than lose
> precision to JSON's float64.

**It does not.** Measured against the live instance, the raw body of
`/rest/v1/area_metrics?select=metric,value` is:

```
[{"metric":"property_tax_rate_pct","value":0.9}, {"metric":"water_monthly_usd","value":60}]
```

A JSON number. The generated type saying `value: number` was right, and I
called it wrong.

**Where it came from.** The claim was not invented in phase209 — it was
inherited. phase196 wrote the comment "Postgres `numeric` arrives as a string
through PostgREST" beside a defensive `typeof === 'string'` coercion, as a
justification for code that was reasonable on its own. Nothing checked it. By
phase209 it had been restated four times, each restatement citing the previous
one, and it ended up in a DEVLOG entry as a general lesson about generated
types — the most confident version of it, and the one most likely to mislead
whoever reads this file next.

**How it surfaced**: not by review. The next tick started by asking whether the
finding applied to the codebase's OTHER `numeric` columns — `beds`, `baths`,
`lat`, `lng`, `price`, `ai_score` — and the first thing that check did was hit
the live API, where every one of them came back as a number. Generalising a
claim is a good way to test it.

**Actions**:
- The comments in `areas.ts` and the tests now say what was MEASURED, with the
  date, and mark the string tolerance as tolerance rather than description.
- The widening stays. One union member and a `Number()` call is cheap;
  PostgREST has stringified `numeric` in other versions and configurations,
  arbitrary-precision values genuinely cannot round-trip through float64, and
  the failure if it ever changes is silent — every rate NaN, every county grey.
  The test for the number form is now the one labelled as what happens, and
  the string test is labelled as tolerance.
- Audited the blast radius: nothing else was built on the false premise.
  `lib/feed/community-reasons.ts` has a `numeric()` helper that accepts
  strings, but that is for the Nextdoor seed's genuinely-textual fields
  ("$425,000", "62%"), which is a different and real problem. Nothing anywhere
  ASSUMES a string, so nothing breaks.

**Verified**: `pnpm typecheck` clean, lint clean, **649 mobile + 1030 web
tests pass**.

**Learnings**: a comment that explains WHY code is defensive is load-bearing
documentation, and if the why is wrong the code survives while the
understanding rots. This one was stated four times before anyone measured it,
and each restatement made it sound better established. Cheap defensive code
does not need a confident causal story to justify it — "tolerated, not
expected, measured on this date" is both honest and enough.

## 2026-09-08 12:05 UTC — phase209: the typed client comes back, and the schema type is wrong about one column

**Objective**: the loop notes said unblocked work was essentially done, so this
tick started by checking that claim rather than accepting it. It was not quite
true — `apps/web/lib/areas/areas.ts` still carried a TODO I wrote in phase196
("restore the `<Database>` generic after `pnpm db:push` + `pnpm db:types`"),
and the blocker cleared when the owner authorised the push mid-session.

**Actions**:
- Regenerated `database.types.ts`. `pnpm db:types` is wired to `--local`,
  which needs a Docker instance; `supabase gen types typescript --linked`
  reads the linked project directly and works. Diffed before trusting it: the
  only table added is `area_metrics`, the rest of the delta is PostGIS
  function signatures. No other agent's schema drift came along.
- Restored `createPlainClient<Database>` and dropped the untyped-client
  explanation, replacing it with why the RUNTIME validation stays anyway.
- `MetricRow` is now derived from the generated `Row`, narrowed to exactly the
  columns `fetchAreas` selects, so adding a column to the query without
  widening the type fails to compile.

**The generated schema type is wrong about `value`, and the fix is a widening,
not a cast.** It says `value: number`, because the column is `numeric`. What
actually arrives is `"0.72"` — PostgREST serialises `numeric` as a STRING
rather than lose precision to JSON's float64. Believing the generated type
here would make `groupMetrics`'s string handling read as dead code, and
deleting that turns every rate into NaN and every county on the map grey. So
`MetricRow` is `Omit<Pick<Row, …>, 'value'> & { value: number | string }`,
with the reason written down and a test on both forms.

**Restoring the type immediately caught something.** The test fixture typed
`area_kind` as `string`; the column is an enum. Nine call sites failed to
compile until the fixture was typed against the real row — which is the whole
point of having the generic back, and it happened within a minute of it
returning.

**Verified**: `pnpm typecheck` clean, lint clean, **649 mobile + 1030 web
tests pass** (+1).

**Learnings**: a generated type is a claim about the SCHEMA, not about the
wire. `numeric` is the case where those differ, and the generator has no way to
know — it reads the catalogue, not PostgREST's serialiser. Anywhere a
`numeric` column is read, the generated type is optimistic by exactly one
JSON conversion.

## 2026-09-08 11:50 UTC — phase208: make demo drift a failing build, not a note

**Objective**: last tick I wrote into the loop notes "re-run BOTH build scripts
after any data or lens change — that is the only thing keeping these two pages
true." That is a process that depends on someone remembering, and forgetting is
precisely what happened twice. `/demos/search-lenses` showed four lenses when
production had five; `/demos/area-compare` showed three communities that do not
exist. Both failures were silent — nothing broke, the pages simply described a
product that no longer existed, to the one person who reviews by opening them.

**Actions**:
- `apps/web/lib/areas/demo-artifacts.test.ts` — 11 tests reading the committed
  `public/demos/*/data.js` and asserting it matches the code that generates it:
  the lens ids in order, each lens's label, unit, heading and RAMP, the
  reference home, that every ranked county has a shape and every shape has a
  cost sheet, and that the compare table's rows match what
  `buildAreaCompareTable` produces today.
- `pnpm demos:build` runs both generators in one command.
- `ARCHITECTURE.md` names the guard and says the fix is to re-run the
  generator, never to edit the expectation.

**Verified the guard actually fails.** A test that has never failed is a
placebo, so I reproduced the exact drift that happened: deleted the
`electric` lens from the committed artefact, leaving four where the code has
five. Three tests failed — the id list, the per-lens fields, and the ramps.
Restored, and `git diff` on the demo folder is clean.

**What these tests deliberately do NOT check**: that the numbers are current.
The data behind them changes whenever a scraper runs, with no code change to
hang a test on, and an age assertion would fail on a quiet week rather than on
a real problem. Structural drift is the failure that actually occurred, twice,
and structural drift is what is now caught.

The ramp assertion is the one worth keeping deliberately: a recoloured lens
whose demo still paints the old hue is drift the eye will not catch, because
the map still looks plausible.

**Verified**: `pnpm typecheck` clean, new file lint clean, **649 mobile +
1029 web tests pass** (+11).

## 2026-09-08 11:35 UTC — phase207: the second stale demo, and the third time the same bug

**Objective**: the notes' own next item, written last tick — `/demos/
area-compare/` was still a hand-drawn mockup showing three invented
communities ("River Green", "Vickery", "Oak Grove") with invented figures,
while the screen that shipped compares COUNTIES from real millage, real
Milestones results and a real electric rate. Two demos drifting the same way
is not bad luck; it is what a hand-drawn preview does once the thing it
previews is real.

**Actions**:
- `scripts/admin/build-compare-demo.ts` — runs the real
  `buildAreaCompareTable` from `apps/mobile/lib/areas/compare-areas.ts` over
  the live `/api/mobile/areas` payload. Four preset trios, each chosen to show
  something different: schools trading against cost, the cheap outer ring
  where the figures converge, the core metro, and where tax dominates.
- Each trio is also rendered under a **schools-first** priority weighting,
  because row reordering is a real feature of the shipped screen and a static
  table would not show it. All four reorder from "True cost" to "Schools".
- `/demos/area-compare/index.html` rewritten as a renderer, with the same
  generation stamp as the lens demo.

**And the demo immediately earned its keep by exposing a bug.** The rendered
table put an "estimated" asterisk on **Property tax** — a figure computed from
the GA DOR's own adopted millage. `compare-areas.ts` had its own copy of the
"is any DECLARED input an estimate?" check, and the declared list still names
the seeded `property_tax_rate_pct` that the computation never reaches.

**That is the third time.** `valuesFor` (phase201.2), then `costBreakdown`
(phase203.1), now the mobile compare table — three files, three separate
pieces of code, all written to the same wrong instinct. So this phase does not
fix it a fourth place at a time: `readingMetrics` and `estimatedFromReads` now
live in `@percho/shared/lenses`, all three call sites go through them, and the
helper's header says why it exists. A declared input includes fallbacks; a
fallback the computation never reached is invisible to reasoning and visible
to `.some()`.

**Decisions**:
1. **Presets rather than a free picker.** The table's maths cannot run in the
   browser without reimplementing it there, which is exactly what let the
   previous version drift. Four trios precomputed.
2. `row()` in the compare table now takes a metric GETTER rather than an area,
   which is what makes read-tracking possible at all. `metricValue` and
   `isEstimated` are gone — they were the local reimplementation.

**Verified**: regenerated and re-screenshotted. The property tax row now reads
`$4,416 · $4,932 · $5,520` with no asterisks; true cost and utilities keep
theirs; insurance is correctly unmarked in every column because it is
identical everywhere and reads no metric at all. `pnpm typecheck` clean,
**649 mobile (+4) + 1018 web tests pass**.

## 2026-09-08 11:10 UTC — phase206: the review demo was a mockup of something that already exists

**Objective**: with water stopped on evidence and the tax-district question
waiting on the owner, the next real gap was one I had created. The owner
reviews remotely by opening `percho.co/demos/…` — that is how this work
started, with two static demos built BEFORE the implementation. Five phases
later the implementation had overtaken them and nobody had told the demo.

**What the page he would open on landing actually showed**: four lenses where
production has five (no Electricity), DeKalb's property tax as **1.04%** where
the GA DOR's own millage now gives **1.10%**, no supplier notes, no per-line
estimate flags, and every figure an invention of mine from before any of it
was sourced. A stale demo is not a stale mockup. It is a wrong answer to
"what did you build".

**Actions**:
- `scripts/admin/build-lens-demo.ts` — fetches `percho.co/api/mobile/areas`
  (the same payload the phone receives), runs the real `@percho/shared/lenses`
  over it, and writes `data.js` with every ranking, class colour, legend and
  cost sheet precomputed. 59 KB.
- `/demos/search-lenses/index.html` rewritten as a pure renderer of that file,
  plus a "what each lens knows" table showing sourced-vs-estimated per lens.

**Decisions**:
1. **Precompute rather than fetch in the browser.** The demo is same-origin
   with the API and could call it live, but the lens catalogue's `compute` is
   a function and does not survive JSON. The alternative — reimplementing the
   quantile classing and the tax maths in the demo's own script — is exactly
   the second source of truth that let this page go stale in the first place.
2. **The page stamps when it was generated**, in the panel beside the phone. A
   demo that cannot say how old it is invites the reader to assume it is
   current, which is the failure being fixed.
3. The demo's honesty table reports **sourced of total per lens**, so the thing
   the owner sees first is which dimensions we can defend: property tax and
   schools all sourced, electricity 27 of 29, true cost and utilities 0 of 29
   because water and trash are still guesses.

**Verified**: screenshotted both states with a headless browser — the ranking
view and Fulton's cost sheet, which reads "$824 true cost /mo" with "Electric
$157 · Georgia Power Co · 14.6¢ per kWh · serves 55% of the county" and
asterisks on water, trash and insurance only. `pnpm typecheck` clean, **645
mobile + 1018 web tests pass** (unchanged — this phase adds no library code).

**Learnings**: a demo built to preview work becomes a liability the moment the
work lands, and the failure is silent — nothing breaks, it just quietly
describes a product that no longer exists. Generating it from the shipped code
and the live API is the only version of this that stays true without anyone
remembering to update it.

## 2026-09-08 11:20 UTC — phase205: electricity gets its own lens; water is attempted and stopped

**Objective**: the notes' next item was water and trash. I attempted water
inline, stopped on evidence, and shipped the thing that turned out to matter
more.

**Water: attempted, not shipped, and here is exactly how far it got.**
- DeKalb's 2026 rate sheet is real and reachable
  (`dekalbcountyga.gov/.../2026 Rate Sheet Effecive - January 1 2026.pdf`,
  note the county's own typo in the filename). Tiered water $2.77 / $3.95 /
  $5.90 / $10.36 per 1,000 gal with a $3.64 base at ¾"; sewer commodity
  $14.54. An earlier pass cross-checked 4,000 gal against the county's own
  published "$84 in 2026" and matched at $84.08, so the METHOD is sound.
- Gwinnett's 2026 schedule downloads as a real PDF (194 KB) and our own reader
  parses it — but it is an eleven-section multi-column fee schedule, and row
  clustering interleaves the water tiers with meter fees, TV inspection
  charges and system development fees. I can see $7.50, $5.78, $8.67, $11.56,
  $9.43 in there and I cannot say with confidence which is the ¾" water base
  and which is the sewer volumetric.

Stopped there. A water bill assembled from a column I am 80% sure about is
worse than the flagged estimate it replaces, and unlike electricity there is
no cross-source to check it against. **Two counties of effort produced zero
counties of confident data**, which is the honest signal that this needs a
different approach — per-county HTML rate pages, or a human reading eleven
PDFs — rather than more of the same.

Also unresolved and worth knowing before anyone tries again: in the outer
counties a large share of homes are on **well and septic** and pay nothing at
all. A county-level water figure for Pickens or Dawson is not just imprecise,
it is the wrong shape.

**What shipped instead: electricity as its own lens.** phase202 sourced a real
electric bill for 27 of 29 counties with a $64/month spread, and it was
invisible — combined with water and trash into "Utilities & trash", which
reads 29-of-29 estimated because two of its three inputs are guesses. A
sourced figure was being averaged into an estimate and losing its provenance
on the way. It now has its own chip, its own validated single-hue ramp
(violet, five checks passed against the light surface), and reads **2 of 29
estimated** — Cobb and Henry, the two counties genuinely split between
utilities.

Live: Coweta and Fayette $125 (Coweta-Fayette EMC) to Meriwether $189 (Diverse
Power). Same numbers as before; they are simply no longer hidden.

**Verified**: `pnpm typecheck` clean, new files lint clean, **645 mobile +
1018 web tests pass** (+6). Ranked against the live production payload, not
only in tests.

## 2026-09-08 10:40 UTC — phase204: the published tax rate is understated, and here is by how much

**Objective**: the notes' next item was tax at DISTRICT level rather than
county — DeKalb spans a wider range internally than the whole
statutory-vs-effective argument. Building it turned up something more
important about a number already on production.

**What went wrong, and it is ours.** `import-ga-millage.ts` totals three rows
per county: `COUNTY UNINCORPORATED`, `SCHOOL`, `STATE`. That was believed to
be the whole county-wide levy. It is not. Georgia counties also levy fire,
EMS, police, recreation, sanitation and ambulance as SEPARATE districts, and
an unincorporated homeowner pays them. **19 of 29 metro counties levy
something the published figure omits**, up to 0.347 percentage points of
market value in Hall — against figures in the 0.65–1.55% range, so as much as
a fifth of the number.

**And a second error, this one in prose we shipped.** The `detail.basis` on
every published tax row said "A home inside a city pays that city's millage on
top." That is false. The county levies a LOWER rate inside city limits because
the city provides the services — DeKalb charges 17.494 mills unincorporated
and 9.588 incorporated. A Dunwoody home totals 38.445 mills against its
unincorporated neighbour's 40.953: **the city resident pays less.** Pine Lake's
own 16.481 mills do swallow the discount and reach 51.886, so the effect runs
both ways, which is exactly why "on top" was the wrong mental model rather
than merely an imprecise one.

**Actions**:
- `taxScenarios` / `scenarioRange` in `lib/areas/millage-pdf.ts` + 14 tests,
  every fixture a real DeKalb 2023 row. Prices the unincorporated baseline and
  each city, replacing the county school levy with an independent city system
  where one exists.
- `scripts/admin/audit-millage-districts.ts` — a READ-ONLY report of what the
  published figure omits, per county, bucketed by whether the levy is
  county-wide, unincorporated-only, a sub-district, city-specific, or
  genuinely ambiguous.
- The `detail.basis` text is rewritten to say what the figure is and is not.

**Decision: report, do not silently correct.** "Which of these does a given
home pay" is a different question in almost every county. Jackson levies
ELEVEN separate fire districts, 0.700 to 3.390 mills; a home is in exactly one
and the report does not say which covers where — there is no single right
number for Jackson, there is a range. DeKalb's `COUNTY FIRE DISTRICT` is
answerable because its fourteen `COUNTY SSD - <city>` rows carry the identical
2.837 mills, so it is plainly the unincorporated half of one county-wide
service; Meriwether's identically-named row has no such tell. Publishing a
figure that is silently 0.28 points low is bad. Replacing it with one that is
confidently wrong in a different direction is worse. **The owner gets a table
and rules on the buckets.**

**Issues**: the audit's first run reported every county's own baseline as an
omission and put DeKalb 0.832 points light. The filter said
`/^COUNTY (IN|UN)CORPORATED$/`, which matches "UNCORPORATED" — not a word —
and misses "UNINCORPORATED", which is spelled UNIN-CORPORATED. An alternation
inside a word is a good way to write a regex that reads correctly and matches
nothing. Caught before it went anywhere, and the corrected figure is 19
counties rather than 29.

**Not done, deliberately**: `taxScenarios` is not wired to the importer and no
published number changed. Mapping a city range needs city boundaries the lens
map does not have, and the baseline it would extend is the one under question.

**Verified**: `pnpm typecheck` clean, new files lint clean, **645 mobile +
1012 web tests pass** (+14).

## 2026-09-08 09:50 UTC — phase203: show who supplies the number, and which lines are still guesses

**Objective**: phase202 worked out the real electric supplier and rate for 27
counties, and none of it reached the buyer — the mobile DTO drops the metric
row's `detail` entirely, so the app showed "Electric $157" with no way to know
where $157 came from. Work that is true but invisible is not finished.

**Actions**:
- `MetricSupplier` on `AreaMetric`: `name`, optional `share`, optional
  `unitPrice` + `unitPriceUnit`. Projected in `lib/areas/areas.ts`, parsed in
  `apps/mobile/lib/areas/areas-dto.ts`.
- `costBreakdown` returns `CostLine` with a `note` ("Georgia Power Co · 14.6¢
  per kWh · serves 55% of the county") and a per-line `estimated` flag.
- `app/(tabs)/search.tsx` renders both.
- `areas-dto.test.ts` — the defensive parser had no tests at all until now.

**Decisions**:
1. **A named field, not a `detail` passthrough.** `detail` is a jsonb
   scratchpad each importer writes freely; shipping it wholesale would let the
   UI depend on a key one scraper happened to emit. `MetricSupplier` is a
   contract, and the projection reads exactly three keys.
2. **No supplier is projected from an ESTIMATED row.** Reading production's
   real `detail` found the trap: Cobb was skipped by the electric importer (no
   majority provider) so it still carries the SEEDED row, whose hand-written
   `provider` says "Cobb EMC" — the very guess phase202 disproved, and Cobb EMC
   covers 41%. A supplier name beside a figure reads as provenance, so
   attaching one to a guess makes the guess look checked.
3. **`share` is reported below 95% and suppressed at or above it.** "Serves
   100% of the county" is noise; "serves 55% of the county" is the buyer in the
   other 45% being told the figure may not be theirs.

**The bug this turned up.** The county detail sheet's footer read "Estimated
figures — we have not sourced this county yet" whenever ANY metric was an
estimate. Water and trash have no source and never will without per-county
collection, so that banner was showing on every county — including over
property tax and schools, which now come from the GA DOR and GOSA. It was
telling a buyer to discount the two figures we can defend best. The flag is now
per LINE: each estimated line carries an asterisk and the footer names them,
"Sourced from public records, except water & sewer, trash and insurance —
those are still our estimate."

Insurance is always flagged: it is one flat share of price applied identically
in every county, an assumption by construction rather than a measurement.
Property tax follows whichever input actually answered — the levies when they
exist, the stored rate when they do not — which is the same rule `valuesFor`
uses, so the map and the sheet cannot disagree.

**And then the same bug again, one function over.** Rendering the sheet against
the live payload showed **property tax flagged as an estimate** on Fulton and
Pickens — counties whose tax is computed from the GA DOR's own adopted millage.
The per-line flag asked whether any DECLARED input was an estimate, and the
seeded `property_tax_rate_pct` is still in the table as a fallback the
computation never reads. That is precisely the mistake phase201.2 fixed in
`valuesFor`, reintroduced here because the new code was written to the same
wrong instinct. `costBreakdown` now records what `taxMonthlyUsdFor` actually
read, the same way `valuesFor` does, and a regression test pins it.

Worth naming as a pattern: a metric row that exists only as a fallback is
invisible to reasoning and visible to `.some()`. Any new "is this sourced?"
check has to ask what was READ.

**Verified**: `pnpm typecheck` clean, new files lint clean, **645 mobile (+9)
+ 998 web (+18) tests pass**. Rendered against the live production payload:
Fulton reads "Electric $157 · Georgia Power Co · 14.6¢ per kWh · serves 55% of
the county" with property tax unflagged, Pickens omits the share at 100%, and
Cobb correctly shows no supplier and flags electric.

## 2026-09-08 09:20 UTC — phase202: a real electric bill, and who actually sells it

**Objective**: the last unsourced lens. `electric_monthly_usd` was a round
estimate beside a hand-written provider name, and `utilities` therefore read
100% estimated on every county.

**The provider names were wrong, and wrong in an instructive way.** The seed
recorded Gwinnett, Hall, Barrow and Jackson as Jackson EMC; they are 68%, 98%,
85% and 97% Georgia Power. Cherokee was recorded as Cobb EMC; it is 57%
Amicalola, and Cobb EMC is FOURTH at 12%. Georgia's service territories were
drawn by who electrified which farms in the 1930s and have no relationship to
county lines — "Jackson County is served by Jackson EMC" is the kind of guess
that sounds like knowledge.

**Actions**:
- `apps/web/lib/areas/territory.ts` + 16 tests — point-in-polygon with HOLES,
  and grid-sampled area coverage of one polygon by a set of others.
- `scripts/admin/import-ga-electric.ts` — joins the HIFLD retail service
  territories to NREL/OpenEI's per-utility residential rate.
- The PDF reader gains `TJ`-array support (+3 tests). Georgia Power's tariff is
  typeset entirely in `TJ` and has no `Tj` at all; the millage report is the
  reverse, so the existing tests are untouched.

**Validation that the geometry is right, and it is not a test:** run against
the real 94-feature territories file, every county's shares sum to exactly
100.0% with zero unclaimed points, and the method independently rediscovers
the municipal utilities that exist as HOLES inside the co-ops — City of
Marietta at 14.9% of Cobb, and East Point, Fairburn and Palmetto inside
Georgia Power's Fulton territory. All four really do run their own power.
Treating rings after the first as holes is what makes that work; without it
every one of those cities is credited to the utility surrounding it.

**Decisions**:
1. **No provider is named unless it covers a majority.** Cobb is Cobb EMC 41%,
   Georgia Power 39%, City of Marietta 15%; Henry is Snapping Shoals 47%,
   Central Georgia 27%. Those two counties keep their estimate rather than
   being assigned a rate that most of the county does not pay. 27 of 29 get a
   real figure and the other two say so.
2. **The published tariff is not the bill.** Georgia Power's Schedule R-31
   fetches and parses cleanly and reads 8.2116¢/kWh in winter. The tariff
   itself says the amount "will be increased under the provisions of" Fuel
   Cost Recovery, Environmental Compliance Cost Recovery, the Demand Side
   Management schedule and the Municipal Franchise Fee — four riders, none of
   them in the PDF. The all-in average is 14.6¢/kWh, so the energy charge
   alone is a little over half of what a customer pays. Revenue over sales
   carries every rider by construction, which is why it is the source.
3. **Consumption is held constant across counties** at Georgia's average,
   1,074 kWh/month (EIA Table 5.A). What differs between counties, and what a
   buyer is choosing between, is the PRICE. A utility's own average bill also
   encodes its customer mix — one serving mostly apartments looks cheap in a
   way that tells a buyer of a house nothing.
4. OpenEI's plain CSV over EIA-861's XLSX-inside-a-ZIP: same underlying
   figures, and it needs neither an xlsx reader nor a zip reader. EIA's 2025
   early release is unusable for Georgia anyway — Jackson, Cobb, Sawnee and
   GreyStone, about 760k customers, are collapsed into an `Adjustment 2025`
   placeholder row.

**Result**: Meriwether $189 (Diverse Power, 17.6¢ — the metro's most
expensive) down to Coweta and Fayette $125 (Coweta-Fayette EMC, 11.7¢). The
spread is $64/month, which the flat $148–165 estimates had entirely hidden.

**Still estimated after this**: water and trash. Trash has no source at all —
Georgia EPD regulates disposal facilities, not collection, and pickup is 159
separate county and city arrangements. Water is per-utility and similarly
scattered. Both stay flagged.

**Verified**: `pnpm typecheck` clean, new files lint clean, **636 mobile +
980 web tests pass** (+19).

## 2026-09-08 08:40 UTC — phase201: the tax bill comes from the price, not a rate

**Objective**: close the question phase200 left open — the statutory rate is
1.638% for DeKalb, published effective rates are ~1.1%, and neither is what a
buyer pays. Also: the owner authorised `pnpm db:push` mid-flight, so everything
phase196–200 built could finally go live.

**The finding that changed the design.** The gap looked like homestead
exemptions and mostly is not — Georgia's are $2,000–$5,000 off ASSESSED value,
which on a $500k home assessed at $200k is about 2.5% of the bill. Four things
actually explain it, and only one matters to a buyer:
1. **Assessment freezes** (Fulton, Cobb, Gwinnett, DeKalb) hold a base down for
   as long as you own the house — **and reset at closing**. A 2015 owner drags
   the published median down; a buyer gets none of it.
2. **Senior exemptions** are large — Cobb waives all school tax at 62, Forsyth
   at 65, and school is over half the bill.
3. **DeKalb's EHOST credit** is the real outlier: a 100% credit against the
   General and Hospital levies, 11.638 of 20.810 county mills, funded by sales
   tax. Unlike a freeze it applies to a new buyer immediately.
4. ACS's median is self-reported value over self-reported taxes, and households
   likely fold non-ad-valorem sanitation fees into "taxes".

So the statutory rate describes a NON-homestead owner exactly — verified
against a real DeKalb tax bill where a corporately-held parcel pays it to the
cent — and the published effective rate describes a long-tenured senior. **A
buyer sits between them and is well described by neither.**

**And a per-county percentage is the wrong SHAPE regardless.** Fixed-dollar
exemptions make the taxed share of a home rise with its price: Fulton's
$30,000 county exemption is 15% of a $500k home's assessed value and 7.5% of a
$1M one. A single percentage has to pick a house and then be wrong about every
other one. So `@percho/shared/property-tax` computes a BILL and the lens
divides afterwards.

**Actions**:
- `packages/shared/src/property-tax.ts` + 19 tests — the formula, homestead
  amounts for 23 of 29 counties each carrying its own source, and DeKalb's
  EHOST credit. An unverified county falls back to the $2,000 statutory floor
  and is marked unverified rather than guessed at.
- `import-ga-millage.ts` now emits the four levies as their own metrics.
  An exemption reduces an M&O base and by law never touches bond millage
  (O.C.G.A. § 48-5-44), so a client holding only the total cannot compute a
  homesteaded bill.
- The lens and the compare table both read `taxMonthlyUsdFor`, so the map and
  the side-by-side cannot disagree about a county's tax.

**Issues**:
1. **`AVONDALE ESTATES` contains `STATE`.** Selecting county-wide districts
   with `district.includes(...)` also matched `IND SCHOOL ATLANTA`. DeKalb
   summed its county levy, *Atlanta's* independent school levy in place of its
   own, and the *city of Avondale Estates* standing in for the state:
   17.973 + 20.5 + 9.55 = 48.023, to the thousandth. Correct is 40.953. Nine
   other counties were wrong the same way. Found only because a research pass
   mentioned in passing that unincorporated DeKalb is 43.590 mills. Nothing
   about the output looked malformed — right units, every county, merely too
   high. A rate error does not crash; it quietly charges the buyer more.
2. **A sourced figure was apologising for itself.** The property-tax lens
   rendered with an "estimated" asterisk even though it computes from the
   state's own adopted millage, because the check asked whether any DECLARED
   input was an estimate and the declared list still names the fallback.
   `valuesFor` now instruments the lookup and checks only what was read.

**Verified against reality**: Fulton computes to 0.988% for a $500k home
against ~0.98% derived independently from the 2025 rates; DeKalb to 1.103%
against its published ~1.1%, with the drop from 1.638% being EHOST exactly.

**Live**: `pnpm db:push` applied `20260908040000_area_metrics.sql`; all three
importers ran with `--apply`; `percho.co/api/mobile/areas` returns 29 counties
and 290 rows. Property tax and Schools are 0% estimated on production.

**Learnings**: when three published numbers disagree, the question is usually
which POPULATION each describes. None of them was wrong; they were answers to
questions we were not asking.

## 2026-09-08 07:15 UTC — phase200: real numbers behind the lenses

**Objective**: the owner's second instruction for the offline stretch —
「界面做完后接着做所有真实的数据源调查并且爬取」. phase196 shipped the lens map on
145 rows of openly-flagged estimates; this replaces them, one metric at a
time, with sourced figures.

**What the sources actually are** (all verified by fetching them):

| metric | source | fetchable? |
|---|---|---|
| property tax | GA DOR annual millage report, PDF | yes, **2023 only** |
| school proficiency | GOSA Milestones EOG + EOC, CSV | yes |
| electric provider | HIFLD retail service territories, ArcGIS | yes, via a mirror |
| trash | — | **no central source** |

**Property tax — why 2023 and not 2025.** DOR's 2024 and 2025 editions are
typeset with Type3 fonts carrying no `/ToUnicode` CMap and no embedded font
program: the character codes map to glyph names like `/0 /1 /2` and there is
nothing to turn them back into letters. Extraction returns gibberish from 2025
and literally zero characters from 2024. That is a property of the files, not
of the reader, and no PDF library gets past it — they would need OCR. 2023 is
the newest text-bearing edition; every row carries `as_of 2023-12-31` so the
age is visible rather than implied.

**No PDF dependency.** The file is FlateDecode'd standard Type1 text, so
Node's own `zlib` plus a small operator walk reads it. That is ~120 lines
against adding a PDF library for one script.

**Three quirks, each of which cost a county, and all found the same way — the
county simply was not in the output:**
1. *Two positioning idioms.* Most pages place every cell absolutely
   (`1 0 0 1 x y cm` + identity `Tm`); some emit a whole row as one text
   object and step across it with relative `Td`. A regex for the absolute form
   dropped 146 strings, including every Barrow County row.
2. *A zero bond is written three ways* — `0.000`, a literal single space, or
   the column not drawn at all. Requiring two trailing numerics loses Bartow's
   county levy; treating a blank as a terminator loses most of the report.
3. *One row per taxing DISTRICT, not per county.* We publish the
   unincorporated county total (county + school + state), which is what a
   buyer outside city limits pays. Averaging in city districts a home is not
   inside would produce a rate nobody pays.

A fourth turned up while writing the tests: sorting cells by `(page, -y, x)`
and cutting on a y gap is NOT equivalent to clustering. The moment two cells
of one row differ in y by a fraction, the y comparison wins and they emerge
transposed — a district name and its rate swapping places. Rows are now
clustered on y, then sorted by x within the row.

**And a fifth, the worst of them, found only because a research pass on
homestead exemptions mentioned in passing that unincorporated DeKalb is
43.590 mills while we were reporting 48.023.** Selecting the county-wide
districts with `district.includes('SCHOOL' | 'STATE' | 'UNINCORPORATED')`
matches `IND SCHOOL ATLANTA` and `AVONDALE ESTATES` — both real DeKalb
districts. First-match-wins therefore summed DeKalb's county levy, *Atlanta's*
independent school levy in place of DeKalb's own, and the *city of Avondale
Estates* standing in for the state: 17.973 + 20.5 + 9.55 = 48.023, to the
thousandth. Nine other counties were wrong the same way. Districts are now
matched exactly, in `countywideMills`, with the DeKalb rows as a regression
test.

Nothing about the bad output looked malformed. It was a plausible number, in
the right units, for every county — merely too high. That is the failure mode
worth remembering here: a rate error does not crash, it just quietly charges
the buyer more.

Result: **29/29 metro counties** — Dawson 0.657%, Hall 0.763%, Coweta 0.804%,
Forsyth 0.898%, Fulton 1.048%, Cobb 1.086%, Gwinnett 1.104%, DeKalb 1.638%.
Fulton cross-checks against an independently computed 1.038% from the 2025
rates, which is the closest thing to external validation available.

**School proficiency.** GOSA's CSVs are directly fetchable but their filenames
embed a generation timestamp and cannot be constructed, so the index page is
scraped for the newest EOG and EOC — which is also what makes this re-runnable
next summer with no edit. District-aggregate rows only (GOSA writes the
literal `ALL` into `INSTN_NUMBER`), All Students only, **weighted by students
tested** rather than a mean of per-subject percentages, and
**Proficient + Distinguished** because that pair is what the state itself
reports as meeting expectations. County districts are named explicitly rather
than matched by prefix, so Atlanta Public Schools cannot answer for Fulton.
Result: 29/29, Forsyth 66.5% down to Meriwether 22.3% — a ranking any local
would recognise.

**Where the rules live.** The PDF reading moved to
`apps/web/lib/areas/millage-pdf.ts` with 17 tests, same reasoning as
phase194's `naming.ts`: rules discovered by watching data disappear are rules
the next script re-derives differently. Every fixture is a verbatim fragment
of the real report, so the test file is the only written record of what these
PDFs look like.

**The statutory-vs-effective question, and why the answer is neither.**

The gap between our statutory rate and the widely published "average effective
rate" looked like homestead exemptions. It mostly is not. Georgia's standard
exemptions in these counties are $2,000–$5,000 off the ASSESSED value; on a
$500k home assessed at $200k, a $5,000 exemption is 2.5% of the bill.

Four things actually explain it, and only one of them matters to a buyer:
1. **Assessment freezes** (Fulton, Cobb, Gwinnett, DeKalb) cap the taxable
   base for as long as you own the house — **and the base resets at closing**.
   A 2015 owner is taxed on a base far below today's value and drags the
   median down. A buyer today gets none of it.
2. **Senior exemptions** are large (Cobb waives all school tax at 62, Forsyth
   at 65) and school is over half the bill, so they pull the median down
   further. Again, not a buyer.
3. **DeKalb's EHOST credit** is the real outlier: 100% credit against the
   General and Hospital levies for a homesteaded property — 11.638 of 20.810
   county mills — and it *does* apply to a new buyer immediately.
4. ACS's median is self-reported value and self-reported taxes, and households
   likely fold non-ad-valorem sanitation/streetlight fees into "taxes".

So the statutory rate describes a NON-homestead owner exactly (verified
against a real DeKalb tax bill: a corporately-held parcel pays precisely the
statutory rate), and the published effective rate describes a long-tenured
senior. **A new buyer sits between them and is well described by neither.**

Consequence: this phase writes the statutory figure to its own metric,
`property_tax_millage_statutory_pct`, sourced and exact, shown in the county
detail as "adopted rate, before exemptions". It does **not** overwrite
`property_tax_rate_pct`, which the true-cost lens prices with and which stays
a flagged estimate.

**Next step is a design change, not more scraping.** Fixed-dollar exemptions
make the effective rate rise with price, so "one percentage per county" is the
wrong shape regardless of how good the data gets. The right form is to compute
the bill from the listing's own price:
`(0.40·price − county_exemption)·county_mills + 0.40·price·bond_mills +
(0.40·price − school_exemption)·school_mills − credits`. Percho has the price.
That also fixes a second distortion nobody has raised yet: a county-level rate
hides real internal spread — DeKalb runs 1.607% in Dunwoody to 2.287% in Pine
Lake, a wider range than the statutory-vs-effective gap being argued about.

Blocking that: per-county exemption amounts (verified for the core eight;
the outer fifteen need collection, their sites 403/307), and DeKalb's EHOST
credit. Census ACS B25103 ÷ B25077 would give effective rates but now requires
an API key — an account signup, which is the owner's call, and in any case it
answers the wrong question for a buyer.

Also learned, and load-bearing for anything built here later: HB 581's
statewide floating exemption is opted OUT of by nearly every metro school
district, so it changes little for a 2025+ buyer; SB 33 (signed 2026-05-11)
makes the cap mandatory from 2027 and removes the opt-out, so any opt-out
conclusion recorded now has an expiry date. HB 581 also deleted the clause
making a recent arm's-length sale price the ceiling for the next year's
assessment — using the purchase price as the base is still a good
approximation, but it is no longer guaranteed by statute.

**Trash has no central source** — Georgia EPD regulates disposal facilities,
not collection, and its one spreadsheet is a landfill roster with no bearing
on whether a household has kerbside pickup or what it costs. 159 counties,
159 pages, no common format. Left as an estimate and flagged as such.

**Verified**: `pnpm typecheck` clean, **636 mobile + 927 web tests pass**
(+17 for the PDF reader).

## 2026-09-08 06:30 UTC — phase199: the You tab lets a buyer STATE what matters

**Objective**: same brief as Saved — no specific instruction, bring it up to a
shippable standard from the study. The gap: the You tab could show what Percho
had INFERRED from swipes, and gave the buyer no way to simply say it.

**The distinction this phase is built on.** "WHAT PERCHO KNOWS" is evidence —
dims accumulated from trade-off answers, correctable row by row. It is honest,
and it is slow: a buyer who has answered three trade-offs has told us almost
nothing. The study's respondents arrived knowing exactly what they cared about
before touching anything (schools 8/10, safety 7, community amenities 6).
Making them wait to be inferred is making them wait for a conclusion they
could have stated in four taps.

So the declared half is a SEPARATE section, not merged into the inferred one.
Merging would let the app quietly overrule what someone told it — which is the
specific failure the study's respondents named: 8 of 10 said "fear of
commercial bias" is what would stop them trusting a tool like this.

**Actions**:
- `lib/priorities.ts` + 17 tests — four priorities (schools, cost, commute,
  community), weights 0–3, ordering helpers.
- `state/priorities.ts` — persisted, device-local, with a `merge` that
  re-normalises so a build that adds or drops a priority cannot leave a stale
  key weighting something that no longer exists.
- `app/(tabs)/you.tsx` — a WHAT MATTERS TO YOU card above WHAT PERCHO KNOWS.
- `lib/areas/compare-areas.ts` — `buildAreaCompareTable` takes optional
  weights and reorders rows; `app/compare-areas.tsx` passes them.

**Decisions**:
1. **0–3, not a slider.** Four steps a person can name: not really, a little,
   a lot, it's the whole reason. A continuous slider invites a precision
   nobody has about their own preferences and produces a number we would then
   have to pretend to honour.
2. **Default 1, not 0.** Zeroes would mean the app opens believing the buyer
   cares about nothing, so their first tap would read as a change of mind
   rather than as their first statement.
3. **A weight ORDERS, it never filters.** It changes which comparison row
   comes first and what a summary leads with. It does not score an area, does
   not hide one, and a row serving no priority keeps its place rather than
   sinking — a test asserts reordering never drops a row. Same restraint the
   lens map is under: stated priorities change what you see FIRST, never what
   exists.
4. Ties keep the catalogue's order, so a buyer who has stated nothing gets the
   study's own ranking (schools first) rather than an arbitrary one, and the
   list never reshuffles under their thumb.

**Verified**: `pnpm typecheck` clean, new files lint clean, **636 mobile (+21)
+ 910 web tests pass**.

**Learnings**: inferred and declared preferences want to be one number and
must not be. The moment they merge, there is no answer to "why is it showing
me this when I said I didn't care" — and that question is the whole of the
trust problem the study measured.

## 2026-09-08 06:05 UTC — phase198: the Saved tab learns what an area costs

**Objective**: the owner gave no specific instruction for Saved beyond "bring
it to a shippable standard using the study and what you already know". The
study is unambiguous about where to spend that effort: asked what stage they
were at, 4 of 10 respondents were **comparing two or three neighbourhoods**
and 5 were confirming specific homes. Saved already compared HOMES. It had
nothing for the neighbourhood question, and the saved areas were dead rows
reading "See on the map".

**Actions**:
- `lib/areas/locate.ts` + 6 tests — `countyKeyForPoint`, ray casting against
  the county outlines the lens map already downloaded.
- `lib/areas/compare-areas.ts` + 11 tests — the comparison table.
- `app/compare-areas.tsx` — 2–3 areas side by side, reached from Saved.
- `app/(tabs)/saved.tsx` — a saved area row now reads
  "Cherokee County · $691/mo on a $500k home" instead of "See on the map",
  and a COMPARE AREAS card appears once two saved areas resolve to counties
  we have figures for.

**Decisions**:
1. **A saved area is a CITY; the metrics are per COUNTY.** Rather than add a
   column or a geocoding call, the city's centroid is placed against the
   bundled county shapes. Its header states the limit plainly: those shapes
   are simplified to ~250 m for fill, so a point within ~250 m of a county
   line can land on the wrong side, which is fine for labelling a city row and
   is NOT fine for deciding which county a specific HOME is in — that job
   stays with `backfill-community-county.ts` against the unsimplified
   boundaries. A city that straddles a line (Atlanta is Fulton and DeKalb)
   resolves by centroid, and the row names the county it used so the buyer
   sees the assumption rather than absorbing it.
2. **This table marks a best cell; `lib/listing/compare.ts` deliberately does
   not.** The difference is real, not an inconsistency: that table compares
   whole HOMES, where a "winner" would be our opinion dressed as a fact. Every
   row here is one measured quantity with an agreed direction — a lower tax
   bill is lower for everyone — so marking it states arithmetic. What is
   absent in both is the same: no total, no score, no overall winner, because
   how much schools weigh against cost is the buyer's judgement.
3. **No winner when every column ties.** The insurance row uses one metro-wide
   assumption, so all three cells are equal; ticking them all reads as three
   winners rather than as "no difference here". A row needs at least two
   figures AND a spread before anything is best. A test pins it.
4. Two saved cities in one county are de-duplicated before the comparison —
   otherwise a column compares against itself.

**Issues**: price-change / days-on-market / delisted badges are still not
possible — the schema has no price history and no listing date, and a 404 from
the detail endpoint remains the only honest "gone" signal. Unchanged from the
phase-D note; recording it again so it is not mistaken for an oversight.

**Verified**: `pnpm typecheck` clean, new files lint clean, **615 mobile (+17)
+ 910 web tests pass**. Note that the area rows show nothing until the owner
runs `pnpm db:push` and the seed — `countyKeyForPoint` returns undefined with
no shapes, and the row falls back to its old copy.

## 2026-09-08 05:35 UTC — phase197: password sign-in, because the account already exists

**Objective**: owner, reported as a bug — 「登陆现在需要 email code 这不对 我已经
注册过的要允许密码登陆」. The app shipped with Apple + email OTP only. That was
a defensible choice for a NEW account (neither has a redirect leg) and the
wrong one for a returning buyer: web has always been email + password, both
surfaces are the same `auth.users`, and he was being made to wait for a code
to enter an account whose password he knows.

**Actions**:
- `lib/auth.ts` — `signInWithPassword` and `setPassword` (`updateUser`, which
  acts on whoever the client is authenticated as, so it cannot touch an
  account you are not already inside).
- `lib/auth-form.ts` + 12 tests — the pure form rules, extracted so the
  decisions the screen makes are testable without an auth server or a native
  module. `auth.ts` itself imports `expo-apple-authentication`, which is why
  the logic worth testing had to leave it.
- `app/auth.tsx` — password is now the landing step; the code is one tap away
  under "New here, or forgot it?".
- `app/set-password.tsx` + a You-tab entry, email accounts only. An Apple
  account has no password to set — Apple IS the credential — and offering one
  would imply the Apple button could be replaced by it.

**Decisions**:
1. **No `resetPasswordForEmail`.** It mails a LINK, which needs a `percho://`
   deep link, a Supabase redirect allowlist and a recovery screen — three
   moving parts to reach a place the existing, working OTP flow already
   reaches. So the code IS the reset path: sign in with a code, then set a
   password. That also means the recovery path is one we already know works,
   rather than one that ships untested.
2. **One error message for every password rejection.** Supabase answers a
   password attempt against a passwordless (OTP-created) account with the same
   "Invalid login credentials" as a wrong password, and it is right to —
   distinguishing them would tell an attacker which addresses are registered.
   The screen therefore does not guess; `passwordFailureHint` names the way
   out. A test asserts the hint never claims the account does not exist.
3. Password is validated to ≥8 characters client-side, matching Supabase's own
   floor and `apps/web/lib/zod/auth.ts`. Kept in sync by hand rather than
   sharing the zod schema: it is one number, and the alternative is pulling
   zod into the phone bundle.

**Issues**: the OTP-created account with no password is a real population —
every mobile-only user to date. They cannot sign in with a password until they
set one, and cannot be told that directly for the reason above. The mitigation
is that the code path is visible on the same screen and the You tab offers to
set a password afterwards, so the dead end is one tap wide.

**Verified**: `pnpm typecheck` clean, new files lint clean, **598 mobile
(+12) + 910 web tests pass**.

## 2026-09-08 05:05 UTC — phase196: the Search tab gets lenses

**Objective**: owner — 「search tab 我想打破传统的搜索 引入多维度的社区搜索 包括
问卷结果里用户最想了解的 学区 地税 水电 垃圾 隐形成本 治安等等 让人可以一眼看
明白区域之间的各项优劣 像热力图一样呈现」. Then, before boarding a 10-hour
flight: build all of it, don't block on approval.

**Design decision — layers, not a heat map.** The obvious reading of "热力图"
is one interpolated raster with every dimension baked in. That would be a
picture of something untrue: property tax steps at a taxing jurisdiction's
border, school proficiency belongs to an attendance zone, electricity to a
service territory. Interpolating them onto a shared grid draws a gradient
across a line where the real number jumps. So each lens declares the
`areaKind` its dimension is actually defined on and is drawn on those
polygons. Counties first, because tax and sanitation are set there.

**Design decision — no crime lens, and it is written into the code.** Safety
was the #2 thing the 2026-09 buyer study's respondents said they look up (7/10).
It is still absent: Zillow and Redfin both publicly declined crime layers on
fair-housing grounds, because crime counts carry reporting bias and shading a
map by them approximates steering. `lenses.test.ts` asserts no lens id or label
matches `/crime|safety|police|arrest/`, so re-adding one is a deliberate act
with a failing test in front of it. The need is answered at community level by
`community_reviews` — signed, subjective, about a place someone lives.

**Design decision — a lens is inside §4.1, not an exception to it.** The Search
tab's rule is that the only narrowing affordances are the search box and the
viewport. A lens recolours; it never removes an area and there is no threshold
that hides one. While a text search is running the fills drop from 0.62 to 0.16
alpha so the result pins stay readable — the buyer asked a question and the
lens is context, not the answer.

**Actions**:
- `supabase/migrations/20260908040000_area_metrics.sql` — `area_metrics`, LONG
  format (one row per area × metric) rather than wide. The metrics we want
  are not known in advance and arrive from unrelated scrapers on unrelated
  schedules; in wide format each new metric is a migration and each scraper
  writes a column it does not own. Every row carries `source`, `source_url`,
  `as_of` and an `estimated` flag. Public read, service-role write.
- `packages/shared/src/lenses.ts` — the lens catalogue and the classing maths,
  in `shared` rather than `apps/web` because the mobile Search tab is the
  primary consumer and web will want the same numbers. Four lenses: true cost,
  property tax, schools, utilities & trash.
- `apps/web/lib/areas/{areas,lenses}.test.ts` — 27 tests.
- `scripts/admin/build-metro-county-shapes.ts` → `apps/web/data/metro-county-shapes.json`.
  29 counties, 5,664 → 1,518 vertices, 30 KB. Sourced from the same TIGER file
  `backfill-community-county.ts` uses, but simplified far harder (250 m vs
  33 m): that file decides which county a home is IN and must be accurate;
  this one is fill at metro zoom on a phone, where every vertex is one more
  thing react-native-maps re-renders on pan.
- `apps/web/app/api/mobile/areas/route.ts` — shapes + metrics in one payload.
  No parameters and no paging on purpose: the lens computes quantile class
  breaks over the whole metro, and breaks over a page would give the same
  county a different colour depending on what else was in the response.
- `apps/mobile`: `hooks/use-areas.ts`, `lib/areas/areas-dto.ts` (defensive
  parse, same rule as `search-dto.ts`), and `app/(tabs)/search.tsx` — chip row,
  `<Polygon>` fills, legend, ranking list, per-county cost breakdown.
- `scripts/admin/seed-area-metrics.ts` — 29 counties × 5 metrics = 145 rows,
  **every one `estimated: true`**. These are the demo's order-of-magnitude
  figures, not sourced numbers; they exist so the UI could be built against a
  realistic distribution and they render behind a disclosure that says so.
  The phase200 scrapers upsert over the same unique key with `estimated: false`
  and a real `source_url`; a metric is done when nothing in the seed still
  owns it.
- Two static demos merged ahead of the implementation for owner review while
  offline: `/demos/search-lenses` and `/demos/area-compare` (`6f15337a`).

**Issues**:
1. The first quantile formula took `sorted[floor(p·n)]` as each break. With
   n values that makes the top break equal the maximum, and since `classOf`
   tests `value > break` the maximum never exceeded it — the darkest ramp step
   was permanently unused and the map was visibly one colour short. Fixed by
   making each break the LAST value of its class (`ceil(p·n) − 1`). The test
   that caught it asserts the extremes land in classes 0 and 4.
2. `pnpm db:push` is blocked by this environment's permission classifier
   (a production database write), so `area_metrics` is absent from the
   generated `database.types.ts` and the typed Supabase client rejects the
   table name. Rather than hand-write the row into the generated file — which
   the next `pnpm db:types` silently overwrites, and which until then would
   claim a shape the database has not agreed to — `lib/areas/areas.ts` uses an
   untyped client and validates rows at runtime in `groupMetrics`. The header
   records exactly what to restore afterwards.

**Verified**: `pnpm typecheck` clean, new files lint clean (the repo's
pre-existing biome warnings are untouched), **586 mobile + 910 web tests pass**.
The generated shapes file is added to `apps/web/biome.json`'s ignore list
alongside `data/rent-by-zip.json`, the same kind of generated data.

**Blocked on the owner**: `pnpm db:push` for
`20260908040000_area_metrics.sql`, then `pnpm db:types`, then
`seed-area-metrics.ts --apply`. Until the table exists `/api/mobile/areas`
500s and the Search tab renders exactly as it did before — the chips are
hidden when there is nothing to paint, so the failure is invisible rather than
broken.

**Learnings**: the geography a number is defined on is part of the number. The
temptation with a "heat map" is to reach for interpolation because it looks
continuous, but every one of these dimensions is piecewise-constant by law or
by contract, and drawing it as continuous is drawing a claim nobody made.

## 2026-09-08 03:16 UTC — phase195: a home's community name travels ON the card

**Objective**: owner — 「listing card 还是显示两个 city，如果所有的 listing 都有
对应的 community，你要显示出来」. Every listing has had a community since
phase189, yet the header still read `Atlanta metro › Canton / Canton`.

**Issues**: `feedHeaderModel` resolved a listing's community by looking
`communityId` up in the pool's `communities` array. That array only carries
communities with a cover photo, and under the phone's `videosOnly=1` only
those with a VIDEO — **five of 16,504**. So the lookup missed for nearly
every home and the title fell back to the city, which line one already had.
The data was in the database the whole time; it just never reached the card.

**Actions**:
- `browse-card.ts` / `browse-cards.ts`: the card's `community` gains `county`
  (one more column on a query that already selects the row).
- `api/mobile/feed/route.ts`: `projectListing` emits `communityName` and
  `communityCounty` alongside the existing `communityId`, so a listing card
  carries its community rather than hoping the pool does.
- `card-types.ts` / `pool-dto.ts` / `feed-header.ts`: the header reads the
  card's own fields first and treats the pool as enrichment.
- The chevron rule is preserved but re-keyed: a destination is offered when
  there is a community we can NAME, not when the pool happens to hold the
  row. An id with no name behind it is a dangling reference and
  `/community/<slug>` would 404, so it still gets no chevron.

**Verified**: engine run against the live pool at
`stage=4&videosOnly=1` now reads `Atlanta metro › Cherokee County › Canton /
River Green` where it read `Atlanta metro › Canton / Canton`. 586 mobile +
883 web tests pass.

**Learnings**: a lookup against a payload that is filtered for a different
purpose is a silent join. The pool is filtered for what can be a CARD; the
header needed what a listing IS. When the two lists have different admission
rules, carry the field, do not look it up.

## 2026-09-08 01:42 UTC — phase194: the naming rules become code, not a memory

**Objective**: owner, closing the plat phase — 「我们之后在 import listing 或者
builder community 可能也会看到新的 community name，到时候要做去重、合并以及人性
化处理。现在把这个逻辑写到相关的 code 里以防忘记」. The rules existed only inside
`import-county-subdivisions.ts`, where the next importer would never look.

**Actions**:
- New `apps/web/lib/communities/naming.ts` — pure, dependency-free so
  `scripts/admin/*` imports it the same way they import `point-in-polygon`.
  Exports `cleanName`, `squash`, `unwrap`, `isPodOf`, `isSamePlace`,
  `sayable`, `titleCaseName`, `normalizeName`. Its header states the owner's
  principle verbatim, the four steps in order, and — as importantly — what is
  deliberately absent: no rule that classifies a name by its SHAPE. The
  rejected `Rd`/`Dr`/city-name heuristic is recorded with its
  counter-examples so nobody re-proposes it.
- `naming.test.ts`, 18 tests, every string a real row from the plat layers or
  the live table: `CREEK PARK HILLS S/D SEC.3`, `ROBERT Q. CASSELS` vs
  `N.DRUID WOODS`, `NEIGHBORHOODS OF WINDWARD COVE` → Windward,
  `SUNVALLEY ESTATES` → `Sun Valley Estates`. The tests are the record of
  what the data looks like, so a future widening can see what it must not
  break.
- The importer now imports them instead of defining them. Verified behaviour
  identical: Gwinnett and Forsyth dry-runs report the same counts as before
  the refactor, 0 inserted and 0 stale.
- Pointers at the three other places a community can come from:
  `dashboard/communities/actions.ts` (an agent naming a place they know is
  fine; a bulk writer is not), `import-redfin-listing.ts` (documents WHY it
  never creates a community from a listing's subdivision string — three
  listings spell one place three ways), and `merge-communities.ts` (for the
  merges the rules cannot see, where two SOURCES disagree rather than two
  spellings). `ARCHITECTURE.md` names the file.

**Learnings**: a rule that lives in the script that discovered it is a rule
the next script re-derives, differently. The test file is doing more work
than the module here — it is the only place the shape of this data is
written down.

## 2026-09-08 01:20 UTC — phase193: one row per place, under the name people say

**Objective**: owner's naming principle — 「显示的和实际存储的应该一致，更重要
的是他们应该是人们最容易说到的名字，可以口口相传」. That rules out showing a
parent name over a child row: there must be ONE row, and its name must be the
sayable one. Two concrete defects followed from the phase192 import.

**Issues**:
1. **A pod stored as a community.** `2090 Lake Windward Drive` matched
   "Neighborhoods of Windward Cove" — an 11.5-acre pod inside the 1,328-acre
   "Windward". The listing's own MLS record says **Windward**.
2. **The same place stored twice.** "Sunvalley Estates" / "Sun Valley
   Estates", "Northfarm" / "North Farm", "Canterbury Farms" / "Canterbury" —
   the upgrade path matched names exactly, so a spelling variant became a
   second row.

**Actions**:
- `unwrap()` strips a developer's wrapper ("Neighborhoods of X", "Enclave at
  X", "X Townhomes") and, if the inner name matches a community containing
  the plat **on a word boundary** — "WINDWARD COVE" against "Windward" —
  the plat is dropped entirely rather than stored. The parent's polygon
  already covers it, so a listing there lands in the parent under the name it
  is actually called. 61 folded.
- A near-duplicate merge: punctuation-insensitive equality, or one name a
  prefix of the other while the two shapes are within a factor of two (a
  genuinely different subdivision nested in another is far smaller than its
  container). 130 merged.
- Candidate order rewritten. A real community — one somebody named, that
  carries a photo — now beats a row this importer wrote, with the importer's
  own row last. Checking it first short-circuited every merge, because after
  the first import every plat already has one. A candidate another plat has
  claimed is skipped, or the second would overwrite the first's boundary.
- `sayable(a, b)` decides which spelling the merged row keeps: more word
  breaks wins ("Sun Valley Estates" over "Sunvalley Estates"), then longer
  ("Canterbury Farms" over "Canterbury"). The slug and the photo stay.

**Decisions**: the owner rejected a proposed rule that a name ending in
`Rd`/`Dr`/`Road`, or equal to its city, is not a community name — 「there is
not single rule」, and he is right: `Peachtree Road` names a real area,
Nextdoor's "Alpharetta" is the old town centre people do say they live in,
and `River Road Estates` is a real subdivision. The signal is not the SHAPE
of a name but whether independent sources agree on it — the plat, the MLS
subdivision field, the Nextdoor name, sold records. That is what the deferred
sold-data work supplies at scale; until then no name-shape heuristic is used.

**Resolution**: 22,730 active communities, 16,504 subdivisions, 14,052 of them
plat rows. Three full passes converge to 0 inserted / 0 removed. All 18
listings are in a community and every one is a `boundary` containment.
`2090 Lake Windward Drive` reads **Windward** and `950 Renaissance Way` reads
**River Falls**, both matching their own records. Map data regenerated.

**Learnings**: an importer that prefers its own rows is not idempotent, it is
frozen — the first run's decisions become unreachable. Rank candidates by what
they ARE (a human-named community, a spelling variant, our own row), never by
who wrote them.

**Next steps**: Cherokee via a parcel dissolve. Then ranking from public
assessor/deed records — which doubles as the corroboration source the naming
question needs.

## 2026-09-07 23:07 UTC — phase192: five counties of plats, readable names, coverage map

**Objective**: owner on the phase191 result — 「我不要期数，`berkeley-park-2`
这种名字很奇怪。先做 100% coverage with reasonable names, then show me the
visualization on map」. Ranking (the Vivian sold-data idea) is deferred.

**Actions — names**:
- `cleanName()` now owns the grouping key, so phases collapse BEFORE the
  polygons are unioned. Gwinnett keeps its phase in a column, but DeKalb and
  Forsyth bury it in the name and each recorder typed it differently:
  `UNIT 5`, `SEC.3`, `UNIT#1`, `UNIT-1`, `NO.9`, `PHASES 1,2,3`, `BLK2,3`,
  `REVISION 3`, a trailing roman numeral, a trailing comma or `&`. All are
  stripped, repeatedly and in both orders, with the trailing debris cleaned
  between passes. DeKalb collapses 6,281 plats → 3,504 communities as a
  result (4,178 before the hyphen and comma cases were handled).
- Also dropped as "not somewhere you buy a home": `OFFICE`, `PROFESSIONAL`,
  `APTS`/`APARTMENTS`, `INC`/`LLC`/`LTD`/`CORP`/`LP` (the developer entity
  recorded as the plat name), `BANK`, `PROPERTY OF`, `STORAGE`, Cobb's
  `1ST FLOOR`/`2ND FLOOR`, and DeKalb's owner plats, which are detectable by
  a middle initial (`ROBERT Q. CASSELS`) — a full stop FOLLOWED BY A SPACE,
  which is what separates an initial from an abbreviation like `N.DRUID`.
- Slugs: `berkeley-park-2` → `berkeley-park-duluth`. The chain is bare name →
  name + city → name + county → a counter as the last resort, because what
  actually differs between two Berkeley Parks is where they are.

**Actions — scale**: one PostgREST request per row is ~4 rows/s, i.e. hours
per county. Batched to 200. The first attempt sent partial-column upserts and
died on `null value in column "slug"`: PostgREST turns a bulk upsert into one
`INSERT … ON CONFLICT`, and the not-null check runs on the tuple BEFORE the
conflict is resolved — so a partial upsert fails even when every row exists.
Updates now carry the full row, reading name/slug/city/source back off the
existing row for an upgraded Nextdoor community. Minutes per county now.

**Resolution**: **5 counties imported — Gwinnett 3,592, Cobb 3,627, DeKalb
3,351, Fulton 2,924, Forsyth 1,039 plat rows**, plus 1,941 Nextdoor rows
upgraded in place. 23,773 active communities, 17,140 of them subdivisions.
A second pass over every county reports 0 inserted / 0 removed, so the import
is stable and idempotent. `relink-listings`: 16 of 18 listings now sit inside
a recorded plat, and **nothing is on the nearest fallback any more**.
Name residue: 345 numbered slugs and 418 names with a phase word left, both
under 3% — rare abbreviations (`U-2`, `Prop`) and bare trailing digits, which
are deliberately NOT stripped because a wrong strip merges two real
communities and that is worse than an ugly name.

**Map**: `apps/web/public/demos/subdivision-coverage/` — county choropleth by
plat count, all 16,228 plat polygons (Douglas-Peucker at ~33 m), the
neighbourhood seeds as a toggleable dot layer for contrast, and the listings
as pins that say which subdivision they landed in. 7.0 MB raw, 1.4 MB gzipped.

**Learnings**: the messy part of a plat import is not geometry, it is that
six county recorders typed the same concept six ways. Measure the collapse
ratio (plats → communities) per county — Gwinnett 2.4x, DeKalb 1.8x — because
a ratio near 1 means the phase stripper is not firing.

**Next steps**: Cherokee via a parcel dissolve (its polygon layer has 1,011
rows against 94,657 named parcels). Then ranking: which of these 17,140
deserve a photo, from public assessor/deed transfers rather than MLS.

## 2026-09-07 22:01 UTC — phase191.2: Gwinnett imported, 4,227 subdivisions live

**Objective**: run the phase191 import for real. Owner's three calls: import
Gwinnett in full; keep the plat rows out of the buyer-facing city community
count; import Fulton normally despite its "personal use" copyright wording.

**Actions**:
- Migration `20260907230000`: `city_geo_units.community_count` and
  `sample_community_names` now count only communities WITH a cover photo, and
  a city with none is dropped. Without it the plat rows — boundary and nothing
  else — would have taken Lawrenceville from 294 to ~1,300 in the city picker.
  All 8,678 pre-existing communities have a cover, so no count moved.
- Applied `20260907220000` (`source` gains `county_gis`) and the above, then
  ran the importer with `--apply`.

**Issues**: the first `--apply` died 20 rows in on
`communities_slug_key` — `usedSlugs` was seeded from the county's rows, but
the slug is globally UNIQUE and Gwinnett's "River Club" collided with one
elsewhere in the metro. Fixed by seeding from every slug in the table. That
left 13 rows written, so the script also had to become re-runnable: a row this
importer already wrote for the same name in the same county is now recognised
by `source='county_gis'` and refreshed rather than re-inserted. No geometry
test on that path — an area-weighted centroid of disjoint phases can fall
outside all of them.

**Resolution**: **536 upgraded, 3,691 inserted, Gwinnett now 3,691 county_gis
subdivisions + 536 upgraded Nextdoor rows + 665 untouched neighbourhoods.**
Table total 12,371 communities, 4,230 of them subdivisions (was 3).
`relink-listings --apply` then moved **5 of 18 listings** onto a better
polygon: `buford-dam` → `windsor-at-lanier`, `peachtree-corners-sunburst` →
`waterside-2`, `berkeley-woods` → `berkeley-park-2` (which also converts a
1 m `nearest` fallback into a real containment, and fixes a wrong name),
`woodehaven` → `woodhaven-at-chattahoochee-crossing`, `landings-at-sugarloaf`
→ `landings-at-sugarloaf-condominium`. City counts verified unchanged
afterwards.

**Learnings**: a partially-applied bulk import is the normal case, not the
exception — write the "already did this one" check before the first `--apply`,
not after. And check UNIQUE scope against the constraint, not against the
query you happen to be running.

**Next steps**: Cobb (8,719 polygons, needs the `'1ST FLOOR'` junk filtered),
then DeKalb and Forsyth (phase suffix is inside the name — needs a
`UNIT \d+ | PHASE \d+ | S/D` stripper), then Fulton, then Cherokee as a
parcel dissolve. Still open: nothing gives these 3,691 rows a photo, so they
are match targets only — the Vivian sold-data idea is the ranking that says
which of them deserve one.

## 2026-09-07 21:49 UTC — phase191: county plat subdivisions, importer + Gwinnett dry run

**Objective**: proposal 2. Owner green-lit it and asked two framing questions:
does county contain city, and is a builder community 1:1 with a subdivision.

**Answers (measured, not assumed)**:
- **county ⊅ city.** 70 of 109 cities in the table span more than one county,
  covering 7,041 of 8,680 communities. Atlanta alone spans 6 (Fulton 509,
  DeKalb 162, Cobb 30, Clayton 27, …). Two causes stacked: municipal limits
  genuinely cross county lines, and `city` here is the POSTAL city — "Atlanta,
  GA" is the mailing address for large unincorporated parts of Fulton, DeKalb,
  Cobb and Clayton. Neither is derived from the other anywhere in the code:
  county comes from the row's own lat/lng by PIP. Also surfaced two bad seeds
  (`colony-square` sits in Catoosa, `lincolnton` in Lincoln County) — the
  county is right for the coordinate; the coordinate is wrong.
- **Not 1:1, in both directions.** Plats are filed per phase, so a builder
  community is many subdivisions; one plat can host several builders; and
  most platted subdivisions predate any builder brand. {subdivisions} ⊃
  {builder communities}, so subdivision-first covers builders automatically.
  **No county in the metro publishes a builder/developer field**, so
  `communities.builder` stays null and builder becomes a later attribute.

**Actions**:
- Surveyed and curl-verified subdivision layers for all six ARC counties:
  Gwinnett 8,796 (`.../agis_gwinnett/MapServer/23`), Cobb 8,719, DeKalb
  6,281, Fulton 3,964, Forsyth 2,743, Cherokee 1,011 — ~33,500 polygons, all
  ArcGIS REST serving WGS84 GeoJSON with `resultOffset` paging. **No
  region-wide layer exists**: ARC's hub returns 0 for subdivisions and the
  state clearinghouse has none, so six per-county imports are unavoidable.
  Cherokee's polygon layer is badly incomplete (1,011 polygons vs 94,657
  parcels carrying a subdivision name) and should be a parcel dissolve.
- Migration `20260907220000`: `communities.source` gains `county_gis`.
- `scripts/admin/import-county-subdivisions.ts` (dry-run default): fetch and
  cache the layer, filter to residential land-use codes, drop 136
  commercial/industrial names the code misses ("GWINNETT PLACE COMMERCIAL
  CENTER" is LCODE=SUBDIV), group phases by name into one MultiPolygon,
  area-weighted centroid, and borrow the postal city from the containing
  Nextdoor polygon.

**Decisions**: where a plat name equals an existing community's AND the plat
centroid falls inside that community, **upgrade the row in place** rather
than insert. Every Gwinnett community already has a cover photo and 96% a
description; a second row for the same place would win the match (subdivisions
sort first) and hand the buyer a community with no photo. A name that matches
elsewhere in the county is a different place and gets its own row.

**Gwinnett dry run**: 8,492 residential plat polygons → **4,227
subdivisions**; 536 upgrade in place, 3,691 new rows, 317 with no city.
Against the current listings the win is concrete: all 6 Gwinnett listings
land inside a plat, and the plat is the better answer every time —
`5122 Lower Creek Street` moves from the broad `peachtree-corners-sunburst`
to **Waterside**, `2229 Saint Kennedy Lane` from the landmark `buford-dam` to
**Windsor at Lanier**, and `3525 Berkeley Park Court` — a 1 m `nearest`
fallback onto the wrongly-named `berkeley-woods` — becomes a real containment
in **Berkeley Park**.

**Issues**: Fulton's service `copyrightText` says the data is for *"your
personal use"*, which is not obviously a commercial licence. Gwinnett's is
empty and Forsyth's is a plain attribution line. Flagged to the owner before
Fulton is imported; Gwinnett is unaffected.

**Next steps**: owner's go/no-go on writing 4,227 rows to Gwinnett. Nothing
has been written — the migration is committed but unapplied and the script
has only ever run dry.

## 2026-09-07 21:11 UTC — phase190: the county was wrong, then it went in the header

**Objective**: owner, on the feed header: 「community card header 现在有重复的
city 信息，不好。对于 community card 在 area 后加一个 county 如何，然后再 city」.
Putting county on screen first required the county to be right, and it was not.

**Issues**: phase189.2's `communities.county` came from plotly/datasets'
counties GeoJSON — the choropleth-fill dataset, where **Fulton has 53
vertices** (TIGER has 4,700). Assignment near a county line is a coin flip:
Peachtree Corners landed in Fulton (it is Gwinnett), Dunwoody Village in
Fulton (DeKalb), a string of Duluth and Marietta communities likewise.
Measured against the unsimplified source, **198 of 8,679 were wrong**.

**Actions**:
- Refetched from Census TIGERweb (`State_County` layer 13, `STATE='13'`,
  GeoJSON, EPSG:4326): 442k vertices, 18 MB. Swept Douglas-Peucker
  tolerances against that as ground truth over all 8,679 anchors and picked
  3e-4° (~33 m) at 5 decimals — 46k vertices, 0.95 MB, **3 disagreements**,
  all communities whose centroid is within ~33 m of a county line and which
  straddle it anyway. (1e-4°/1.8 MB buys back exactly one of the three.)
  Replaced `scripts/admin/data/ga-counties.geojson`.
- `backfill-community-county.ts` is now idempotent: it recomputes every row
  with coordinates and writes only the ones that disagree, printing each
  `slug (city): old → new`. **Ran `--apply`: 195 corrected**; the immediate
  re-run reports 0.
- Header: `communities.county` now rides the pool DTO
  (`community-pool.ts` select + `PoolCommunityDTO`), through the mobile feed
  route (which spreads the DTO), `parseCommunity`, and `CommunityCardV3`.
  `feed-header.ts` inserts it between the metro and the city for community
  cards and for home cards (whose county comes off the community that
  contains them): `Atlanta metro › Gwinnett County › Duluth`.

**Decisions**: the bare column plus a `countySegment()` that appends the
word — half the counties here are also town names (Douglas, Henry, Newton,
Walton), so "Gwinnett" alone would read as a place. **City cards get no
county**: a city can straddle two (Atlanta is Fulton + DeKalb) and no row
says which, so the `GeoStats` real-or-absent rule keeps it out; that one
card still prints its own name on both lines. Longest realistic line
("… › Gwinnett County › Peachtree Corners", ~345 px) just exceeds the 342 px
context row on a 390 pt phone and tail-truncates; the VoiceOver label reads
the full string.

**Learnings**: a GeoJSON built for choropleth fill is not a point-in-polygon
dataset, and nothing about using it fails loudly — the counts looked
plausible for a whole phase. TIGERweb's ArcGIS REST endpoint returns real
TIGER geometry as GeoJSON in one GET, no shapefile tooling and no new
dependency; its `NAME` carries the " County" suffix, which has to be
stripped. Also: `grep -v 'boundary"'` on `supabase db query` output eats
real rows, because the CLI's untrusted-data fence line contains that word.

**Next steps**: proposal 2 pilot (Fulton County GIS platted subdivisions) —
now that county is trustworthy it can scope the import. Open question for
the owner: whether the city card should show a county too, which needs a
rule for cities that straddle one.

## 2026-09-07 20:41 UTC — phase189.2: migration applied, 18/18 listings linked

**Objective**: owner cleared `db push`; apply 20260907200000 and run the
relink for real.

**Actions**: `supabase db push --linked` from `apps/web` applied
`20260907200000_communities_geom_match.sql` (the only pending one).
Backfill landed on 8,679/8,680 rows (`boundary_geom` and `anchor_geom`
both non-null; the odd one out is `untitled-o5tela`, inactive, no
coordinates). Then `relink-listings.ts` dry-run → `--apply`.

**Resolution**: **18/18 listings with coordinates now have a community** —
16 `boundary`, 2 `nearest` (Berkeley Park Court 1 m outside
`berkeley-woods`, Tide Mill Road 13 m outside `antioch-and-pilgrim`),
0 beyond the 250 m cap, 0 manual picks to preserve. Before this phase only
4 were linked. The 4 pre-existing links kept their community and gained a
`community_match` value.

**Learnings**: `supabase db push --linked` works from `apps/web` with the
CLI's stored credential when stdin is `/dev/null`; it was the permission
classifier, not auth, that blocked earlier attempts. Watch out when
grepping `supabase db query` output — the untrusted-data fence line
contains the word `boundary`, and a naive `grep -v 'boundary"'` silently
eats real `"community_match": "boundary"` rows.

**Next steps**: proposal 2 pilot (Fulton County GIS platted subdivisions).
Owner floated auto-expanding Nextdoor polygons to swallow near-miss
listings — recommended against (see the chat of this date); the distance
is already stored, so "in X" vs "near X" is a rendering decision, and
deforming a shared polygon for one listing corrupts the community map for
everyone. Subdivision boundaries are never editable either way.

## 2026-09-07 20:15 UTC — phase189.1: the nearest fallback stops at 250 m

**Objective**: owner, on reading phase189: "nearest always finds something —
set a distance; past it, don't link, or the data is wrong."

**Actions**: `match_community` (same migration file, still unapplied, so
edited in place — no second migration) filters the nearest pass with
`st_dwithin(…, 250)`; past 250 m the RPC returns no row and
`findCommunityForPoint` returns null, so the listing stays unlinked.
`relink-listings.ts` now clears a stale non-manual link when the RPC
returns nothing (reports "no community within 250 m"), and counts them.
Doc comments in the migration and `find-community.ts` no longer claim
"always returns a community".

**Decisions**: 250 m. Measured against production first: 16/18 listings
are inside a polygon outright, and the two that are not sit **1 m** and
**13 m** outside an edge — Nextdoor polygons are hand-drawn and leave
slivers along roads. 250 m (a block or two) absorbs that drawing error
without linking a house in open country; a point in the middle of Lake
Lanier is 830 m from its nearest community and correctly gets nothing.
The number is a literal in the RPC; change it there.

**Next steps**: unchanged — owner runs `pnpm db:push`, then
`relink-listings.ts` dry-run → `--apply`.

## 2026-09-07 20:10 UTC — phase189: community matching in PostGIS, every listing gets a community

**Objective**: owner green-lit the phase188 proposals with one rule —
"if Nextdoor and subdivision conflict, subdivision takes higher priority" —
and asked whether they reach 100%. This is proposal 1 (the free pipeline
fix), which is what actually guarantees 100% link coverage; the county
backfill quick win rides along.

**Actions**:
- Migration `20260907200000_communities_geom_match.sql`: `communities`
  gains `boundary_geom geography(MultiPolygon)` + `anchor_geom
  geography(Point)` kept by a `before insert or update of boundary, lat, lng`
  trigger (`st_makevalid` + `st_collectionextract(…, 3)` for the 11 Nextdoor
  seeds that are not valid OGC polygons), GIST-indexed, backfilled directly
  (not via the trigger, so `updated_at` is untouched). New RPC
  `match_community(p_lat, p_lng)` → the containing active polygon ordered by
  `kind = 'subdivision'` first then smallest `st_area`; if none, the nearest
  active community by boundary edge (KNN shortlist of 25 on `anchor_geom`)
  with `distance_m`. `listings` gains `community_match` (`boundary` /
  `nearest` / `manual`) + `community_distance_m` so the UI can tell a
  containment from a fallback. **Not yet applied** — `pnpm db:push` /
  `supabase db push` are blocked by the session's permission classifier;
  logic was validated read-only against production before writing the file.
- `lib/geo/find-community.ts` rewritten around the RPC (~40 lines, was
  ~150 of unstable_cache + JS ray-cast). Returns `{ …, match, distanceM }`.
  `(supabase as any)` cast kept — `@supabase/ssr`'s `createServerClient<Database>`
  collapses to `never` in this repo (the existing "stub generated types"
  convention); `database.types.ts` hand-edited for the new columns + RPC.
- `dashboard/listings/[id]/edit/actions.ts`: `updateListingAddress` writes
  `community_match` / `community_distance_m` with the auto-link;
  `updateListing` writes `community_match='manual'` only when the agent
  actually CHANGED `community_id` (the form always posts it back, so a
  blanket 'manual' would have relabelled every auto-link on first save).
- `scripts/admin/import-redfin-listing.ts` calls the RPC instead of a
  city-scoped JS PIP (that city filter was why in-polygon listings stayed
  unlinked).
- New `scripts/admin/relink-listings.ts` (dry-run default, `--apply`):
  re-matches every listing with coordinates, prints before → after with the
  match kind, skips `manual` picks. Re-run after any subdivision import.
- New `scripts/admin/backfill-community-county.ts` + `data/ga-counties.geojson`
  (159 Georgia counties, Census 500k, 75 KB): local PIP, no geocoding.
  **Ran with `--apply`: 8,679 / 8,679 communities with coordinates now have
  `county`** (52 distinct; Fulton 1,349, Cobb 1,310, Gwinnett 1,182, DeKalb
  771 …). The one row left null is `untitled-o5tela`, inactive, no lat/lng.
- `apps/web/biome.json` ignores `public/demos/**` — phase188's `data.js`
  was failing `biome check` on main (format).

**Decisions**: nearest-fallback over city/county stubs — a listing outside
every polygon links to the closest real community with the distance stored,
rather than to a synthetic "Fulton County" community that would never have
photos or amenities. The `nearest` label + distance is the honesty hook: the
UI can render "near X" instead of "in X" (not done in this phase — flagged).
Subdivision-first ordering is in the RPC, so a future county-GIS import
wins automatically wherever it overlaps a Nextdoor seed; no re-tagging.

**Learnings**: `supabase db query "<sql>" --linked` from `apps/web` works
for read-only SQL in this sandbox (stdin must be `/dev/null`); `db push`
does not. The worktree needed its own `pnpm install` before `tsx` ran.
Phase188's "6 true polygon gaps" was an artifact of the city-scoped
lookup — a full-table PostGIS test puts those points inside
`peachtree-corners-sunburst` / `st-ives`; the real gap count is smaller.

**Next steps**: owner (or an allowed shell) runs `pnpm db:push` from the
reference worktree; then `relink-listings.ts` dry-run → `--apply` and
report 18/18 linked with the boundary/nearest split. Then proposal 2
pilot: Fulton County GIS subdivision polygons → `kind='subdivision'`,
`boundary_source='arcgis'`, dry-run before any insert. Decide UI treatment
for `community_match='nearest'`.

## 2026-09-07 19:15 UTC — phase188: community coverage audit + map (Metro Atlanta MSA)

**Objective**: owner asked for a cold-start strategy to reach 100% community
coverage across Metro Atlanta (wiki/OMB definition: 29-county MSA) so every
listing links to a community, with builder/subdivision communities as the
preferred quality tier — plus a map of current coverage.

**Actions**:
- Audited the live DB (service-role REST, read-only): 8,680 communities
  (8,678 active; 8,679 `source='nextdoor'`, 1 agent), `kind='subdivision'`
  only 3, with video 1, with photos 0. `county`/`zip`/`builder` columns still
  100% NULL. Listings are down to 18 active (post-FMLS cleanup), all with
  lat/lng, only 4 with `community_id`.
- Point-in-polygon'd all 8,679 centroids against the 29 MSA county polygons
  (Census cartographic boundaries via plotly's counties GeoJSON): every county
  has ≥1 community (min: Jasper 2), 8,026 in-MSA, **652 outside the MSA**
  (the 2026-07 Nextdoor city list included outer towns). Core 5 hold 4,856.
- Tested the 14 unlinked listings against same-city boundaries: **8 fall
  inside an existing polygon** (never matched — the PIP path only runs on
  dashboard address-save, and the Redfin importer scopes by city string),
  **6 are true polygon gaps**. MLS `neighborhood` string is null on 13/14, so
  name-matching can't rescue this batch.
- Built `apps/web/public/demos/community-coverage/` (static MapLibre page,
  Carto basemap, light+dark): county choropleth by community count, 8.7k
  seed dots, subdivision diamonds, listing pins ✓/✕ by linked state, county
  table + stat tiles. Data snapshot embedded (`data.js`, 499 KB).

**Decisions**: proposals delivered in chat as a coverage pyramid — (1) free
pipeline fix first: PIP backfill + nearest/city/county fallback guarantees
100% link coverage with zero new data; (2) county GIS platted-subdivision
polygons (`boundary_source='arcgis'` already in the check constraint) as the
subdivision backbone, core-5 pilot first; (3) listing-driven stub creation
from the MLS subdivision field (FMLS legality caveat); (4) curated builder
directory as the quality tier. County backfill for all 8,679 rows can be done
free with local PIP against Census boundaries — the $40 Google Geocoding
estimate in the old spec is unnecessary.

**Learnings**: even 8,679 polygons don't tessellate — Nextdoor neighborhoods
leave gaps that ~1/3 of real listings fall into; 100% coverage must come from
a fallback hierarchy, not more polygons alone. Also `preserveDrawingBuffer`
is required for headless screenshots of MapLibre canvases.

**Next steps**: owner picks which proposals to green-light; quick wins
available immediately (backfill `communities.county`, re-run PIP matching for
the 8 linkable listings, decide fate of the 652 out-of-MSA rows).

## 2026-09-07 12:40 UTC — phase187: Saved tab loses its segment chips

**Objective**: owner: 「Saved tab - remove home and community filtering sub
tabs」.

**Actions**: `apps/mobile/app/(tabs)/saved.tsx` only. The Homes · N /
Communities · N (/ Areas · N) chip row is gone, along with the `Segment`
type, `SEGMENT_LABEL`, the `segment` state, the per-segment counts and the
per-segment empty text. The tab now renders every saved item — homes,
communities, bookmarked city cards — as one flat list in store order. The
Compare card keeps its own gate (`listingCount >= COMPARE_MIN`) and now shows
whenever enough homes are saved, since there is no Homes segment to scope it
to; the compare picker still ticks listing rows only (`picked` stays
`undefined` for community/area rows, which keep navigating on tap).

**Decisions**: read the ask as *remove the segmentation entirely*, not "hide
two chips and keep Areas" — a single remaining chip would be a label, not a
filter. The whole-tab empty state (sign-in prompt / "Back to feed") already
covers the zero-items case, so the per-segment empty strings had no caller
left and went with the chips.

**Verification**: `pnpm typecheck` clean, `pnpm lint` clean (8 pre-existing
warnings in other files), `pnpm test` 582/582 in `apps/mobile`.

**Next steps**: owner reviews on the phone via Metro from the reference
worktree.

## 2026-09-07 11:27 UTC — phase186: the journey moves off the Search tab and onto You

**Objective**: owner: 「Search tab - move your journey to you tab」.

**Actions**: `apps/mobile/app/(tabs)/search.tsx` loses the "Your journey"
layer chip and everything it drove — the `journeyOn` state, the green
familiarity pins, the per-row `score%` / unknown-dims suffixes, and the
sheet title's "Your journey" mode (it now reads "All areas" or the query).
`apps/mobile/app/(tabs)/you.tsx`'s area-familiarity section — which already
draws the SAME `familiarityFor` data — is retitled from "HOW WELL YOU KNOW
EACH AREA" to **"YOUR JOURNEY"**, so the journey now has exactly one face and
it is on the You tab. Header comments in `search.tsx`, `you.tsx` and
`lib/area-familiarity.ts` updated to match.

**Decisions**:
- Read "move" as *remove from Search + name the existing You-tab section
  after it*, not as building a map into the You tab — the You tab section
  has shown the identical familiarity data (score, cards seen, unknown dims)
  since phase D, and each row already deep-links to the Search map via
  `?focus=`. Nothing needed porting; the chip was a second face of the same
  data on a surface that should just search.
- The familiar-first sort of the Search sheet's city list STAYS. It's the
  §4.3 "in your journey first" rule and doesn't paint any journey UI; it
  just orders the list, so `familiarityFor` is still imported there.
- `unknownDimsLabel` import, chip styles (`chipRow/chip/chipOn/chipLabel/
  chipLabelOn`) and `rowFam` removed as orphans of this change.

**Verification**: mobile `tsc --noEmit` clean, vitest 55 files / 582 tests
green, `biome check .` 0 errors / 8 warnings — and the 2 warnings in
`search.tsx` were confirmed present on the origin/main version of the file
(both `useExhaustiveDependencies`), so the baseline is untouched. Web not
touched.

**Next steps**: none — owner reviews on device.

---
## 2026-09-07 06:55 UTC — phase183.6: the Map pin was 20% over its own spec

**Objective**: owner: 「Map icon is too big, make it a bit smaller?」

**Cause**: the pin was sized by its HEAD, not by the icon. `PIN_HEAD = 18`
matched the handoff's "18 × 18", but the teardrop's tip hangs √½ of the head's
width below the head's centre — so the drawing came out **21.7 tall**, 20%
over the spec. On a real 3× screen an outlined teardrop that size also reads
heavier than it did in the mockup it was measured against.

**Actions** (`components/feed/FeedHeader.tsx` only):
- `PIN_SIZE = 18` is now the whole icon and `PIN_HEAD = PIN_SIZE /
  PIN_TIP_RATIO` (14.9) is derived from it. The icon is 15 × 18 where it was
  18 × 21.7.
- Stroke **1.75 → 1.6**, dot **4.5 → 3.75**. Holding 1.75 while the drawing
  shrank would have made the stroke 9.7% of the icon's height instead of 8% —
  i.e. *heavier*, which is the opposite of the ask.
- `theme/feed-header.test.ts` now asserts the 18 is the icon's HEIGHT
  (`height: PIN_SIZE * k`, and `PIN_HEAD` derived), which is the mistake worth
  pinning: it is invisible in the constant and only shows on a device.

Nothing else moved — the pill is still 84 × 44 (the group inside it is 76 wide
at the new size, so `minWidth` still governs) and the header's height is
untouched, so the card did not move.

**Verification**: `tsc --noEmit` clean; vitest 55 files / **582 tests**;
`biome check .` 0 errors / 8 warnings (baseline). Rendered the old and new
pills side by side in WebKit at 8× before committing.

## 2026-09-07 06:30 UTC — phase183.5: the type row goes, the band closes, and communities get their map back

**Objective**: owner on device: 「Remove the community, home and tradeoff text
from header - the empty space between card and header is too big, move header
a little down?」 and 「Don't see the map button for communities with videos
why?」

### The Map button on community cards — a server bug, not a header bug

`CommunityCardV3.geoUnitId` has been declared since the geo contract landed
and **was never populated**: `apps/web/app/api/mobile/feed/route.ts` derives
`geoUnitId` for LISTINGS (`citySlug(city, state)`) and passes community rows
through untouched. Confirmed against production — 30 communities in the served
pool, **0 with a `geoUnitId`** — so `feedHeaderModel` found no map target and
correctly drew no button. Nothing to do with video; video-bearing communities
are simply the ones he is looking at.

Fixed at the source: `PoolCommunityDTO` now declares `geoUnitId` and the route
sets it from the community's own city/state with the same `citySlug`. The
formula matches `city_geo_units`' SQL id expression exactly (`'city:' ||
trim(both '-' from regexp_replace(lower(city||'-'||state), '[^a-z0-9]+','-'))`)
— checked rather than assumed, because a mismatch would have shown a Map
button that focuses nothing. Side effect worth having: a right-swipe on a
community card now credits its city, which it never did.

### The header: two rows, moved down, and the band closed

- **The type row is gone** — `typeLabel` and `TYPE_LABEL` are out of
  `lib/feed/feed-header.ts` entirely, not just hidden. `kind` stays, for the
  one behavioural branch that reads it (a trade-off's context row is not the
  scope control).
- **`PAD_TOP` 12 → 20** — the 「move header a little down」 half.
- The header is **86** where it was 98.

**The part worth writing down**: removing the row does not close the band by
itself, it OPENS it. The card is capped at the film's shape, so every point
the header hands back to the stage returns as slack — and under phase182's
even split, half of it lands straight back above the card. Handing the type
row's whole 20 to the stage would have made the complaint worse. So two more
changes:

- `CARD_INSET.top` **16 → 12** (the 16 came from the handoff, where it sat
  under an uppercase label; the title's own line wants to be closer), and
- `SwipeStack`'s `restTop` **/2 → /3** — a third of the slack above the card,
  two thirds below. That reverses part of the 2026-09-06 「balance the empty
  space above and under card」 call, deliberately: that balance was decided
  when the header was ONE line.

Both ends cannot be small. The stage has ~73pt spare on a Pro Max whatever the
header does, and the only question is where it sits; below the card it lands
against the tab bar, which is where a page's leftover paper belongs.

**What it comes to** (computed from the shipped modules):

    device              header   above    card       below   crop
    13 mini                83      30   343×501        52    0.0%
    14 / 13                86      34   358×522        59    0.0%
    15 / 16                87      31   361×527        53    0.0%
    16 Pro                 89      32   370×540        56    0.0%
    15 Pro Max             95      37   398×581        65    0.0%
    16 Pro Max             95      39   408×595        69    0.0%
    SE 3 (unsupported)     83      12   343×474        16    5.2%

On his Pro Max the gap from the **last line of text** to the card was 64
(title → type row → 16 → half the slack) and is now **37**. The band below
grew 44 → 65.

**Bonus**: the SE's crop went 8.3% → **5.2%**, the best since the wordmark
returned, because the header lost 12 points. `card-aspect.test.ts`'s guard is
tightened back to 6% so it tracks the real value instead of sitting slack.

**Verification**: mobile `tsc --noEmit` clean, vitest 55 files / **582
tests**, `biome check .` 0 errors / 8 warnings (baseline). Web `tsc --noEmit`
clean, vitest 83 files / **874 tests**, biome clean on both changed files.
`theme/feed-header.test.ts` gains an assertion that the type row is gone by
name (`TYPE_ROW` undeclared, no `typeLabel`, no "HOME TOUR" in the source).

**Next steps**: owner reviews on device. If the top band still reads long,
`restTop` is one character (`/ 4` → 30 above, `/ 5` → 27); if the band UNDER
the card reads long instead, the honest lever is a wider card, which costs
upsampling against the 1080px film (the 15% guard in `card-aspect.test.ts`
already sits at 1.13 on his phone).

## 2026-09-07 05:46 UTC — phase185.1: competitor market research, delivered as a hosted page

**Objective**: owner asked for market research on Percho's competitors, run
through the local `codex` CLI, and then asked to see the full report as a web
page.

**Actions**:
- Ran `codex exec` non-interactively with `-c tools.web_search=true`, read-only
  sandbox, `-C /tmp`. Report written to `/tmp/percho-competitor-research.md`
  (562 lines). Not committed — the HTML page is the artifact.
- Added `apps/web/public/demos/competitor-report/index.html` — the full report
  rendered as a static page, matching the `buyer-study-summary` design system
  (same CSS custom properties, light/dark toggle, `noindex,nofollow`).

**Decisions**:
- Owner asked for GPT-6. It is not available: `gpt-6`, `gpt-6-codex`,
  `gpt-6-thinking`, `gpt-6-mini` and `gpt-5.2-codex` all return HTTP 400
  `"not supported when using Codex with a ChatGPT account"`. The only model
  this account can reach is the default `gpt-5.6-sol`, which is what produced
  the report. Told the owner rather than silently substituting.
- Threat level is encoded as a **four-pip ordinal meter with the written label
  always present**, not as status colors. Running the four status hexes through
  `validate_palette.js` failed the categorical gate — `#fab219` (warning) vs
  `#ec835a` (serious) measure ΔE 13.6 normal-vision, below the 15 floor, and
  both sit under 3:1 on the light surface. Filled-pip count carries the value,
  so hue carries nothing alone. Single-hue series (`#2a78d6` light /
  `#3987e5` dark) passes all checks in both modes.
- Pricing chart covers only vendors that publish list prices; quote-based
  vendors are named in the caption as excluded, so the gaps are not read as
  "free".

**Issues**: headless-Chrome screenshots ignored the `#pricing` fragment jump
(smooth scrolling never settled), so section-level verification was done by
rendering temp copies with the other sections hidden.

**Learnings**: the substantive finding is that no reviewed US product combines
neighborhood-led film + culturally adapted (not translated) multilingual
variants + Rednote/WeChat packaging + agent lead attribution in one workflow.
Homes.com owns most ingredients but confines community video to paid
new-construction packages. Redfin's Nov-2025 multilingual conversational search
means "multilingual discovery is unserved" is no longer a defensible claim on
its own.

**Next steps**: none pending. Page is at `/demos/competitor-report/`.

---
## 2026-09-07 05:35 UTC — phase183.4: the five decisions land on iOS

**Objective**: owner on `/demos/feed-header-v4`: 「Go ahead and implement
this」. The five decisions recorded in phase183.3, in the app.

**Actions**:
- **`lib/feed/feed-header.ts`** (decision 2) — line one is now ALWAYS
  `area › city`. A home whose community the pool cannot resolve keeps the city
  on line one AND promotes it to line two: `Atlanta metro › Canton` over
  `Canton`. Same rule applied to the city card and to the scope fallback, so
  there is one spelling of the trail in the app rather than three. Reverses
  phase183's suppress-the-duplicate rule; temporary by design — the backfill
  turns line two into the community with nothing else moving.
  `titleAccessibilityLabel` collapses the repeat so VoiceOver does not read
  "Canton, Atlanta metro › Canton".
- **New `theme/header-scale.ts`** (decision 5) — `headerScale(width)` =
  `clamp(width / 390, 0.94, 1.10)`, rounded to three places. Pure and
  RN-free on purpose: `theme/card-aspect.test.ts` executes it to model the
  header's real height per device, and `theme/header-scale.test.ts` unit-tests
  the clamp (6 tests). The clamp is the point — unbounded, an iPad in
  compatibility width would carry a 70pt serif.
- **`components/feed/FeedHeader.tsx`** — decisions 1, 3, 4, 5:
  · the title slot is `flexShrink: 1` with NO grow, so the Map pill follows
    the name instead of sitting on the header's right edge (Yoga defaults
    `flexShrink` to 0, so both halves are explicit);
  · `paddingTop: 12 * k`;
  · `adjustsFontSizeToFit` + `minimumFontScale={0.5}` back on the title, and
    its explicit `lineHeight` removed — iOS clips auto-shrunk text against
    one, and the row's `minHeight` is what fixes the header's height, so a
    name at 18pt leaves the card exactly where a name at 36 does;
  · the `StyleSheet` became a `sheet(k)` factory memoised per scale, since
    every dimension is now × k.
- Tests: `feed-header.test.ts` re-expects the city on both lines (+1 for the
  VoiceOver collapse); `theme/feed-header.test.ts` gains three assertions —
  `PAD_TOP` is 12, the title slot shrinks but never grows, and **every numeric
  style value in the sheet reads `<CONST> * k`** (a regex over the factory's
  body with a whitelist for 0 / opacity / zIndex — a number that forgot its
  `* k` is the one mistake this shape makes easy). `card-aspect.test.ts` now
  models the header per device through `headerScale`.

**The geometry that results** (computed from the shipped modules, not typed):

    13 mini    k 0.962  header  94  title 34.6  pill 81×42  card 343×501  whole
    14 / 13    k 1.000  header  98  title 36.0  pill 84×44  card 358×522  whole
    15 / 16    k 1.008  header  99  title 36.3  pill 85×44  card 361×527  whole
    16 Pro     k 1.031  header 101  title 37.1  pill 87×45  card 370×540  whole
    15 Pro Max k 1.100  header 108  title 39.6  pill 92×48  card 398×581  whole
    16 Pro Max k 1.100  header 108  title 39.6  pill 92×48  card 408×595  whole

Every shipping body still draws the film uncropped, with 20–31pt of slack on
each side of the card.

**Issues**: the **iPhone SE (375×667) now crops 8.4%** of the film's sides, up
from 6.7% — the 12pt of room plus the scale. Flagged to the owner with the
number before he approved, and the guard in `card-aspect.test.ts` moves 7% →
8.5%. The SE is not in the shipping lineup (it starts at the 13 mini, which is
unaffected); the escape hatch, if it ever matters, is dropping `PAD_TOP` on
short screens.

Second, smaller: at k < 1 the 44pt rows become 42, under the §0.5 touch floor.
Rather than break the proportion the owner approved at one width, the points
come back as `hitSlop` on the title and the Map pill.

**Verification**: `tsc --noEmit` clean; vitest 55 files / **581 tests**;
`biome check .` 0 errors / 8 warnings (baseline). Per-device geometry above
computed by running `card-frame.ts` + `header-scale.ts` directly, and it
matches `/demos/feed-header-v4`'s measured frames to the point.

**Next steps**: owner reviews on device — this is the first build where the
Map pill is tappable, so the two destinations (community page, Search map
focused on the city) are worth a tap each. If a name at the 0.5 floor reads
too small, the honest next move is a narrower pill rather than a lower floor.

## 2026-09-07 05:10 UTC — phase183.3: the header's five decisions, and the final demo for them

**Objective**: owner picked from `/demos/feed-header-v3` and asked for a final
demo of the three card types before anything lands on iOS.

**His decisions, verbatim** (these are the spec now):
1. 「Map follows the name (my recommendation)」 — option A. The pill sits 12pt
   after the chevron at any name length; it is no longer pinned to the right
   edge.
2. 「for home tour without community, show city twice for now」 — line one
   keeps `area › city` and line two borrows the same city until the community
   backfill lands. This REVERSES phase183's suppress-the-duplicate rule
   (`feed-header.ts` currently drops the city from line one and promotes it).
3. 「12 pt above "Atlanta metro"」.
4. 「Don't cut the community name if it is too long, use smaller size
   instead」 — shrink-to-fit comes back, which reverses phase183.1's removal
   of `adjustsFontSizeToFit`. See the floor below.
5. 「Others use your recommendations as well」 — so the open question (fixed
   vs proportional type) resolves to **scaled**: every header number × screen
   ÷ 390, clamped to 0.94–1.10. That is what holds the name-to-Map proportion
   he approved on the mini and the Max instead of only at 390.

**Actions**: `apps/web/public/demos/feed-header-v4/index.html` — the final
demo. Three card types, then the states inside them (city-twice fallback, a
name that has to shrink, a home with no resolvable place, and the city card as
the fourth type the deck can serve), then the same header on 375 / 390 / 428.
Same measured-geometry machinery as v3, plus a `fit()` that computes the
name's size the way the phone will: measure at full size against the room the
row actually leaves after the chevron and the pill, scale down, never past the
floor. **Still no `apps/mobile` change** — he approves this page first.

**The shrink floor, picked off real data**: 0.5 (18pt at 390). At full size
the row fits about 13 characters, so almost every real name shrinks a little —
"Bellmoore Park" lands at 36.2 of 39.5 on his phone. The longest community
name the mobile feed serves today is **24 characters** ("1250 West Powder
Springs", sampled live off `/api/mobile/feed` — 21 unique communities in the
served pool, median 13, p90 19), which needs 54% and so clears the floor.
"Amberfield at Peachtree" (23) renders whole at 23.2pt where the previous 0.6
floor truncated it. Below 50% an ellipsis is still the answer — an 18pt title
under a 14pt breadcrumb has stopped being a title.

**Learnings**: two demo bugs worth remembering. `zoom` on a frame scales
`getBoundingClientRect()` but not `getComputedStyle()`, so a measured layout
has to divide only the rects. And a header demo must not borrow a rendered
CARD as placeholder art — a screenshot of the Aberdeen community card sat
under a "Bellmoore Park / COMMUNITY TOUR" header and read as a data bug; bare
Storage cover photos say nothing and are the right stand-in for a film.

**Next steps**: on his go, `components/feed/FeedHeader.tsx` +
`lib/feed/feed-header.ts`: drop `flex: 1` from the title slot (1), keep the
city on both lines (2 — a change in the pure model, and its tests), add
`paddingTop` (3), restore `adjustsFontSizeToFit` with `minimumFontScale`
0.5 (4), and multiply the header's constants by a `useWindowDimensions`
factor (5). `theme/feed-header.test.ts` and `theme/card-aspect.test.ts` both
move with it — the header becomes 98 at 390 and 107 on his 428, so the
SE-class crop needs re-measuring before that lands.

## 2026-09-07 04:40 UTC — phase183.2: a demo for the header's three open questions (no app change)

**Objective**: owner, after phase183.1: 「community name和map占的比例参考demo 如果
需要可以等比例放大一些在不同的设备上 map button应该和community name在同一行呼应
而不是不相干的两个部分display 给我做个demo看看我批准后再实现在ios上」 — plus a
restatement of the content rule (line 1 area › city, line 2 community, city as
the stand-in until the backfill) and 「area和city上面有些空间 不是完全顶头 但是也
不要太大」.

**Actions**: `apps/web/public/demos/feed-header-v3/index.html` (+ a copy of
DM Serif Display, the folder convention). **No `apps/mobile` change** — he
asked to approve first.

The page is not a drawing. Each phone is its own logical size, the header's
height is MEASURED after it renders, the card is dropped 16pt under it at the
film's own shape and the leftover paper is split evenly — `card-frame.ts` +
`SwipeStack`'s `restTop`, reimplemented in ~20 lines of JS — and every frame
prints its real numbers (`428×926 · header 98 · card 396×578 · film whole`).
That is the same trick `feed-header-v2` used and it is why the demo can be
trusted about geometry rather than only about looks.

**The three questions it asks**:
1. **Where Map sits.** A: it follows the name (12pt after the chevron, one
   left-to-right object). B: pinned to the header's right edge — what the
   redline sheet drew and what is on his phone. C: follows the name with the
   pill drawn at 38 instead of 44 so it sits inside the text line. Each is
   shown twice, with "River Green" and with the bare "Canton", because that
   is the whole point: with a long name A and B are nearly identical, and on
   the CITY FALLBACK — most homes today — B leaves ~150pt of nothing between
   the word and the button. That gap is the 「不相干的两个部分」 he reported.
   Recommending A.
2. **Room above the area line**: 8 / 12 / 16. Recommending 12. Every point
   comes out of the paper around the card, not out of the card.
3. **Fixed vs scaled type**: 36pt everywhere, or every header number × screen
   ÷ 390 so the proportions hold on the mini and the Max. His 「等比例放大」
   is the second; shown on 375 / 390 / 428 both ways.

Row 4 draws every state the feed can actually produce, including the two ways
to spell the city fallback (line 1 area alone, vs line 1 keeping "› Canton"
and line 2 repeating it — the second is on the page precisely so he can
reject it), the trade-off with no Map, and a name too long to fit.

**Decisions / learnings**: card art in a header demo has to be a BARE
photograph. The first pass reused `feed-page-v2/card.jpg`, which is a
screenshot of a community card — so a frame captioned HOME TOUR had
"COMMUNITY / Aberdeen" burned into the art under it, and cropping past the
foot clipped the card's own place pill. A raw community cover from Storage
fills the frame the way a film does and says nothing.

**Verification**: rendered headless at 1400×6200 and read back row by row —
the header clears the status bar (the first pass had `.hdr` with no `top` and
it landed on the clock), the amber slack bands and per-frame numbers agree
with `theme/card-aspect.test.ts`'s model, and the SE-class mini still draws
the film whole at header 98.

**Next steps**: he picks 1/2/3 (or sends them back), then it is a small edit
to `components/feed/FeedHeader.tsx`: option A is dropping the `flex: 1` from
the title slot, the top space is one `paddingTop`, and scaling is one factor
applied to the header's constants from `useWindowDimensions`.

## 2026-09-07 04:05 UTC — phase183.1: the header measured off the demo, not off the table

**Objective**: owner on phase183: 「The content is there but layout and size
doesn't look right, attaching the demo, you should follow this」 — three phone
screens (home tour / community tour / trade-off) with the header drawn.

**How the demo was read**: the attached PNG is 1284×2778 and holds three 390pt
phones side by side, so it renders **one pixel per logical point**. Cropped
the first phone's header at 4× and measured against that: the Map pill comes
out **86 × 44.5** (spec 84 × 44 ✓), the header's left inset **24.5** (`GUTTER
+ 8` ✓), the context row's cap height 8.75 → **12-13pt** ✓, the type label's
8.75 → **11pt** ✓. Everything matched except the one thing he noticed.

**Actions** (`components/feed/FeedHeader.tsx` only):
- **Title 30/36 → 36/42.** The demo's title has a 25pt CAP height; DM Serif
  Display's caps are 0.70 em, so the face is 36, not the handoff table's 30.
  Cross-checked by ratio rather than by absolute pixels — title width ÷ header
  inset is 8.1 in the demo and 8.0 in a render of the new values, which is the
  one measurement that survives both files' scaling. The ROWS did not change,
  so the page's 86 + 16 budget above the card is untouched and the card's
  geometry is exactly where phase183 left it.
- **`adjustsFontSizeToFit` removed.** Most likely the real cause of "size
  doesn't look right": inside a `flexShrink: 1` row iOS measures twice — the
  row shrinks the text box, then the text shrinks to fit the box it was handed
  — so a title with room to spare can still land near the 0.7 floor (21pt),
  which is 40% under the demo. Now a fixed 36 with an end ellipsis, which is
  also what the handoff §6 asked for. Reverses phase183's decision 4.
  Measured fit: "River Green" is ~200 of the 226pt the row gives it on a 390
  screen, so the canonical case has room; a name like "Peachtree Corners"
  truncates.
- **The pin is one box, not four.** Was a ring + a dot + two 20°-leaning bars,
  which leaves a visible notch where the legs meet the head. The demo draws a
  teardrop, and a teardrop is a square with three corners rounded to 50% and
  the fourth sharp, turned 45° (`borderBottomRightRadius: 0` + clockwise 45°).
  18 wide, 21.7 tall, 1.75 stroke, dot on the head's centre. Verified by
  rendering the same box model in WebKit before writing it — the first attempt
  put the sharp corner on the LEFT, which is worth knowing: CSS corner order
  is TL, TR, BR, BL.
- **The ▾ came off the context row.** The demo draws that row as plain grey
  text. The row still opens `ScopeSheet` (see phase183 decision 2 — it is the
  feed's only entry to it), so the job stays and the marker goes.
- Chevron box 12 → 14, arm 7 → 9: the demo draws it ~9 × 14 beside the bigger
  title.
- `theme/feed-header.test.ts`: asserts the teardrop's three round corners +
  one sharp + the 45°, and asserts `adjustsFontSizeToFit` is ABSENT.

**Learnings**: the handoff markdown and the demo screens disagreed, and the
markdown lost. A rendered mock at 1px-per-point is a measurable artifact —
crop it at 4× and read cap heights, then convert with the font's own
cap/em ratio. Anchor on a RATIO between two things visible in both images
(title width ÷ header inset) rather than on absolute pixel counts, because
neither file's scale is trustworthy to better than ±5%.

**Verification**: `tsc --noEmit` clean; vitest 54 files / **572 tests**;
`biome check .` 0 errors / 8 warnings (baseline). Header composition and the
Map pill rendered in WebKit at the new numbers and compared against the demo
crop side by side.

**Next steps**: owner reviews on device again. If a long community name
truncating is the next thing he dislikes, the fix is an `onLayout`-measured
width for the title rather than `adjustsFontSizeToFit` — the double-measure is
why the property misbehaves in a flex row.

## 2026-09-07 03:39 UTC — phase183: the above-card header becomes the card's place, with a Map button

**Objective**: implement the owner's "above-card header" handoff
(`percho-header-redlines.svg` + the companion markdown) for home tour,
community tour and trade-off cards. Map control **B** — an outlined pin and
"Map" in a pale sage pill — is the selected variant.

**Actions**:
- New pure `apps/mobile/lib/feed/feed-header.ts` (`feedHeaderModel`, 15
  tests): ONE read of the active card → context row, title, type label, and
  the two destinations as DATA (`titleSlug`, `mapUnitId`), not closures, so
  the §5 mapping rules are unit-testable. It absorbs `place-trail.ts`, which
  is deleted with its test: the trail left the card as the chain's unwritten
  last link, and the handoff writes that link as the TITLE.
- New `components/feed/FeedHeader.tsx` — 18 + 4 + 44 + 4 + 16 = **86**, then
  `CARD_INSET.top`'s 16, then the card. Inset 8 from each card edge
  (`GUTTER + 8` = 24). Title DM Serif 30 in #181D1A; context 13/18 in
  #6B726D; type label 11/16 caps in #08685D; Map pill 84×44 r22 on #E0E9E3,
  pressed #D2E0D7. New `feedHeader` token block in `theme/tokens.ts`,
  transcribed verbatim from the sheet (the repo's one-palette-per-redline
  convention, alongside `redline` and `explore`).
- `PlaceHeader.tsx` deleted — the wordmark and the communities count go with
  it, both removed by name in the handoff ("Do not introduce a Percho
  wordmark, community count, floating overlay on the video, or another
  map-button variant"). `theme/place-header.test.ts`'s source assertions went
  with the component; its `metroStatsLine`/`scopeStatsLine` unit tests moved
  to `lib/feed/place-stats.test.ts`, next to the module they test.
- `feed.tsx`: one `feedHeaderModel` memo off `deck[activeIndex]` replaces the
  `trail`/`trailUnit`/`scopedUnit` memos. Title → `/community/[slug]`; Map →
  `/(tabs)/search?focus=<geoUnitId>`, the Search map's existing param. No new
  route, no geocoding call, no new dependency.
- Tests: `theme/feed-header.test.ts` (10, new) pins the row budget, the pill's
  84/44/22, the pin's 18/1.75, `minHeight` growth, one-line-only, three
  separate Pressables, and that no wordmark or count comes back;
  `theme/card-aspect.test.ts` re-modelled at 86; `theme/feed-chrome-layout.
  test.ts` retargeted at the new component.

**Decisions**:
1. **The wordmark and the count are gone** — 16 hours after phase182.1 put
   them back at the owner's request. The handoff forbids both by name and is
   the newer instruction, so it wins; flagged to the owner in the same breath
   as the merge, because if the sheet came from the first agent rather than
   from him, this is the line to reverse. `metroStatsLine` is deliberately
   left in `place-stats.ts` with no caller for exactly that reason.
2. **The context row keeps the scope sheet.** The handoff calls that row
   "explanatory text, not a feed filter", but the line it replaces was the
   only control that opened `ScopeSheet` anywhere in the feed
   (`ExhaustedCard`'s "Adjust my scope" only appears on a dry deck). Shipping
   a build with no way to change scope is worse than one extra ▾, so the row
   carries the same job and the same glyph it did yesterday. One prop and one
   glyph to reverse. NOT a control on a trade-off ("Your preferences" is not
   a place) or on a home with no resolvable location.
3. **A fourth card kind.** The handoff names three; the feed has four. The
   CITY card gets the same geometry and a `CITY TOUR` label rather than an
   exception in the layout. A fifth state, `scope`, covers the empty deck.
4. **The title shrinks before it truncates.** The handoff says one line with
   an end ellipsis; the owner said 「If too big to fit in, just use smaller
   size」 one day earlier about the same slot. So 30 is the ceiling,
   `minimumFontScale` 0.7 the floor, and the ellipsis is what happens below
   it.
5. **The pin is composed from `View`s**, not an SVG or a glyph: the icon
   font's 14-glyph subset has no pin and `react-native-svg` is not a
   dependency (adding one is a CLAUDE.md §8 conversation). Ring + dot + two
   capped bars leaning 20° off vertical — 45° arms never reach a ring this
   size, so the rotated-square "V" the card's filled pin uses would stick out
   past the head. Geometry checked by rendering the same box model to SVG
   before writing it.

**Issues**: two, both real:
- **The SE crops ~1.6% more film.** The header is 86 where the old one was 78,
  and the iPhone SE's stage was already the binding constraint: side crop goes
  ~5.1% → **~6.7%**. `theme/card-aspect.test.ts`'s guard moves 6% → 7%. Every
  screen in the shipping lineup (13 mini and up) still draws the film
  uncropped, and the card's WIDTH and the film's crop on those bodies are
  unchanged; what does move on them is the card's top, by ~4pt, because the
  stage is 8pt shorter and `SwipeStack` centres the card in it. The handoff's
  "card top must match before/after" cannot hold literally while the header's
  height changes at all — the card is derived from the stage, not anchored to
  a fixed slot.
- **A latent bug in the community lookup, now fixed.** The wire sends a
  listing's `communityId` as the community's SLUG
  (`apps/web/app/api/mobile/feed/route.ts`) while a pool community's own `id`
  is the row's uuid; `place-trail.ts` compared against `id` alone, so a home's
  community could never resolve even when the data was there. The new module
  matches either spelling — the same fix the server already carries for liked
  community ids. So some home tours may now title the COMMUNITY where
  phase182 titled the city.

**Verification**: `tsc --noEmit` clean; vitest 54 files / **572 tests**;
`biome check .` 0 errors / 8 warnings (baseline). The Map pill and the full
header composition were rendered to SVG at the handoff's own numbers and
eyeballed before implementation — the pin's tail tilt came out of that. Not
verified on device: the RN suite runs no renderer, so the owner's phone is the
first place this is seen.

**Next steps**: owner reviews on device. Three things to look at, in order:
the wordmark's absence (decision 1), the pin at 18pt in the pill, and whether
a 30pt serif title over a 13pt trail reads right — stepping the title down is
a one-number change.

## 2026-09-07 03:33 UTC — phase184: repo-wide cleanup — dead code out, the two Nearby panels become one, the logs get readable

**Objective**: owner: "regular cleanup and refactoring. Delete anything that is
not used anymore, refactor the logic so it becomes more readable and scalable,
also compress the devlog and release notes as well." Scope agreed up front:
dead code + structural refactor (not the 213-cast type-debt sweep, which was
offered and deferred); `app/internal/` deleted; DEVLOG rotated **and**
September condensed; RELEASE tightened throughout. Branch
`phase184/repo-cleanup`.

**Baseline** (measured before touching anything): typecheck clean, 874 web +
556 mobile tests green — but **`pnpm lint` was red on main**: 2 format errors
in `app/api/research/responses/route.ts` and
`lib/zod/__tests__/research-response.test.ts`, from `359d6f24` onward. The §9
gate had been failing on `main` and nobody was reading the exit code.

**Actions**:

*Dead code* (knip in both apps, every hit cross-checked with a repo-wide grep
that includes `scripts/` and `apps/mobile`, because knip only sees one
workspace at a time):
- **14 files deleted** in `apps/web`: 9 unrendered components
  (`NearbyRadiusPref`, `AdminGenerateNearbyButton`, `PhotoReviewClient`,
  `CopyLinkButton`, `DashboardMetrics`, `HubDetailShell`, `CategoryPicker`,
  `CommunityMarketingPanel`, `SocialCopyPanel`), `lib/analytics/listing-stats.ts`,
  `lib/auth/role.ts`, `lib/poi/admin-tag-action.ts`, and
  `lib/analytics/__tests__/listing-stats.test.ts` — **byte-identical** to
  `entity-stats.test.ts`, so 9 assertions ran twice and neither copy tested
  `listing-stats.ts`.
- **`lib/log.ts` deleted.** CLAUDE.md §6 and ARCHITECTURE.md both point at it
  as *the* logger; it had **zero importers**, while 118 call sites use
  `console.warn`/`console.error` directly. The rule was describing a file
  nobody used. §6 now says what the code does.
- **117 unused exports resolved**: 84 lost the `export` keyword (still used
  in-file), 33 deleted outright with their doc comments and private helpers.
  Cascade orphans went too (`listBucketVideos`, `setPoiStatus`,
  `CreateCommunityInput`, `SavedListingRow`, …).
- Server actions with no callers deleted: `createCommunity`, `addSchool`,
  `deleteSchool`, `addPoi`, `deletePoi`, `updateCommunityVideo{Visibility,Category}`,
  `deleteCommunityAction`, `fetchLikedCards/CommunitiesAction`,
  `set{Listing,Community}PoiStatus`, `list{Listing,Community}BucketVideos`.
- `apps/web/app/internal/` (5 files): its `listMd()` read
  `docs/meetup-kw-atlanta/` and `docs/ken-burns/`, both long deleted, so two of
  three sections rendered empty; it also `<video>`-linked `/demo/*.mp4`, removed
  in July. Deleting it freed `react-markdown` + `remark-gfm`, its only users.
- Unused deps: `framer-motion` (web), `whatwg-fetch` (mobile), plus the two
  above. `apps/web/pnpm-lock.yaml` deleted — a stray second lockfile from the
  monorepo split, last touched in `1e518c72`.
- `public/avatars/preset-{1,2,3}.svg` (avatars come from the Storage bucket).
- `scripts/`: `fmls-scrape/` (retired per `docs/mls-integration/go-live.md`),
  `k12/` (hardcodes `/home/ubuntu/Percho-ws4/.env.local`, a dead EC2 box;
  superseded by `admin/import-ga-schools.ts`), `percho-render-worker.service`
  (systemd, wrong OS — the worker is a launchd agent), 4 finished one-shot
  backfills, `bgm/_archive/` (4 empty dirs), `prototypes/photo-motion/`,
  `spikes/seedance-community-video/` (shipped as `lib/ai/openrouter-video.ts`).
- `apps/web/tsconfig.json` excluded `scripts/render-logo-cover-preview.ts`,
  which does not exist; `.gitignore` had 6 lines for deleted paths.

*Structural*:
- **`CommunityNearbyPanel` + `ListingNearbyPanel` → one `NearbyPanel`.**
  1,109 and 1,095 lines that, once the entity noun was normalised away,
  differed by **62 lines out of ~1,046**. New
  `app/_components/nearby-panel/`: `scope.ts` (the client-side twin of
  `lib/poi/entity-scope.ts` — one descriptor per entity, 151 lines),
  `NearbyPanel.tsx` (372), `photo-review.tsx` (365), `generated-videos.tsx`
  (318). The two originals are now 40-line adapters, so all four call sites
  (2 dashboard, 2 admin) are untouched. **2,204 → 1,286 lines.**
  This also **fixed a live crash**: the listing copy did
  `grouped[p.intent_bucket].push(p)` on a bucket map built only from
  `BUCKET_ORDER`. The community tour writes a wider taxonomy (civic,
  waterfront, other) to the same column, so an unclassified POI hit
  `undefined.push` and took the whole route down. The community copy gained a
  guard for exactly this on 2026-08-17; the listing copy never got it, because
  the fix was applied to one of the two files. One panel, one guard.
- **`PhotoTable.tsx` 1,564 → 1,010** + `photo-table/{cells,primitives,row-derivations}`.
  External export surface identical; 5 consumers unchanged.
- **`tour-steps/photos.ts` 869 → 448**, `runPlan`/`chooseBgm`/`writeNarration`
  out to `tour-steps/plan.ts` — `tour-steps/` is one module per step and the
  filename had been lying. Second consumer found beyond the route:
  `scripts/admin/run-community-tour.ts:125` dynamic-imports both from
  `photos.js` and would have gone `undefined` at runtime.

*Docs*:
- **DEVLOG rotated and condensed. 861 KB → 98 KB.** August's 208 entries moved
  verbatim to `docs/devlog/2026-08.md` (the rotation §2.1 rule 2 requires had
  been outstanding since the month turned). September's 54 entries were
  rewritten tight — every SHA, path, test count, decision, rejected
  alternative and owner quote kept; the narrative padding dropped. 189 KB → 97 KB.
- **RELEASE.md 59 KB → 34 KB.** Every bullet down to one or two sentences.
  Fixed two structural faults: v1.3's summary paragraph sat at the *bottom* of
  its version instead of under the heading, and v1.2 had `2026-08-19` filed
  after `2026-08-18`. Duplicate date groups merged.
- `docs/archive/` took `content-sources.md` (titled "Vicinity", scoped to two
  Peachtree Corners ZIPs), `marketing/daily/` (ran two days), and 4 uncited
  prototypes.
- **10 comments pointed at files that do not exist** — `lib/poi/actions.ts`,
  `lib/poi/video-actions.ts`, `0001_init.sql`, `0025_community_covers.sql`
  (both squashed into the v1 baseline), `lib/listing/histogram.ts`,
  `listing-feed/load.ts`, `review-reasons.ts`, `components/CardMap.tsx`,
  `lib/listing/tour.ts`, `listing-photo-actions.ts`. All corrected or dropped.
  The mobile one was the worst: `explore-events.ts:280` *relied on* an
  invariant held by a file that isn't there.
- `render-worker/README.md` and `ken-burns/README.md` still documented the EC2
  systemd deployment (`/home/ubuntu/Percho`, `systemctl enable`) a month after
  the move to the Mac mini. Rewritten for launchd.
- ARCHITECTURE.md: `docs/` table was missing `prototypes/` and
  `ios-release.md`; the `scripts/` table listed 3 folders that no longer
  exist; the `tour-steps/` row named seven steps and the folder has nine.

**Decisions**:
- **Adapters kept rather than updating call sites.** `CommunityNearbyPanel` /
  `ListingNearbyPanel` survive as 40-line shims. It is the pattern
  `{listing,community}-actions.ts` already established over
  `poi-actions-core.ts`, and it means the merge touched zero pages.
- **`POI_TYPE_LABEL` moved to Python by deletion, not by design.** `poiTypeLabel`
  was its only TS consumer and both were dead; `worker.py` carries a live
  mirror. The worker's "keep in sync" comment now says it is the only copy.
  **Flagged for the owner** — the label table's home moved languages.
- `docs/design/v1-e2e/` describes an unbuilt product (`/perches` has zero hits
  in either app). Left alone: forward-looking spec, not drift. Owner's call.
- `public/research/*.mp4` (25 MB, 89% of `public/`) and the 10 `public/demos/`
  slugs left alone — owner review surfaces, most touched in the last week.

**Verification**: `pnpm typecheck` clean across all 3 projects; `pnpm lint`
**0 errors** (was 2 on `main`), 181 web + 8 mobile warnings — all pre-existing
`noNonNullAssertion` / a11y / `useExhaustiveDependencies`, down 4 from
baseline, none added; `pnpm test` **865 web + 556 mobile green** (874 → 865 is
the duplicated `listing-stats.test.ts`, not a lost test); `next build` compiles
59 pages. The build was run deliberately: `scope.ts` is a new client module
importing server actions, and phase181.8 is on record as a client/server
boundary break that `tsc` and vitest both waved through.

**Net: 114 code/doc files, +2,434 / −10,742. DEVLOG 861 KB → 98 KB, RELEASE
59 KB → 34 KB.**

**Learnings**:
- A rule that names a file nobody imports is not a rule. `lib/log.ts` sat in
  CLAUDE.md §6 and ARCHITECTURE.md for months with zero importers.
- Duplicated files don't just cost lines, they **desynchronise fixes**. The
  2026-08-17 bucket-guard fix landed on one of two near-identical panels and
  the other kept the crash for three weeks. The dedupe was worth doing for
  that alone.
- knip is per-workspace. Every candidate needs a grep across `scripts/` and
  the other app before it is safe — 8 web exports were live only from
  `scripts/admin/*`, invisible to the tool.
- `pnpm lint` was red on `main`. CI runs it; nobody looked. Same failure shape
  as 2026-08-19, one level up.

**Next steps** (deliberately not done, in value order):
- **213 `(supabase as any)` casts** and **102 hand-written `XRow` types**
  against 1 file using `Row<'table'>`. The casts are one shape —
  `(await (supabase as any).from(…))` — so a properly typed `createClient()`
  in `lib/supabase/server.ts` collapses both at once. Offered this round,
  deferred by the owner.
- `scheduler.ts` still carries 41 `!`. ~19 go away by typing `Unit['entries']`
  as a non-empty tuple, ~10 by zipping the parallel `ordered`/`engines`/
  `durations` arrays, ~5 by a `cycle()` helper. Not an `at()` problem.
- HLS lifecycle is byte-identical in 4 components (`VideoCard`,
  `CommunityCarousel`, `CommunityVideoFeed`, `CommunityListingCarousel`) →
  one `useHlsSource(ref, src)`. Buyer-identity bootstrap is 3-way duplicated
  and the surfaces disagree on `Record` vs `Set`.
- 5 admin tables still default-export (§4 violation).
- `scripts/` is outside all three `package.json`s, so CI typechecks none of
  it, and the 14 pytest files in `render-worker/tests/` run by hand only.
- Clip-mode tables exist in 4 places (`depthflow_modes.py`, two in
  `worker.py`, `scheduler.ts`); `render-worker/tests/test_kenburns_modes.py`
  already says "three copies is two too many".
- `apps/web/app/dashboard/communities/[id]/CommunityNearbyPanel.tsx`'s sibling
  pair is done, but `CommunityNearbyTable`/`ListingNearbyTable` (~35% shared)
  and `HomeTourSection`/`CommunityTourSection` remain.

## 2026-09-06 11:06 UTC — phase182.1: the wordmark returns; the count closes every header line

**Objective**: owner: 「Being the Percho title back and second line is area and city and communities count」.
**Actions**:
- `PlaceHeader.tsx` — wordmark row back above the place line, 2026-08-14 face (44pt row, DM Serif Display 34/400/−0.5, #086B5B, from `bcbb89f1~1`). Line 1 `Percho`, line 2 `Atlanta metro › <city> ▾ · N communities`.
- Count on every state of the line (phase182 had cut it from trail states): new `trailUnit` prop — city leaf → that city's `scopeStatsLine`, metro leaf → `metroStatsLine`. `feed.tsx` resolves the top card's `geoUnitId` against `pool.geoUnits`.
- Tests: `theme/card-aspect.test.ts` header model 34 → 78pt; `theme/place-header.test.ts` wiring; `theme/feed-chrome-layout.test.ts` asserts the wordmark rides the header's zIndex (the 2026-08-31 stageClip bug).
**Decisions**: the 44pt row crops the **iPhone SE ~5%** (stage 475pt vs film 500pt); 13 mini and up uncropped. Pinned (< 6%) in `card-aspect.test.ts`, flagged to owner. Hiding the wordmark on short screens rejected as extra layout.
**Verification**: `tsc --noEmit` clean; vitest 54 files / **556 tests**; `biome check .` 0 errors / 8 warnings.
**Next steps**: owner reviews on device; if the 24pt place line reads heavy under the 34pt wordmark, `metro`/`city` sizes are two numbers in `PlaceHeader`.

## 2026-09-06 10:35 UTC — phase182: strip removed; the header line becomes the card's place trail; the card centres

**Objective**: owner on the phase181 strip: 「don't like it. It makes the page not well organized and immersive. Let's remove that section」; keep 「a connection between card and area and city and community (for home)」; 「balance the empty space above and under card」.
**Actions**:
- Deleted `components/feed/CommunityStrip.tsx`, `lib/feed/community-strip.ts`, `lib/feed/jump.ts` (+ test); `feed.tsx` loses `contentHeight`, `stripLayoutFit`, `stripCommunities`, `jumpTo`.
- New pure `lib/feed/place-trail.ts` (`placeTrail`, 6 tests) reads the top card's parent chain from the pool; `PlaceHeader` gets `trail`: `Atlanta metro › Johns Creek › Bellmoore Park ▾` over a home, `Atlanta metro › Johns Creek ▾` over a community, metro alone over a city card; nearest parent in ink, ancestors `ink2`. Trade-off / empty deck fall back to scope + stats. Line still opens the scope sheet.
- `SwipeStack` `restTop` centred again, `(stageHeight - frameHeight) / 2` (pre-2026-09-05 rule); `CARD_INSET.top` 24 → 16. Owner pre-approved: 「if the proposed solution above still leaves a lot of room, which is fine」.
- `theme/card-aspect.test.ts` re-modelled without the strip (film never cropped, SE included; centring pinned); strip test dropped from `theme/feed-chrome-layout.test.ts`.
**Decisions**: most homes show metro › city only — `listings.community_id` is almost entirely unpopulated (`apps/web/lib/feed/listing-gate.ts`); real segments or none, so the backfill surfaces the community with no client change. Stats ride only the scope line: on a three-deep chain `adjustsFontSizeToFit` would scale the line below legibility.
**Verification**: `tsc --noEmit` clean; vitest 53 files / **555 tests** (557 − 5 jump − 3 strip-layout + 6 place-trail); `biome check .` 0 errors / 8 warnings.
**Next steps**: owner reviews on device; stats beside short chains is one conditional in `PlaceHeader`.

## 2026-09-06 17:30 UTC — phase181.8: Vercel build broken — client island imported the server Supabase module

**Objective**: main stopped deploying at `a1f6125`: `lib/supabase/server.ts` "You're importing a component that needs next/headers", trace `lib/supabase/server.ts ← lib/communities/detail.ts ← CommunityBody.tsx`.
**Issues/Resolution**: phase181.1 (`359d6f24`) put `dedupeLabels` in `lib/communities/detail.ts`, which imports `createAnonClient` from `lib/supabase/server.ts`; `CommunityBody.tsx` is `'use client'`. tsc/vitest don't enforce the boundary; only `next build` does.
**Actions**: new `apps/web/lib/communities/labels.ts` holds `dedupeLabels` verbatim (note on why it has its own file); `detail.ts`, `CommunityBody.tsx`, `detail.test.ts` import from there; re-export removed.
**Verification**: `pnpm typecheck` 0 errors; changed files biome-clean (2 pre-existing errors untouched); 874/874 vitest; **`pnpm build` compiles** — the command that failed on Vercel.
**Learnings**: a `'use client'` file must never import from a module touching `lib/supabase/server.ts`, even for a pure function or type; shared client-safe helpers get their own file. (181.8 because a parallel agent's 181.7 merged first.)
**Next steps**: none — merge to main redeploys.

## 2026-09-06 08:40 UTC — phase181.7: the metro gets the city's size; the spacing comes out of the hole

**Objective**: owner: 「I said, Atlanta metro should be bigger size. Add some space between text and communities, communities and card, so we can reduce the empty space under the card」.
**Actions**:
- `components/feed/PlaceHeader.tsx` — metro run at the city's face and size (24pt DM Serif, was 13pt UI), stepped back in colour (`ink2` vs `ink`) not size — what 「dropdown similar to community name」 asked for.
- `lib/feed/community-strip.ts` `STRIP_MARGIN_TOP` 10 → **24**; `app/(tabs)/feed.tsx` `CARD_INSET.top` 12 → **24**. Squares are already at their width ceiling on big phones, so the band under the card shrinks: owner's 428×926 **53pt → 27pt**.
**Issues/Resolution**: the spacing made the 13 mini miss the layout by 2pt; `coverSize` returned null and a **107pt** hole replaced a row of 67pt covers. `stripLayout` (replaces `coverSize`) degrades: squares + names → squares without names → no strip. The film stays pinned to the tour's aspect. Result: 0% crop on every body (mini keeps 67pt squares without names; SE has no strip), gaps 16–27pt.
**Verification**: `tsc --noEmit` clean; `vitest run` 53 files / **557 tests** (new case pins names-before-strip order and the mini keeping a strip); `biome check .` 0 errors / 8 warnings.

## 2026-09-06 08:00 UTC — phase181.6: one line, and it shrinks itself

**Objective**: owner, after three passes that each kept two rows: 「Why so hard talking to you? Make all text in one line, ok? If too big to fit in, just use smaller size」.
**Actions**: `components/feed/PlaceHeader.tsx` — one `<Text>` with nested runs, `Atlanta metro › Dallas ▾  ·  188 communities`, `numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}`: iOS scales all runs by one factor, so "Peachtree Corners" (522pt on a 428pt screen) shrinks instead of wrapping. One `Pressable` — the whole line opens the scope sheet. `PLACE_HEADER_TEXT_HEIGHT` 58 → 34; card untouched.
**Decisions**: chevron is a character (`▾`) — a `View` cannot ride inside a scaled Text. City 30pt → 24pt: at 30 the scaler fired on every long name and shrank the small runs to protect a size nobody asked for.
**Verification**: `tsc --noEmit` clean; `vitest run` 53 files / **556 tests** — `theme/place-header.test.ts` fails if the header splits into two rows again (one Pressable, one Text, no View chevron); `biome check .` 0 errors / 8 warnings.
**Learnings**: three passes re-read one sentence instead of changing what it named; `adjustsFontSizeToFit` was available from the start and removes the constraint that made "one line" look impossible.

## 2026-09-06 07:20 UTC — phase181.5: the header printed "Atlanta Metro" twice and no numbers at all

**Objective**: owner: 「Atlanta metro and community info still not in one line fix it」.
**Issues/Resolution**: with no city scoped (the default, and where "Anywhere in metro Atlanta" lands) both rows printed `Atlanta Metro` and neither carried numbers — `scopeStatsLine` takes a `GeoUnit` and there is none for the whole metro. The community info was nowhere.
**Actions**:
- `lib/feed/place-stats.ts` (new) — `SCOPE_ROOT_LABEL`, `scopeStatsLine`, new `metroStatsLine(units)` lifted out of the component so tests assert values, not source text; `ScopeSheet` follows.
- `components/feed/PlaceHeader.tsx` — row 1 is always the numbers row: the city's when scoped, the metro's (8,678 across 109 units) when not. The metro control renders only when scoped.
- `theme/place-header.test.ts` (new, 6 cases) — sums, singular, absent-rather-than-zero, two wiring assertions.
**Decisions**: metro + city + numbers on one row rejected after measuring in a browser at the same metrics: 390pt for "Dallas, GA", **522pt for "Peachtree Corners, GA"**, on a 428pt screen.
**Learnings** (off `/api/mobile/feed`, 2026-09-06): **0 of 109 units populate `stats.medianListPrice`** — the `median $594K` in every mockup this week was the demo's invention; code path real, column empty. Dallas has **188 communities**; the metro 8,678.
**Verification**: `tsc --noEmit` clean; `vitest run` 53 files / **555 tests**; `biome check .` 0 errors / 8 warnings.

## 2026-09-06 06:30 UTC — phase181.4: the film stops paying — the squares give instead

**Objective**: owner on 181.3: 「Don't cut film」, 「Make Atlanta Metro and Community stuff in one line, Atlanta metro dropdown similar to community name」, 「4.5 communities preview full width is not accurate, it should not exceed card width」, 「40 pt empty is flexible, don't cut card size」. Inverts 181.3: the card is drawn at the canvas's aspect, everything else fits around it.
**Actions**:
- `lib/feed/community-strip.ts` — `coverSize(cardWidth, maxHeight)`: 4.5 squares across the **card** (`4×(size+GAP) + size/2 = cardWidth`), capped by spare height; below `STRIP_MIN_COVER` (52) returns null and no strip renders. `stripHeight()` alongside.
- `app/(tabs)/feed.tsx` — `onLayout` on the SafeAreaView solves `content − header type − 12 − cardWidth/0.685 − 16`; the measured box excludes the strip so its height cannot feed its own input. `CARD_INSET.bottom` 40 → **16**.
- `components/feed/CommunityStrip.tsx` — draws at the handed size, clipped to the card's column.
- `components/feed/PlaceHeader.tsx` — two rows: `Atlanta Metro ⌄ · 40 communities · median $594K`, then `Dallas, GA ⌄` in the serif; both open the scope sheet. `PLACE_HEADER_TEXT_HEIGHT` exported.
**Decisions**: **the strip disappears before the film is touched** — asserted. Per device (in the test): 0% crop everywhere, squares 52 (13 mini) to 81 (16 Pro Max); owner's 428×926 gets 79 with the width rule binding and gap 29; SE drops the strip at 0.3% crop.
**Verification**: `tsc --noEmit` clean; `vitest run` 52 files / **549 tests** (card-aspect rewritten around the no-crop rule); `biome check .` 0 errors / 8 warnings.

## 2026-09-06 05:40 UTC — phase181.3: the owner sets the page's rhythm, and the film pays for it

**Objective**: owner's exact page: line 1 `Atlanta Metro`, line 2 `Dallas, GA   40 communities · median $594K`, line 3 bigger community squares ("maybe 4.5 squares making full width, and we swipe for more"), line 4 card, line 5 40pt empty, line 6 tabs.
**Actions**:
- `components/feed/PlaceHeader.tsx` — 30pt serif title back with stats on its row; stats `flexShrink` and truncate before the city.
- `lib/feed/community-strip.ts` — `coverSize(width)`: `PAD + 4×(size+GAP) + size/2 = width` (393pt → 75, 428 → 83); the half square is the affordance. RN-free so `theme/card-aspect.test.ts` can use it.
- `components/feed/CommunityStrip.tsx` — sizes via `useWindowDimensions`, right padding 0. `app/(tabs)/feed.tsx` — `CARD_INSET.bottom` 10 → **40**.
**Issues**: the new heights come out of the card and `cover` crops the film's sides — 7.3% on the 13 mini down to 1.5% on the owner's 428×926; the 40pt lands exactly everywhere.
**Decisions**: test ceiling 3% → **8%**, documented as a ceiling for this layout (fails if another row is added), per-device table kept in the test. Knobs, cheapest first: drop the square's name (17pt), 5.5 across, shrink the 40.
**Verification**: `tsc --noEmit` clean; `vitest run` 52 files / 548 tests; `biome check .` 0 errors / 8 warnings.
**Next steps**: owner reloads; if the crop shows on a small phone, a height-aware `coverSize` keeps 4.5-across on big screens and shrinks on short ones.

## 2026-09-06 05:00 UTC — phase181.2: the header is one line — and the gap it was closing comes back

**Objective**: owner, hours after R3: 「too many lines of text, can you make them in one line then follow with communities and cards」.
**Actions**: `components/feed/PlaceHeader.tsx` — eyebrow, 30pt title and stats collapse into `Atlanta metro › Dallas ⌄`, metro muted, city 17/700 in redline green (up from the 14pt crumb). `app/(tabs)/feed.tsx` drops unused `scopedUnit`; `theme/card-aspect.test.ts` `HEADER_MODEL` 155 → 108.
**Decisions**: **stats do not fold into the line** — cut once already ("no need to show xxx communities in this page", 2026-09-05); `40 communities · median $594K` would re-create the removed row. `scopeStatsLine` stays exported for the scope sheet.
**Issues** (flagged, not fixed): one line is 47pt shorter, so the band under the card goes ~37pt → **~85pt** on 428×926. The card cannot take it — at 396 wide it is already the film's shape (578pt). Knobs: covers 56 → 72 (16pt), a second row of communities (~82pt), or accept 85. Not chosen unilaterally — the owner has moved this space three times today.
**Verification**: `tsc --noEmit` clean; `vitest run` 52 files / 548 tests; `biome check .` 0 errors / 8 warnings.

## 2026-09-06 04:10 UTC — phase181.1: duplicate interest chips — a React key crash on the community page

**Objective**: owner on device: LogBox `Encountered two children with the same key, \`Home Improvement & DIY\`` from `app/community/[slug].tsx:324`.
**Issues/Resolution**: `communities.interests` is scraped from Nextdoor verbatim and some rows repeat a label (Aberdeen). Chips keyed by label → React warning and a doubled chip.
**Actions**:
- `apps/web/lib/communities/detail.ts` — `dedupeLabels()` replaces the `typeof === 'string'` filter in `projectCommunityDetail`: order-preserving, first wins, key trimmed + case-folded. Order is Nextdoor's ranking (the "#N resident interest" evidence), so nothing re-sorted.
- `apps/web/app/(public)/c/[slug]/_components/CommunityBody.tsx` — same latent bug on both chip rows (`key={a}` / `key={i}`); both go through `dedupeLabels`.
- `apps/mobile/app/community/[slug].tsx` — de-duplicated `useMemo`; kept alongside the API fix because it fixes the owner's device on a Metro reload, not after a Vercel deploy.
- `apps/web/lib/communities/detail.test.ts` — 5 cases: repeated label, casing/whitespace, blanks/non-strings, missing column, DTO end-to-end.
**Decisions**: **DB not touched** — cleaning scraped rows is a backfill needing its own decision (CLAUDE.md §10); fix at the projection, not 3 render sites.
**Verification**: `tsc --noEmit` clean in both apps; mobile vitest 52 files / 548 tests; web `detail.test.ts` 12 tests; `biome check .` web 2 errors / 185 warnings, byte-identical to `git archive` of `origin/main`; mobile 0 errors / 8 warnings.
**Next steps**: a DB clean-up is a one-off script over `communities.interests`, owner's go-ahead required.

## 2026-09-05 11:20 UTC — phase181: the feed opens on the place — wordmark out, city + community strip in

**Objective**: owner picked **R3** off `percho.co/demos/feed-header-v2` — 「remove Percho app name, starts with area-city directly」 — plus 「点击一个社区应该可以跳到那张卡片」.
**Issues/Resolution**: R3 could not be built as drawn — `CARD_FRAME_RATIO` made the card 0.83 of the stage, so a taller header shrinks the card and keeps the hole; deleting the wordmark alone grows the gap 128pt → 172 (demo frame R1). Card sizing changed first.
**Actions** (`apps/mobile`):
- `theme/card-frame.ts` — `CARD_FRAME_RATIO` gone; `cardFrameHeight(stage, width) = min(stage, width / CANVAS_ASPECT)`, `CANVAS_ASPECT = 1080/1576`: 0.685 by construction instead of `GUTTER` + ratio kept in step by hand. `components/SwipeStack.tsx` uses it.
- `components/feed/PlaceHeader.tsx` (new, replaces `ScopeCrumb.tsx`) — metro eyebrow, city as 30pt DM Serif title, stats line, strip slot; title opens the scope sheet. `SCOPE_ROOT_LABEL` / `scopeStatsLine` moved here; `ScopeSheet` imports updated.
- `components/feed/CommunityStrip.tsx` (new) — toured communities as 56pt covers, current one ringed `redline.accent`. `lib/feed/community-strip.ts` (new) — toured only, scoped city first but nothing filtered (§1.3), de-duplicated, capped at 12.
- `lib/feed/jump.ts` (new) — tap inserts a copy after the top card (a move from before `activeIndex` would renumber what the stack animated past); re-tap on the ringed face is a no-op returning the same deck; no verdict for the card left behind.
- `app/(tabs)/feed.tsx` — wordmark row and styles deleted; `PlaceHeader` + `CommunityStrip` mounted; `scopedUnit` / `stripCommunities` / `topCommunityId` / `jumpTo` derived.
- Tests: `lib/feed/jump.test.ts` (5); `theme/card-aspect.test.ts` rewritten (6) to measure the film's side crop per device and pin the SE exception; `theme/feed-chrome-layout.test.ts`: strip stays inside the header (z-index), wordmark must not return.
**Decisions**: strip built from the POOL, not the sampled deck. Toured communities only. The serif survives the wordmark — under 「只有 Percho logo 使用 serif」 (2026-08-14) the page would have no serif anchor, so the city title takes it at 30pt (wordmark was 34).
**Verification**: `tsc --noEmit` clean; `vitest run` 52 files / **548 tests**; `biome check .` **0 errors** / 8 warnings (same 8 as `origin/main`, which also carries 1 error this branch does not).
**Issues**: leftover under the card is RN layout, not arithmetic — near zero on the modern lineup per the model, needs a device check. SE crop ~18% by the model; asserted, not fixed.
**Next steps**: owner reloads Expo Go; if the strip is too much furniture, T5/R5 (learning chips instead of faces) is a component swap.

## 2026-09-05 09:40 UTC — phase181: the tab bar's icons were being clipped; the band under the card gets a demo

**Objective**: owner on device: (1) 「too much empty under the card, you need to consider the whole page layouts」 (2) 「icons get truncated, the heart one, why??」
**Issues/Resolution (2)**: `TabBar.tsx` pins each glyph `<Text>` `left: 0, right: 0` in the 24pt icon box; `TAB_BAR_OPTICAL_SCALE` 1.13 makes the 1 em advance 27.1pt, wider than its line, and iOS clips the right side. Confirmed by measuring ink boxes in his 1284×2778 screenshot against `TabBarIcons.ttf` outline bounds (fontTools): heights match to 0.4pt, widths short by 0.7–1.4pt (heart −1.4) — the deficit equals the em-box overflow every time.
**Actions**:
- `TabBar.tsx` — glyph gets `width: fontSize` and `left: (ICON_SIZE - fontSize) / 2`, the horizontal twin of the existing `top`. `theme/tabbar-icon-font.test.ts` fails if `left: 0, right: 0` returns and asserts the em box is wider than the icon box for every glyph at any allowed scale.
- (1) `apps/web/public/demos/feed-page-v2/` — six frames at his geometry (428×926, header 127, card 396×575, tab bar 96): A0 as-built, A1 pre-phase179 split, **A2 card fills the stage** (recommended; film loses 17% width), A2b 640pt (10%), A3 scope crumb in the band, A4 deck controls in the band, A5 96pt header. Taller frames composited (film cover-cropped, chrome at real insets), so the crop shown is real.
**Decisions**: the card is not wrong — 396 × 575pt, aspect 0.689 vs the canvas's 0.685. phase179 (`ffacc6e0`) set `restTop = 0` because the owner called the gap above a hole, so all 128pt of slack sits below; the slack is structural (stage 693, card 575) and growing the card crops the 1080×1576 tour. `restTop` / `CARD_FRAME_RATIO` left alone pending his pick.
**Verification**: `tsc --noEmit` clean; `vitest run` 51 files / 539 tests (was 536); `biome check .` 1 error / 8 warnings, identical to `origin/main`, none in a touched file.
**Next steps**: owner picks a frame off `percho.co/demos/feed-page-v2`; the icon fix needs only a Metro reload.

## 2026-09-05 17:10 UTC — phase174: the community card's place label leaves the video and joins the app

**Objective**: build the owner's pick (M7 on `/demos/community-label-v1`); diagnosis in the 07:40 entry.
**Actions**:
- `scripts/render-worker/worker.py` — `_render_label_png`, `_label_overlay`, `_ui_font`, `_wrap_to_width`, the `CARD_REF_WIDTH_PT` / `BADGE_*` block, `clip_labels` and the overlay call deleted; `_label_font` + `LABEL_FONTS` stay for the end card. End-card `card_idx` is `len(clip_paths)` (was `+ len(label_inputs) // 2`).
- `scripts/admin/reassemble-community-tours.ts` (new) — copies a community's latest READY `tour_assemblies` row into a fresh `pending` one verbatim (`ordered_clips`, `photos_dropped`, `narration`, `bgm`); no re-plan, no clip touched, no Seedance call. `--slug` / `--all`.
- `apps/web/lib/feed/tour-segments.ts` — `TourSegment.distance` from the clip's `label_distance`, omitted rather than empty; `apps/mobile/lib/feed/pool-dto.ts` + `card-types.ts` parse/type it, a bad distance drops alone.
- `apps/mobile/components/cards/CommunityFace.tsx` — `useAnimatedReaction` on `progress` picks the on-screen place; a top-left pill names it in the COMMUNITY badge's slot. `CardCorner` gains `save` at 12/12 (`top` prop deleted, inset in `slot`); `COMMUNITY_SOUND_TOP` gone; COMMUNITY is an eyebrow above the name. `ListingFace.tsx` — LISTING badge gone.
- Re-assembled Windward, Bellmoore Park, Ashley Crossing, Apremont – Highcroft, Aberdeen — ffmpeg only.
**Decisions**: eyebrow, not a tag beside the name — M2–M4 cost the signal glyphs on short names and ellipsized "Apremont – Highcroft" at ~125pt (M5), against the 2026-08-22 no-truncation rule; the owner's "put community label on top of the community name" removes the condition. Re-render before the app change (old film + new card draws the label twice); Windward diffed first. Narrow script over `pnpm tour --steps assemble`, which re-plans.
**Issues**: `origin/main` moved `4925e8cf` → `eb57e118` mid-phase (phases 175–180); additive conflicts in `tour-segments.ts` (`distance` vs `poiId`/`bucket`, both kept) and `CardCorner.tsx` (took phase175's 26pt Phosphor version, re-applied two edits). Own bug caught pre-ship: bare `placeIndex` named the previous community's place on a reused face — stored with `card.id`, as `measured` already does.
**Verification**: mobile 538 tests / 51 files, web 869 / 83, render-worker 133; `pnpm typecheck` clean; `pnpm lint` mobile green, web unchanged (2 errors / 185 warnings, pre-existing a11y). Windward diffed frame-by-frame: burned pill at 8s in the old, absent in the new. Not seen on the phone; reference worktree needs `git pull` + `pnpm install`.
**Learnings**: the demo's long-name frame caught the M2 truncation; Windward alone would not have shown it.
**Next steps**: owner review in Expo Go. Scrub label duplicates the pill while a finger is down (kept); communities without a tour — most of them — show an empty top-left corner.

## 2026-09-05 16:05 UTC — phase177: the new tab bar ships — new glyphs, duotone active, and the centring bug deleted

**Objective**: owner's picks from `/demos/tabbar-redesign`: **house-line · compass · heart · hand-waving**, size **B1** (icon 24 / label 12), bar **B** (flat + soft pill). Active style/motion unnamed → demo defaults ship: duotone active icon, pop-and-tilt, active label 600.
**Actions**:
- `scripts/icon-fonts/build-tabbar-icon-font.py` — two subsets (regular → `TabBarIcons.ttf`, fill → `TabBarIconsFill.ttf`, 2.6/2.2 KB), each its own family so CoreText cannot collide them. Fixed `REPO` (`parent.parent` resolved to `scripts/` after the move).
- `components/TabBarIconFont.ts` — glyphs U+E2C4 / U+E1C8 / U+E2A8 / U+E580, `TAB_BAR_FONT_FILL`; `TAB_BAR_ART_WIDTH` **deleted**, `TAB_BAR_GLYPH_CENTER_Y` + `TAB_BAR_BOX_CENTER_Y` added.
- `components/TabBar.tsx` — icon 24 / label 12, `Tab` subcomponent (one `useSharedValue` each), pill, duotone layer, pop. `app/_layout.tsx` loads the fill font behind the same gate. `theme/tabbar-icon-font.test.ts` checks both weights per codepoint plus a measured centre and scale per glyph. `RELEASE.md` bullet under v1.3.
**Decisions**:
- The Saved drift was arithmetic: all four glyphs have `cx` 0.500; `TAB_BAR_ART_WIDTH` held xMax, not width, so `(1 - artWidth) / 2` was a rightward shove (bookmark 2.7 px, house 1.5, search/you 1.2). Deleted with a do-not-reintroduce comment.
- Vertical centring explicit: `top: (ICON_SIZE - fontSize) / 2` + `translateY = (glyphCentre - 0.4375) × fontSize` per glyph (heart 0.031 em low, house-line 0.015 em high); Yoga defaults and `textAlignVertical` (Android-only) rejected.
- Only house-line gets an optical scale (0.96): by `sqrt(w×h)` the four are 0.812 / 0.810 / 0.828 / 0.856 em.
- Duotone is two `<Text>` layers (weights register to 0.001 em); still no `react-native-svg` (red-screens in Expo Go, 2026-07-30). Pill on every tab, coloured only when active, so the row cannot shift. No haptics — not in the brief.
**Issues**: pre-existing `app.json format` lint error, fixed on main by phase180's biome override — merged main in first. `RELEASE.md` conflict: phase175's "same bookmark the Saved tab uses" became false — reworded to "is a bookmark".
**Verification**: `pnpm test` 529 passed / 50 files; `pnpm typecheck` clean; `pnpm lint` clean on changed files; both fonts carry all four codepoints and register as `TabBarIcons` / `TabBarIconsFill`; the demo page defaults to the shipped combination. **Not yet seen on a device.**
**Learnings**: a "measured" constant whose name lies is a trap — code follows the name, not the data; the test now asserts a value per glyph so a swap cannot inherit stale numbers.
**Next steps**: owner checks Expo Go (reference worktree needs `git pull` + `pnpm install`). Open: card save is a **bookmark**, the Saved tab a **heart** — worth unifying, not asked.

## 2026-09-05 15:49 UTC — phase177: tab bar round 2 — bar shape settled (B), icon-vs-label size open

**Objective**: owner picked **B** (flat bar + soft pill behind the active icon); wants the icon bigger relative to the label.
**Actions**: `apps/web/public/demos/tabbar-redesign/index.html` — `--icon` / `--label` / `--gap` CSS vars per phone; pill scales off `--icon` (`2× wide, 1.36× tall`). Gallery: shipped bar + B at 24/12, 26/11.5, 28/11, 30/10.5, 30 no-label.
**Decisions**:
- Label shrinks as icon grows: ~1pt label for ~4pt icon keeps the 62pt bar's block height flat and doubles the contrast gain.
- `--gap` 5 → 3 so icon+label read as one unit.
- Icon-only B5 included ("immersive" was in the brief) but flagged: Saved and You are not self-evident without names.
- Bar stays 62pt + inset; at 30/10.5 content is 45pt, so no geometry change for any step.
**Next steps**: owner picks a step (icons / active style / motion default to house · magnifying-glass · heart · smiley, duotone, pop + tilt); port to `components/TabBar.tsx`.

## 2026-09-05 15:43 UTC — phase180: `pnpm lint` is green again — biome yields app.json to the Expo CLI

**Objective**: the one lint ERROR in `apps/mobile` since `ea2195c5` (phase173): `app.json` fails `format`. The rest are 8 warnings.
**Actions**: `apps/mobile/biome.json` — `overrides` entry: `app.json` formatted with 2 spaces, everything else stays on tabs. 5 lines; `app.json` untouched.
**Decisions**:
- Rejected `biome format --write app.json`: `eas build` rewrites it as 2-space JSON on every build (`buildNumber` bump), which is how phase173 broke it. The override matches the tool that owns the file.
- Rejected `files.ignore`: the point is to keep checking the file.
**Verification**: `pnpm lint` exit 0 (8 pre-existing warnings); `pnpm typecheck` clean; `pnpm test` 536/536. Re-indenting `app.json` to tabs gives 1 error again, so it is still checked; committed file byte-identical to main.
**Learnings**: when a formatter fights a code-generating CLI, pin the config to the generator's output.
**Next steps**: none; the 8 warnings are intentional (`noConsoleLog` in `scripts/probe-session.ts`, ref-not-dep patterns in `feed.tsx`).

## 2026-09-05 15:39 UTC — phase179: feed header compacted — one-line crumb, card top-aligned

**Objective**: owner on device: "Space between Percho/city/community info and card is too big, it doesnt look good, and no need to show xxx communities in this page".
**Actions**:
- `components/feed/ScopeCrumb.tsx` — stats line gone; one 24pt line `Atlanta metro › Dallas ⌄` (was `minHeight: 40` + gap); `hitSlop` 10pt keeps a 44pt target; `unit` prop dropped. `scopeStatsLine` stays for `ScopeSheet`.
- `components/SwipeStack.tsx` — top card rests at `restTop = 0` instead of centred; `StackCard` takes `restTop` in place of `stageHeight`.
- `app/(tabs)/feed.tsx` — `scopedUnit` memo removed; `CARD_INSET.top` 12, crumb-to-card now 14pt.
- `RELEASE.md` bullet under v1.3.
**Decisions**: the gap was the stage, not the header — `CARD_FRAME_RATIO` 0.83 leaves ~100pt slack on an iPhone 15, centring put half above the card. Moved the card up rather than enlarging it (keeps the 2026-08-23 ratio and the tour's crop). Did not fold the crumb into the wordmark row — the 2026-08-14 rule (wordmark centred, corners empty) holds.
**Verification**: `pnpm typecheck` clean; `pnpm test` 528/528; biome clean on changed files. `pnpm lint` fails on `app.json` FORMAT, pre-existing since `ea2195c5`.
**Renumber**: branched as phase174; 174–178 landed from other agents, merged as **phase179**; merge rebuilt from fresh `origin/main` each time main moved.
**Next steps**: owner eyeballs on Metro after `git pull` (no `pnpm install` needed).

## 2026-09-05 08:45 UTC — phase175: the corner ships as H1 — badge-height pill, real Phosphor glyphs

**Objective**: owner picked **H1** off `percho.co/demos/card-corner-v2` ("go with your recommendation").
**Actions**:
- `scripts/icon-fonts/build-icon-font.py` — builds both weights (`PerchoIconsOutline.ttf` had no script) from pinned `@phosphor-icons/web` 2.1.2; prints measured art widths; fixed `REPO` (`parent.parent` from before the move into `icon-fonts/`). `build-tabbar-icon-font.py` keeps the unfixed copy.
- Subset now 21 glyphs per weight: `soundOn` = speaker-simple-high, `soundOff` = speaker-simple-slash, `bookmark` repointed to **bookmark-simple** (= `TAB_BAR_GLYPH.saved`); nothing rendered `bookmark` since phase140, so free.
- `components/cards/CardCorner.tsx` — 317 → 156 lines; `View`-drawn `SpeakerIcon` / `BookmarkIcon` replaced by two `RedlineIcon`s. `CORNER_HEIGHT = 26` (badge height) at `rgba(255,255,255,0.92)`, was 37pt at 0.85; saved fills `redline.accent`; no divider; asymmetric `hitSlop` (12 out, `GAP / 2` in) → ~33 × 50pt non-overlapping targets.
- `theme/listing-layout.test.ts` — pins the new shape and asserts corner fill EQUALS badge fill. Demo marked "CHOSEN — SHIPPED".
**Decisions**: both weights in the redline subset rather than a new font — `RedlineIcon` already renders either. Committed fonts verified byte-identical to the script's output before rebuilding; family names ("Phosphor-Fill" / "Phosphor") preserved so CoreText keeps them apart. `OUTLINE_ART_WIDTH` disagrees with the font for ~8 glyphs (camera 0.9062 vs 0.8125, ~0.6pt) — pre-existing, flagged not fixed.
**Verification**: `tsc --noEmit` clean; `vitest run` 50 files / 528 tests; `biome check .` byte-identical to `origin/main` (1 error, 8 warnings, none in touched files). New glyphs rasterised and eyeballed — a wrong codepoint draws a real icon, no test catches it.
**Issues**: unverifiable off-device: pill translucency over bright sky, 15pt glyph size (H1d 30pt / 17pt still on the demo).
**Next steps**: device pass; reference worktree `git pull` + Metro restart (fonts are assets).

## 2026-09-05 08:20 UTC — phase175: the card's top-right control — redesign frames, decision pending

**Objective**: owner: "top right of the card - sound and saved icons look weird, redesign, give me some demos."
**Diagnosis**: capsule 37pt (`CardCorner.tsx` `CELL`) vs LISTING badge ~26pt on one row; glyphs are bordered `View`s at Lucide geometry (no speaker in either font) — at 17pt the speaker closes into a blob, the bookmark notch shows a seam.
**Actions**: `apps/web/public/demos/card-corner-v2/index.html` on the `feed-chrome-v1` template, Phosphor regular glyphs. **H0** replica; **H1 ★** one pill at 26pt, two 15pt glyphs, no divider; **H1b** muted + saved (redline green); **H1c** hairline; **H1d** 30pt / 17pt; **H2** dark glass; **H2b** badge + controls dark; **H3** no container, 20pt shadowed; **C1 / C2** on the community card (disc at 52). Each frame has a 2× badge-beside-control strip.
**Decisions**: no two-disc variant — owner rejected "two buttons" 2026-08-30 and G2 was his pick; not re-litigating G5. Recommend H1: same placement and behaviour, control becomes the badge's twin.
**Issues**: phase174 is redesigning the community card's burned-in label; the community mute's `top` follows it.
**Next steps**: owner picks → `CardCorner.tsx` pill from badge height, rebuilt Phosphor subset (`speaker-simple-high`, `speaker-simple-slash`, fill `bookmark-simple`), saved in `redline.accent`; update `listing-layout.test.ts`, `icon-font.test.ts`.

## 2026-09-05 07:40 UTC — phase174: the community card's place label — demo frames, decision pending

**Objective**: owner: "Community card top right has poi name, this is not aligned with top left community label, and it pushes the sound and saved icons below, it is not consistent with listing, can you redesign this?"
**Diagnosis**: the pill is burned into the tour by `worker.py` `_render_label_png` at a 361pt reference (`CARD_REF_WIDTH_PT`); with `fit="cover"` its size follows the crop, so it can never align with the badge. `CommunityFace` parks the mute at `top: 52` (`COMMUNITY_SOUND_TOP`) vs the listing's 12. No save control since 2026-08-20.
**Actions**: `apps/web/public/demos/community-label-v1/index.html` — R (listing), L0 (as built), L1 pill above name, L2 eyebrow, L3 under badge, L4 merged (`COMMUNITY | 📍 place`), L5 top-right app-drawn. Frames loop the real Windward places (`tour_assemblies` labels + `label_distance`, incl. the 54-char Publix). `?only=`, `?group=ref|proposal`, `?guides=1`.
**Owner's direction**: drop the LISTING badge ("it is obvious"); POI + distance top-left, sound AND save top-right, COMMUNITY down to the name as a small label — M1–M6. M2–M4 (tag right of the name) lose the signal glyphs and truncate "Apremont – Highcroft" at ~125pt (M5), against the 2026-08-22 no-truncation rule; M6 needs a conditional layout. Owner: "put community label on top of the community name in this case." → M7/M8, tag as an EYEBROW: one rule for every name length. Build M7.
**Next steps**: (1) `worker.py` drops `_label_overlay`, restart the three launchd workers, re-assemble the 5 tour communities (ffmpeg only, zero Seedance) — first, or two labels coexist; (2) `distance` onto the segment in `lib/feed/tour-segments.ts` (`ordered_clips[].label_distance`) + `pool-dto.ts`; (3) `CommunityFace` native pill top-left, `CardCorner` gains save, COMMUNITY eyebrow, `COMMUNITY_SOUND_TOP` deleted; (4) `ListingFace` loses its badge; (5) owner verifies in Expo Go.

## 2026-09-05 07:20 UTC — phase178: the community page becomes numbers — categories on the strip, counts charted

**Objective**: owner on phase176: "1) no need to show numbers, 2) dont say the poi name, just group them by tag or category, it is too long to show all of them, 3) put city and state on the right side of the community name, 4) still too many text, we need to be more interactive, and better visualization, with numbers as much as possible, text is not preferred, exception for the key insights, numbers".
**Actions**:
- `apps/web/lib/feed/tour-segments.ts` — `TourSegment` gains `poiId`, `bucket`; `vertical-videos.ts` `fillSegmentBuckets()` joins `community_pois.intent_bucket` (9/9 Peachtree Corners, 12/12 Aberdeen in production; clip `bucket` is fallback).
- `apps/web/lib/communities/detail.ts` — `nearby: {bucket,count}[]` from the already-fetched `fetchPoiCounts`; `NEARBY_BUCKET_DENYLIST` = `other`, `asian_community`.
- Mobile: new `lib/community/tour-buckets.ts` (+ 8 tests, `buildTourGroups()` on the `lib/listing/rooms.ts` contract); `TourHero.tsx` chips are categories with counts ("Schools 2"); new `components/community/{StatBand,NearbyChart,RatingBars}.tsx`; `app/community/[slug].tsx` headline name-left place-right, evidence lines only on the top three reasons, `moreReasons` / interests as chips, ordinals gone.
**Decisions**:
- "No numbers" means ORDINALS, not counts — reconciles notes 1 and 4.
- Categories from `community_pois`, not the clip: schema-constrained, joins at 100%.
- `other` / `asian_community` fold into "More", dropped from the chart — same reasoning as `community-reasons.ts` refusing `avg_income` (demographic-sounding label steers by proxy). 3 rows today.
- `moreReasons` lost evidence lines; the numbers live in `NearbyChart` / `StatBand`; top three keep sentences. One JSX block to revert.
- Body stays `colors.*` amber, not `explore.*` green — a separate owner decision.
- `nearby` OPTIONAL in the mobile DTO: Metro reload lands before the Vercel deploy.
**Verification**: web typecheck / test 867 / build clean; mobile typecheck / test 536 (8 new) / biome clean on changed files. Sized from production data (228 POI rows Peachtree Corners, 38 Aberdeen). Not seen on device.
**Learnings**: `intent_bucket` is well populated for tour communities (a tour is cut from POI rows); the "1 of 8,679" note in `detail.ts` misleads about that set. Live data has `amenities`, `civic`, `waterfront`, `other` beyond the migration's 15-bucket check; `BUCKET_LABELS` covers all 16 + `faith`/`work_hubs`.
**Next steps**: owner review after the Vercel deploy. Open: the `moreReasons` call, the green palette.

## 2026-09-05 06:40 UTC — phase177: tab bar icons — redesign demo, decision pending

**Objective**: owner: "feed search saved you icons do not interesting, immersive, cute to me (saved button is even not centered!), redesign this." Hosted picker first, app change later.
**Diagnosis**: the off-centre Saved icon is a bug. `TabBar.tsx` shifts each glyph by `(1 - artWidth) / 2` em assuming flush-left art (`TAB_BAR_ART_WIDTH`); fontTools shows every glyph in `TabBarIcons.ttf` already centred (bookmark x=[0.219, 0.781], house [0.125, 0.875], search [0.093, 0.906], user [0.094, 0.906]) — the "widths" are xMax. Bookmark shifts right ≈ 2.7 px at 24.9 px. Fix: delete the shift and table with the redesign.
**Actions**: `apps/web/public/demos/tabbar-redesign/index.html` + self-hosted Phosphor regular / fill / bold woff2 (~430 KB, demo only), live at https://www.percho.co/demos/tabbar-redesign. Per-tab icon pickers (Feed: house-simple / house / house-line; Search: magnifying-glass / binoculars / compass; Saved: bookmark-simple / bookmark / heart / heart-straight / star; You: user / smiley / hand-waving / person / planet), active styles (duotone, bold duotone, solid, bold outline, outline-only), motions (pop + tilt, pop, jump, none). Six phones: **0** current, **A** flat, **B** flat + 10% green pill, **C** floating white capsule, **D** C + pill, **E** dark ink capsule.
**Decisions**: still an icon font, still Phosphor — `react-native-svg` red-screened in Expo Go (2026-07-30); duotone is two stacked `<Text>`s. Floating capsules shown despite the 2026-08-14 rejection because "immersive" is in this brief; card height identical in both.
**Issues/Resolution**: first deploy drew tofu — relative `@font-face` URLs resolved to `/demos/Phosphor.woff2` (404) because Vercel serves `/demos/tabbar-redesign` without a trailing slash (308 from the slash form). All `url()`s now absolute. Rule: no relative asset URLs in hosted demos.
**Next steps**: owner picks; port to `components/TabBar.tsx` (rebuild `TabBarIcons.ttf`, drop the shift, reanimated spring + `Haptics.selectionAsync`).

## 2026-09-05 06:40 UTC — phase176: the community page's hero follows the listing hero — places as a strip on the film

(Numbered phase174 in review; 174 and 175 landed from another agent, so merged as 176.)

**Objective**: owner (2026-09-04): "Community explore page first section should follow the listing pattern, so users can select parts to view, and you don't have to show a lot of texts after that to tell users what community has."
**Actions**:
- New `apps/mobile/components/community/TourHero.tsx` — the listing hero's shape for one film: `clamp(340, 46vh, 460)`, ← / ↑ / ♡ glass discs, global `SoundToggle`, foot chip strip with one chip per `tourSegments` row; lit chip follows a 0.25s `timeUpdate` listener, tap seeks. No strip without film or structure (legacy AI mp4); cover photo when no film. `explore.*` tokens over media.
- `apps/mobile/app/community/[slug].tsx` — hero, three absolute buttons, blurb and "THE TOUR VISITS" replaced by `<TourHero>`; name + city/state become a headline under the media. `CommunityTourVideo`, `scrollRef`, `seekRef` removed; `blurb` stays in the DTO, unrendered.
- `RELEASE.md` bullet under v1.3 / 2026-09-05.
**Decisions**: seek with `seekBy`, not `player.currentTime =` (DEVLOG 2026-08-23: HLS setter seeks with zero tolerance, slow seeks abandoned), with `CardVideo`'s 1.5s post-seek hold. "A lot of texts" = the blurb; evidence rows stayed. `nativeControls` off — the strip is the scrubber. Not done: auto-scrolling the strip to the lit chip (needs per-chip `onLayout`; ~5–8 places fit anyway).
**Verification**: `pnpm typecheck` clean, `pnpm test` 528/528, biome clean on both files. Not on device — reference worktree needs `git pull` + `pnpm install`.
**Next steps**: owner checks lit-chip tracking, tap-to-seek, the headline.

## 2026-09-05 06:30 UTC — phase173: build 5 exists — the App ID checkbox, then a missing babel preset

**Objective**: first store-candidate build after phase172 stalled on the provisioning profile.
**Actions**:
- Owner ticked **Sign In with Apple** on `co.percho.app` and ran `eas build` from `~/Workspace/Percho/apps/mobile`. (1) `expo config --json`: `Failed to resolve plugin for module "expo-apple-authentication"` — stale `node_modules`, fixed by `pnpm install --frozen-lockfile`. (2) Build `c98e6109` (1.0.0 (5)) regenerated the profile but failed bundling: `Cannot find module 'babel-preset-expo'` (EAS shows "Cannot read properties of undefined (reading 'transformFile')"). `babel.config.js` names it, `apps/mobile/package.json` never declared it; local pnpm 9.12 hoists it, the host's pnpm 11.9 does not.
- `apps/mobile/package.json` devDependencies + `babel-preset-expo 57.0.10` (`5d5ded57`); `expo export` hbc hash identical before/after.
- Build `2b38d4c6-6c54-4a22-a096-fced58ac353c` → **FINISHED, 1.0.0 (5)**; `buildNumber` 5 committed (`ea2195c5`). Builds 3/4 never reached Apple.
**Decisions**: pinned to the version the lockfile already resolved for `@expo/metro-config` (one copy). Did not force pnpm 9 via `packageManager`/corepack — declaring the dependency is Expo's documented fix.
**Learnings**: "transformFile of undefined" on EAS = transformer failed to construct; the real error is ~90 lines earlier in the Xcode log. EAS logs are Brotli: `curl -s $url | node -e 'zlib.brotliDecompressSync'`. After every mobile merge the reference worktree needs `pnpm install`, not just `git pull`.
**Next steps**: `eas submit` to TestFlight Internal; nothing publishes without the owner pressing Submit.

## 2026-09-04 18:30 UTC — phase172: store sprint (Phase G) — legal pages, UGC report link, store copy; build blocked on an App ID capability

**Objective**: Phase G (run without waiting for approval): real legal pages, Apple 1.2 for UGC, a build from the frozen feature set, owner-only step list.
**Actions**:
- `apps/web/app/(public)/privacy/page.tsx` rewritten for the shipped app (processors Supabase / Vercel / Cloudflare / Resend / Apple; no location / IDFA). `terms/page.tsx` — §4 review rules + report path (hello@percho.co, 24 h), new §5 Tour requests, renumbered 1–12.
- `apps/mobile/app/community/[slug].tsx` — **Report** link under each approved review, `mailto:hello@percho.co?subject=Report review <id>`.
- `apps/mobile/app.json` `ios.buildNumber` 2 → 4 (EAS `autoIncrement`; nothing shipped as 3 or 4).
- `docs/ios-release.md` Stage 3: privacy-label table, `userGeneratedContent: true`, store copy draft, owner-only table. `RELEASE.md` bullet.
- EAS build `adeba44c-fe79-4b2d-8b1c-191e84334bbb` (1.0.0 (3), from `6eb7ac2f`) **Errored**; retry `6b984390` (1.0.0 (4)) cancelled.
**Decisions**: entity "Percho", not "Percho, Inc." (Individual enrollment; counsel-unreviewed). Report = mailto, not form + table (rare event, queue already human). Reviews not deletable in-app (phase170); remove via email or account deletion (Apple 5.1.1(v)). Not submitted / not pushed to TestFlight — owner's call; ASC key path in `eas.json` left to him. Store copy is a draft.
**Issues**: profile lacks `com.apple.developer.applesignin`; App ID `co.percho.app` (`6TNYULX4NA`) lists only `IN_APP_PURCHASE`. EAS syncs capabilities only with an Apple session, not with `EXPO_ASC_*`. ASC API fix (`POST /v1/bundleIdCapabilities`, `APPLE_ID_AUTH`) denied by sandbox policy — not worked around.
**Resolution**: no store build yet; one checkbox (Identifiers → `co.percho.app` → Sign In with Apple) + rebuild, documented in `docs/ios-release.md` Stage 3. Rest of Phase G merged.
**Learnings**: Apple 1.2 = filter / report / block / contact — moderation, mailto and legal pages cover all four. `autoIncrement` with `appVersionSource: local` edits `app.json` on the build machine; commit must follow. `usesAppleSignIn: true` is half the job — the App ID needs the capability too; should have been checked in Phase A. ASC: `APPLE_ID_AUTH`, setting `APPLE_ID_AUTH_APP_CONSENT`, option `PRIMARY_APP_CONSENT` (`SIGN_IN_WITH_APPLE` → 409).
**Next steps (owner)**: checkbox + rebuild, "Still owner-only" table, submit. Engineering: reviews on web `/c/<slug>`; port `ANTHROPIC_API_KEY` call sites in `lib/poi/*`.

## 2026-09-04 17:10 UTC — phase171: MLS go-live readiness note (Phase F)

**Objective**: Phase F — what stands between an MLS licence and live listings; settle render-for-new-listings and feed-without-film.
**Actions**: `docs/mls-integration/go-live.md` (new; the folder the `mls_tables` migration pointed at in July); one line in `ARCHITECTURE.md`. No code.
**Findings**: RESO/Bridge client and sync worker have never run (no creds, script, cron; `mls_listings` empty). Mirror → `listings` projection does not exist; today's 18 FMLS rows came from the retired scraper. Doc carries the column map (`source = 'fmls_bridge'`, `source_id = listing_key`, slug so `/v/fmls/<key>` survives, `external_*` for `listings_owner_chk`, photos into Storage for `listing_photos.storage_path`). Withdrawn listings need a nightly full sync — the watermark cannot see them.
**Decisions**: render on projection runs only the free **tag** step, **review** stays the owner's, `kenburns` default, `seedance` manual (only engine that bills). Feed: photo cards already default (`videosOnly` = 0), no change. No projection code against an empty mirror — ~150-line admin script later.
**Next steps**: owner secures the licence (§2), then §4's checklist. Phase G next.

## 2026-09-04 16:30 UTC — phase170: resident reviews with a human approval gate (Phase E)

**Objective**: Phase E — one review per signed-in resident per community (rating, up to four 1–5 dimensions, paragraph), visible only after human approval. No seed content (owner, 2026-09-03).
**Actions**:
- `supabase/migrations/20260904170000_community_reviews.sql` — table (`rating 1–5`, `dimensions jsonb`, `body 20–1200 chars`, `status pending|approved|rejected`, `unique (community_id, user_id)`), RLS: read `approved`; authenticated read own; insert/update own **only as `pending`**; no delete.
- `20260904171000_community_reviews_grants.sql` — default privileges grant ALL to anon/authenticated, so column grants were no-ops; revoked and re-granted (anon selects 8 columns, no `user_id` / `reviewed_at`; authenticated inserts 6 / updates 5). Pushed; `database.types.ts` regenerated.
- Web: `lib/communities/reviews.ts` (`projectCommunityReviews`, `cleanDimensions` → `quiet|walkable|friendly|value`), `CommunityDetailDTO.reviews?`; admin `/admin/pipeline/reviews` + `ReviewQueue.tsx` + `POST /api/admin/reviews` behind `requireAdmin()` (`lib/zod/admin-review.ts`); `reviews.test.ts` (4).
- Mobile: `lib/reviews/reviews.ts` (3 tests), `app/community/review.tsx`, **RESIDENT REVIEWS** section on `app/community/[slug].tsx` ("★★★★☆ · A resident · Aug 2026"; CTA → `/auth` when signed out).
**Decisions**: writes through RLS, no POST route — the policy is the validator. Edits re-enter the queue (`with check` forces `pending`) — cheaper than versioning. Update-then-insert, not `upsert`: PostgREST `ON CONFLICT DO UPDATE` touches `community_id` / `user_id`, which authenticated cannot update (42501 live). Anonymous to buyers and admin. Four closed dimensions Quiet / Walkable / Neighbourly / Value — no safety/schools (fair-housing proxies). Web `/c/<slug>` not rendering reviews yet.
**Verification**: live RLS smoke test with a throwaway user: pending insert ✓, `approved` insert 42501 ✓, short body 23514 ✓, delete refused ✓, anon sees 0 pending / 1 after approve / 0 after author edit ✓. Mobile `tsc` clean, vitest 528; web `tsc` clean, vitest 863. Phase D production check (phase169.1) after `92950ef0`: `/api/mobile/rates` 200 (`rate30 0.0671`), `/api/mobile/search?q=duluth` 3 listings / 24 communities, listing DTO carries `rentEstimate` / `schools` / `shareUrl https://www.percho.co/v/fmls/584501905`, `/api/mobile/community/windward` 200.
**Next steps**: Phases F, G. Owner: dimension names, the "Only people who live or have lived here" line (no proof asked), web reviews before launch?

## 2026-09-04 09:40 UTC — phase169: tab fixes for the store (Phase D) — cost, ROI, schools, search, compare, share, trust

**Objective**: Phase D — every tab usable with real, free data, no placeholder affordances. Owner offline ("don't get blocked by my approval"); decisions flagged.
**Actions** (`phase169/tab-fixes`, 3 commits):
- Rates: `apps/web/lib/rates/pmms.ts` (Freddie Mac PMMS), `GET /api/mobile/rates`, mobile `useRates()` with `DEFAULT_ANNUAL_RATE` fallback; `buildCost` adds 1%/yr upkeep.
- ROI: `lib/listing/roi.ts`; rent from `apps/web/data/rent-by-zip.json` (Zillow ZORI, asOf 2026-07-31, 8543 ZIPs, `scripts/admin/refresh-rent-index.ts`).
- Schools: GA `k12_schools` from NCES CCD 2023-24 + GOSA Milestones 2024-25 (`scripts/admin/import-ga-schools.ts`, 2270 schools); migration `20260904150000_k12_nces_schools.sql` adds `source='nces'` and `get_k12_nearest_schools(lat,lng)`; DTO `schools[]`; 15 GreatSchools rows updated in place.
- Coordinates: 6 null FMLS listings geocoded via `scripts/admin/geocode-listings.ts` (Census); all 18 have a point.
- Share: `listingShareUrl()` → `https://www.percho.co/v/<agent>/<slug>` or `/v/fmls/<sourceId>`; ↑ disc in `MediaCarousel`; community `/c/<slug>`.
- Search: `GET /api/mobile/search?q=` (`lib/zod/mobile-search.ts`, `lib/listings/search.ts` ilike, ≤24 each); `search.tsx` rewritten (debounced `useSearch`, grouped results, pins); fake "For sale" chip gone; `PEACH` / `#E8E2D6` → tokens.
- Feed: `ExhaustedCard` "Adjust my scope" opens the scope sheet; "Browse map" → Search.
- Dead code: 33 unimported files + `scripts/probe-hotspots.ts` deleted; one assertion moved to `redline-type.test.ts`.
- Compare: Saved picker, 2–3 homes → `/compare` (`lib/listing/compare.ts`). You tab: Privacy / Terms / Contact rows, "Percho 1.0.0 (build 2)". Trust: "Sources · N" link ink2/600; no-placement-fees paragraph.
**Decisions** (owner to confirm): no composite school rating or compare "winner" — state proficiency % only, `gs_rating` never shown. ZORI is an editable DEFAULT, never "this house rents for". Share uses `SITE_ORIGIN`, not request host. Areas segment kept (`AreaFace` still draws a bookmark). Trust copy and `lib/feed/persona.ts` names pending review. Additive backfills without a plan doc (6 coordinates, 15 rows enriched, 2255 inserted) — reversible.
**Verification**: mobile `tsc` clean, biome 0 errors (8 pre-existing warnings), vitest 525; web `tsc` clean, biome 2 pre-existing errors, vitest 859. Production check — see next entry.
**Next steps**: Phase E, F, G.

## 2026-09-04 10:20 UTC — phase168.1: verified in production; the lead email was broken since the rename

**Objective**: prod verification of phase168.
**Actions**:
- POST `/api/mobile/events`, 2-event batch → `{accepted:2}`; re-sent → still 2 rows ((install_id, seq) dedupe works).
- POST `/api/leads` on an external listing (agent_id null) → 201, routed to the owner's is_admin agent; `notified_at` null, `notify-lead` → `{"error":"resend_failed","status":403}`.
- Fix, infra only: `supabase secrets set RESEND_API_KEY=<current> RESEND_FROM="Percho <notifications@percho.co>" PUBLIC_APP_URL="https://www.percho.co"`.
**Issues/Resolution**: Edge Function secrets dated 2026-06-09 — pre-rename, before percho.co was verified in Resend (2026-07-11). Lead email broken in prod since the rename; unnoticed because nothing created leads. After fix: fresh lead `notified_at` ~20s after insert. Two "Percho Test … ignore" leads left as evidence.
**Learnings**: verify the config half (secrets, vault) end-to-end after every identity change — "row lands, email skipped" is invisible.

## 2026-09-04 09:40 UTC — phase168: the tour CTA becomes a lead; telemetry stops being thrown away (Phase C)

**Objective**: store-launch Phase C — "Request a tour" creates a lead; the mobile event queue drains to a server.
**Actions**:
- Migration `20260904120000_mobile_events.sql` (applied): one table, `type`/`seq`/`at`/`listing_id` lifted, `payload` jsonb, unique (install_id, seq); `listing_id` not an FK (survive listing deletion). RLS on, no policies. Types regenerated `--linked`.
- `POST /api/mobile/events`: `lib/zod/mobile-events.ts` bounds only (batch ≤100, event ≤4KB, uuid installId), unknown types pass through; optional Bearer → `user_id`; 12/min per install.
- `POST /api/leads`: falls back to the oldest `is_admin` agent when `listing.agent_id` is null.
- Mobile: `lib/install-id.ts`, `lib/events-transport.ts` (≤100-event POSTs, ack only if all land), wired in `_layout`. `TourRequestSheet` posts `/api/leads` with `source: "mobile_tour"`, behind the save sign-in gate.
- 7 zod tests (`lib/zod/__tests__/mobile-events.test.ts`).
**Decisions**: `/api/leads` already did everything (zod, `agent_id` derivation, AFTER INSERT → `notify-lead`); the gap was client wiring. Backfilling `agent_id` on the 6 external listings hit `listings_owner_chk`; route fallback touches no data.
**Issues/Resolution**: `StyleSheet.absoluteFillObject` gone in RN 0.86. Sentry not scaffolded — needs an owner DSN.
**Verification**: root typecheck 0, mobile lint 0 errors, mobile 635 / web 845 green.
**Next steps**: prod checks; owner device pass; Phase D (tab fixes, Compare, cost breakdown, schools, share).

## 2026-09-04 08:20 UTC — phase167: accounts on the phone (store-launch Phase B)

**Objective**: v1 accounts (owner decision 2026-09-04): Sign in with Apple + email code, Saved synced, in-app deletion (App Review 5.1.1(v)). Sign-in required only to save.
**Actions**:
- Migration `20260904090000_mobile_auth_saves.sql`: authenticated RLS (`user_id = auth.uid()`) + grants on `saved_listings` / `saved_communities`; save writes `device_id = user_id::text`.
- Mobile: `lib/supabase.ts`, `state/auth.ts`, `lib/auth.ts` (Apple id-token, email OTP, sign-out, delete), `app/auth.tsx`; `app.json` `usesAppleSignIn`, publishable key in `extra`.
- `state/saved.ts` v3: server is truth; pre-account saves pushed ONCE (`migratedAt`); gate in `toggle` (signed out → `/auth`) covers all five call sites. 7 vitest cases.
- You tab ACCOUNT section; Saved tab signed-out state = sign-in prompt.
- Web `DELETE /api/mobile/account`: `auth.getUser(token)` then service-role `admin.deleteUser`.
**Decisions**: OTP over magic link (browser round-trip + redirect allowlist). Push-once — re-pushing resurrects saves removed elsewhere.
**Issues/Resolution**: mobile deps re-hoisted `@types/react@19` into next@14's reach; pinned web devDeps `@types/react@^19` / `@types/react-dom@^19` (runtime React 18) + tsconfig `paths`. Supabase auth config (Apple client id `co.percho.app`, `mailer_otp_length` 8→6, template emitting `{{ .Token }}`) PATCH permission-blocked — OWNER ACTION. Expo Go lacks the Apple entitlement; `isAvailableAsync` hides the button.
**Verification**: root typecheck 0, mobile lint 0 errors (16 pre-existing warnings), mobile 635 / web 838 green. Not on device.
**Next steps**: auth-config PATCH; owner device pass; Phase C.

## 2026-09-04 07:25 UTC — phase166: hard-delete the 249 FMLS listings without videos

**Objective**: owner: listings "are from fmls, they are not legal" — "keeping the ones with videos should be fine for demo purpose, but lets cleanup others". Hard delete, asked and answered.
**Actions**: new `scripts/admin/delete-non-video-listings.ts` (dry-run default, `--apply`, JSON snapshot to `~/Percho-backups/`). Keep = feed's `videosOnly` rule (`fetchBrowseCardsVideosOnly`): `listing_videos` `status='ready'` with a media column.
**Decisions**: mirrored the serving query so survivors = what the feed showed. Storage removed path-precise, never by prefix (`listing-photos` holds POI photos). Leads (no cascade) deleted first.
**Verification**: 267 → 18 kept, 249 deleted; 2,329 `listing_photos` / 4,626 objects removed; zero leads/clips/`listing_videos`/`generated_videos` — no orphaned Cloudflare Stream assets. Prod `/api/mobile/feed`: 12 listings + 12 communities + 109 geoUnits; detail 200.
**Issues/Resolution**: `pnpm lint` fails on 2 pre-existing `apps/web` errors (`TopBar.tsx` a11y); biome skips `scripts/`.
**Learnings**: `mls_listings.our_listing_id` is `on delete set null` — MLS mirror rows remain, server-side only.
**Next steps**: phases B–E; questionnaire review decides the Phase D cut.

## 2026-09-04 05:20 UTC — phase165: a high school opened the Windward film

**Objective**: owner — "Windward - why the assembly video starts with high school???"
**Issues/Resolution**: shot 0 is `60.jpg`, Alpharetta High School's sign, labelled "Windward Entrance". (1) `amenity.ts` walks a fixed order (`entrance, clubhouse, pool, …`) — no scoring. (2) All 44 photos sit on `Windward Amenities`, so the Curator reads each as the community's own: `chip_label: "Windward Entrance"` beside `vo_line: "Alpharetta High School is located within the immediate vicinity."`. `vision-tagger` likewise called `63.jpg` "a baseball field at the Windward community". 3 of 33 clips affected: `60.jpg`, `64.jpg` (Avalon), `75.jpg` (downtown Alpharetta).
**Actions**: the 20 non-Windward photos (school 4, Avalon/City Center 14, house 2) set `status='rejected'` with reason. 25 remain eligible (`shots.ts`: `source === 'community_site' && status !== 'rejected'`). phase162/163/164 timestamps corrected against `git log` (20:15 09-03, 04:08, 04:52 09-04 UTC).
**Decisions**: no prompt change — the guard (POI name as LOCATION HINT in `vision-tagger.ts` / `curator.ts`) waits on owner intent.
**Learnings**: a `community_site` photo inherits its POI name as fact in tagger and Curator.
**Next steps**: owner re-runs `pnpm tour windward --steps plan,generate,assemble`.

## 2026-09-04 04:52 UTC — phase164: the dead POIs deleted, the 44 tagged

**Objective**: owner — "1) you have permission to delete, 2) already bought credit".
**Actions**:
- Delete: all 7 POIs carry `google_place_id` `percho:community:8a168948…`, 24 photos untagged; removed 24 Storage objects, 24 `poi_photos`, 7 `community_pois`, 7 `pois`, children first. Verified empty.
- Tag: `gemini-3.5-flash` now `ok`; `runTag` over `windward`: 44/44 in 103s; `runFilter` judged 28, rejected none, 0.90–0.95; run → `status='review'`.
- `run-community-tour.ts`: `tag` added to step list — previously admin-chip only, though `ingest-community-photos.ts` creates POIs AFTER `photos`.
**Decisions**: stopped at the review gate (rule since 2026-08-19); `69.jpg`, `74.jpg` are 296×197.
**Verification**: `windward` 18 POI links / 101 photos; `Windward Amenities` 45, all tagged; `lake-windward` inactive, empty.
**Next steps**: owner reviews in /admin, then `pnpm tour windward --steps plan,generate,assemble`.

## 2026-09-04 04:08 UTC — phase163: follow FMLS, merge Lake Windward into Windward

**Objective**: owner — "lets follow fmls in this case, and merge the lake-windward to windward **with** all 44 photos, also they should belong to community poi instead of 7, and we do not have pic limit for community poi itself when building the video".
**Actions**:
- All 44 onto `Windward Amenities` (`percho:community:<windward-id>:amenities`, 1 → 45), including phase162's 20 excluded.
- New `scripts/admin/merge-communities.ts`; `lake-windward → windward`: listing repointed, 7 POI links moved, boundaries 2 + 4 → 6 rings, source `status='inactive'`.
- 7 duplicate amenity links → `status='rejected'` on `community_pois`.
**Decisions**: one POI — `communityActSlots` (`tour-orchestrator/amenity.ts`) budgets clips per TAG-derived `Amenity`. Boundary carried: `find-community.ts` is point-in-polygon and windward's polygon excludes 2090 Lake Windward Dr. `rejected` not `archived`: `photos.ts` filters `.eq('status','approved')` and `.neq('status','rejected')`.
**Issues/Resolution**: deleting the 7 POIs + 24 photos blocked by the harness auto-mode classifier; not worked around. Tag blocked on Gemini credit (phase160).
**Verification**: `windward` active, 6 rings, contains listing; `lake-windward` inactive; 18 links / 101 photos.
**Next steps**: top up Gemini → tag → regenerate; reject `69.jpg`, `74.jpg`.

## 2026-09-03 20:15 UTC — phase162: the Windward amenity photos, and which Windward they belong to

**Objective**: owner — "windward community 照片加到哪里了". Nowhere: phase155 imported 35 house photos, only recorded the 44 community shots. Owner: into `lake-windward`, understand the two rows first.
**Actions**:
- 24 photos into `lake-windward` via `ingest-community-photos.ts` as 7 synthetic POIs — Waterfront (6), Golf Course (6), Marina (5), Playground (3), Swim Park (2), Clubhouse (1), Picnic Pavilion (1).
- Script: `--source-note` flag — hardcoded "<Community> community website" was false for FMLS agent photos.
**Decisions**: neighbours, not duplicates (Nextdoor seeds): `lake-windward` (`lakewindward`, 1,327 residents, 34.0835,-84.2343, 4 rings/1180 verts) vs `windward` (`windward`, 4,589, 34.0976,-84.2386, 2 rings/102 verts); 2–3% overlap. 2090 Lake Windward Dr inside `lake-windward` only — no merge. FMLS says WINDWARD, Nextdoor Lake Windward; app follows the polygon. Of 44: 24 amenities in, 14 Avalon/City Center out, 6 school/house out.
**Issues/Resolution**: script inserts `status: 'approved'`, no review pass. Tagging blocked: `GEMINI_API_KEY` out of credit (phase160).
**Next steps**: top up Gemini, tag `lake-windward`. `windward` (18 POIs, 57 photos) untouched.

## 2026-09-03 15:50 UTC — phase161: Expo SDK 54 → 57, because Expo Go on the phone moved first

**Objective**: phone shows "Project is incompatible with this version of Expo Go" — Expo Go auto-updated to SDK 57; no older Expo Go on iOS.
**Actions** (`apps/mobile` + lockfile):
- `expo@~57.0.19` via `expo install --fix`: RN 0.81.5 → 0.86.3, React 19.1 → 19.2.3, reanimated 4.1 → 4.5, gesture-handler 2.28 → 2.32, worklets 0.5 → 0.10, react-native-maps 1.20.1 → 1.27.2, screens 4.16 → 4.26, TypeScript 5 → 6.0.3, expo-router 6 → 57.
- `app.json`: dropped `newArchEnabled`; `expo-font`, `expo-status-bar` in `plugins`.
- `StyleSheet.absoluteFillObject` → `StyleSheet.absoluteFill` (23 sites); `showsPointsOfInterest` → `showsPointsOfInterests` (`app/(tabs)/search.tsx`).
**Issues/Resolution**: SDK 54 CLI's `expo install expo@^57.0.0 --fix` resolved to `expo@~54.0.37` and looped. Order: hand-edit `expo` to `~57.0.19`, `pnpm install`, THEN `expo install --fix`.
**Verification**: `expo-doctor` 21/21; typecheck (TS 6) clean; biome 0 errors (16 pre-existing warnings); mobile 628 + web 838 tests; `expo export --platform ios` clean (4.0 MB hbc); `expo config --type prebuild` resolves.
**Learnings**: SDK 56 decoupled expo-router from React Navigation (no codemod). Expo Go on iOS only supports the latest SDK — the next bump breaks the phone again.
**Next steps**: owner reopens in Expo Go (Metro + ngrok restarted). TestFlight 1.0.0 (2) predates this.

## 2026-09-03 09:45 UTC — phase160: 36 tracks generated, and the Gemini balance ran out

**Objective**: owner on phase158's "not done" — "补曲!".
**Actions**: new `scripts/admin/generate-bgm.ts` — same library/prompts/gate as `/api/admin/bgm/generate`; a script because the route is cookie-gated, 4 tracks / 300s. Smoke-tested one track first.
**Decisions**:
- 38 from `MIN_ENERGY_SHARE` (each energy ≥25% of its vibe): +10 acoustic moving, +13 acoustic still, +9 piano, +6 electronic, $0.08 each.
- Sidecar written BEFORE upload, per track — `pull-bgm.sh` treats an unknown object as APPROVED.
- Nothing approved; all `pending` for /admin/pipeline/bgm.
**Issues/Resolution**: 36 of 38 landed, $2.88. Last two `RESOURCE_EXHAUSTED` "Your prepayment credits are depleted"; plain `gemini-3.5-flash` gives the same 429 — the whole `GEMINI_API_KEY` is out. Casualties both `electronic/moving` (14%); harmless while `chooseBgm` passes no energy.
**Verification**: acoustic 28 → 51 (25/13/13), piano 3 → 12 (6/3/3), electronic 3 → 7 (3/1/3).
**Learnings**: anything uploading to `bgm/` must register in the sidecar first.
**Next steps**: owner reviews 36 pending; top up Gemini before any tour/narration/tagging job.

## 2026-09-03 09:30 UTC — phase158: three tracks were carrying a third of the book

**Objective**: owner — "Carefree Living / acoustic · bed — why almost all home tours use this music??? can we make music evenly distributed?"
**Actions** (`lib/bgm/select.ts`, wired into `chooseBgm` and `chooseListingBgm`):
- `MIN_ENERGY_SHARE = 0.25`: energy filter applies only while it leaves ≥ a quarter of the palette.
- `usage`: least-used track (same film type, per listing/community) wins; seed breaks ties.
**Decisions**: premise wrong — 18 home tours, 18 different tracks; Carefree Living only in the Windward film. But `selectBgm` over 262 listings: three tracks on 82 (31%) — energy was a HARD filter over a lopsided library (acoustic 24 `gentle` / 3 `moving` / 0 `still`; piano 3). Incumbency still beats usage. Share, not a count of 8 (would break the `prefers the asked-for energy` test).
Busiest / top-3 share: before 30 / 31%; floor only 14 / 16%; floor + usage 11 / 12%. 31 of 34 tracks in play.
**Issues/Resolution**: NUL byte in `listing-tour-steps/assemble.ts` — the space in `` `${row.listing_id} ${path}` `` written as `\x00`; git showed `Bin 11223 -> 11680 bytes`. Fixed in phase159. `pnpm lint` still fails on 2 pre-existing errors (`app/api/research/responses/route.ts`, `lib/zod/__tests__/research-response.test.ts`).
**Verification**: `pnpm typecheck`, `pnpm test` (838 web + mobile) pass.
**Learnings**: the 2026-08-23 planner move bought stability at the cost of variety; the share floor is the general guard for any hard filter over an unbalanced library. A `Bin` line for a `.ts` file deserves a glance.
**Next steps**: library still lopsided (0 acoustic `still`, 3 piano); Lyria spend not asked for.

## 2026-09-03 09:20 UTC — phase157: a step claim that nothing could clear

**Objective**: owner: 「Why is it still pending：6 · Render running… 4m 20s」, then 「fix it」.
**Issues/Resolution**: `generate` finished 08:47:52.697 (`created: 0, requeued: 0`); run `status='assembled'` 08:56:19. Caught live: `step_results.active` flipped to `{assemble, 08:56:18.841}` then back to `{generate, 08:47:50.268}`. `saveStep(sb, run, 'assemble', …)` merged onto the route's PRE-CLAIM snapshot (whole-JSONB write), restoring the old `active`; `clearActiveStep` saw an older `started_at` and, by "only your own claim", declined. Self-perpetuating; red at `ACTIVE_STALE_MS` = 5.5 min.
**Actions**: `apps/web/lib/poi/tour-steps/shared.ts` — `mergeBase()` re-reads before any `step_results` write; `mayClearClaim()` clears your own or anything OLDER. New `active-claim.test.ts`, 4 cases. Cleared Windward's marker (`3a11c4d6`) by hand.
**Decisions**: rejected an atomic `step_results = step_results || patch` RPC — migration + types regen for a UI marker bug. One extra read per write accepted.
**Verification**: `pnpm typecheck` clean, `pnpm test` 833/833 (4 new), lint clean.
**Learnings**: a guard that cannot tell "not mine" from "already dead" deadlocks on its first missed `finally`.
**Next steps**: strip shows a stale claim as red `failed`; a "lost track" state if it recurs.

## 2026-09-03 09:00 UTC — phase156: reframing is a manual action, never an automatic one

**Objective**: owner: 「seeing a lot photos have queued tasks for Reframed outpainted to 2:3？why？it is expensive」, then 「never reframe automatically」 and 「keep the reframe function but only allow manual action」.
**Issues/Resolution**: Windward (`ef8e204b`): 19 reframed, 16 fired at 08:34 with the plan step; all landscape. `needsOutpaint()` at `OUTPAINT_MIN_CROP_LOSS = 0.35` vs 9:16: 4:3 loses 0.58, 16:9 0.68, 3:4 0.25 — the gate meant "is this landscape?". No recent changes (`outpaint.ts` since phase71 `62172d2e`). Reframes to date 118 (~$10.6 at $0.09): Apremont - Highcroft 34, Aberdeen 33, Bellmoore Park 23, Ashley Crossing 20, Windward 19.
**Actions**: `apps/web/lib/poi/tour-steps/photos.ts` — automatic queueing blocks, `selectOutpaintCandidates()`, counters `outpaint_queued`/`rescueQueued` deleted; comment records the decision. `apps/web/lib/poi/outpaint.ts` header rewritten. 8 insertions, 114 deletions.
**Decisions**: kept `outpaint.ts` as the tested mirror of `worker.py` `process_outpaint`'s guard. Rejected threshold 0.65 (19 → 6) — owner asked for zero automatic spend. Costs flagged: centre-crop returns (phase71's 63% median loss); phase73.23's `tooLowRes` rescue is manual again.
**Verification**: `pnpm typecheck` clean, `pnpm test` 829/829, lint clean; 2 pre-existing biome errors untouched.
**Learnings**: the "outpainted to 2:3" hint is wrong — `worker.py` sends `aspectRatio: "9:16"`, returns 768x1376 (0.558), film renders 1080x1576 (0.685); likely phase71's re-render drift.
**Next steps**: decide whether the worker should skip a hand-queued well-framed photo; fix the "2:3" hint; consider a free Ken Burns pan.

## 2026-09-03 08:55 UTC — phase155: 2090 Lake Windward Drive, imported from Redfin

**Objective**: owner handed over a Redfin URL (2090 Lake Windward Dr, Alpharetta) and asked for a new listing.
**Actions**:
- New `scripts/admin/import-redfin-listing.ts`; one listing + 35 photos written to production.
- Listing `f18bda46-dd90-421c-97c0-45aba52aa928`, slug `2090-lake-windward-drive`, agent `vivzh123`, status `active` (owner's call, agent his choice). 4/4.5/4,641 sqft, built 2001, 0.40 ac, HOA $81/mo, $1,175,000; `community_id` = `lake-windward`.
- Provenance (no column on an agent-owned row): FMLS #7754807, RHONDA SHELL, Keller Williams North Atlanta, listed 2026-04-18, $1,250,000 → $1,200,000 → $1,175,000.
- Redfin serves its API bodies inside `root.__reactServerState.InitialContext`, each prefixed `{}&&`: `aboveTheFold`, `mainHouseInfoPanelInfo`, `belowTheFold`, `photoTagsAndCaptions` (→ `alt_text`); remarks from `ld+json`.
- Gallery has 79 photos; the house is the leading run of `7754807_<n>_<letter>` sharing the primary's letter (`_U`) = 35. The other 44 are community shots (lake, marina, golf, Avalon); script prints every skip.
**Decisions**:
- Agent-owned (`agent_id` set, `source` NULL), as phase147 — the `listings_agent_or_external_chk` XOR makes `source='redfin'` an ownerless row the dashboard cannot see.
- Community by `lib/geo/point-in-polygon.ts` over the city's boundaries (same test as `lib/geo/find-community.ts`), not by eye; one hit.
- Insert inactive, upload, set cover, then flip status + `published_at` as `publish-actions.ts` does — never a live page with an empty gallery.
**Issues/Resolution**: Supabase Storage returns `429 too_many_connections` around the 30th upload; killed the first `--apply` at photo 29 (resumable) and failed the worker's enhance pass on 11/35. Added a 4-attempt backoff; re-queued the 11 by hand — all 35 `approved`/`queued`.
**Verification**: `www.percho.co/v/vivzh123/2090-lake-windward-drive` returns 200.
**Learnings**: this storage tier will not take ~35 flat-out uploads while a worker runs. The 44 skipped photos are a ready `lake-windward` set for `ingest-community-photos.ts`.
**Next steps**: tag → plan → generate → assemble in /admin/pipeline/tour-jobs when the owner wants it. Unchanged: DEVLOG rotation, `relocation-v1`.

## 2026-09-02 14:45 UTC — phase154: the listing goes live; video segmentation paused

**Objective**: owner stopped segmentation — 「镜头切换的太突然 不连贯 没有原来4条拼接版本好，先暂时不接着做视频的切分了」 — and asked why the photo tour is invisible on iOS, plus Cloudflare links for Vivian.
**Actions**:
- iOS cause: `status='inactive'` (my phase147 choice, not a bug). `lib/feed/browse-cards.ts` filters `status='active'` in seven places; `lib/listings/feed-load.ts` defaults `statuses=['active']`; no `published_at` gate exists in the feed path.
- Activated as `publish-actions.ts` does: `status='active'` + first-activation `published_at`.
- Renders, all `readyToStream`: agent footage + Mandarin narration `c3280f9e2288f66ad7871820690bc386` (138.5s, 1080x1576); photo tour vertical/iOS `0a28f9e007d87d58f32b7e20f6135a9b` (33.5s); photo tour landscape/web `633348cce2e71d4c4990adc9b9ac3843` (33.0s, 1920x1080).
**Decisions**: segmentation parked — phase153's pool is 16 shots with no transitions, order or narration, so it reads worse than phase150's continuous concat. Spikes stay in `scripts/spikes/` with findings in phases 149–153.
**Verification**: `percho.co/v/vivzh123/2930-shoalwood-drive` 200 with the landscape uid; `/api/mobile/feed` returns the listing with `videoUrl` on the square cut.
**Learnings**: a clip pool cannot be judged or shipped without the planner and audio spine meant to sit on top of it.
**Next steps**: none started. Open on resume: narration as continuous spine under a free picture order, or order constrained to keep each clip's audio whole.

## 2026-09-02 09:10 UTC — phase153: length is a result, not a target

**Objective**: owner on phase152 — 「不要限定3-6秒 要以事实为依据 有结构的拆分 然后再重组 如果原视频保留就是最好的 那就保留」. He is right: phase152 cut the 23s exterior approach into five 4.5s pieces; whole it scores quality 0.90 / hero 0.95, best in the set.
**Actions**: `shred_clips.py` rewritten — no target or maximum length. A boundary exists only at a Gemini subject change or where a measured smear+motion span is removed. Only rule left: a 2.0s floor (a shorter remnant cannot carry a caption).
- Result: 16 clips, 127.6s, 2.0–23.0s: `https://customer-4vgbwrmdsd3h7zzb.cloudflarestream.com/d5a5bc24718a56c762246186a93cbaed/watch`. `b83c1f55-01` 23.0s whole take; `8e4c9c56-04` 18.0s dining; `8e4c9c56-05` 15.0s kitchen; the upstairs take (all 9 damaged seconds) → seven clips of 2.0–9.5s.
- vs phase152: 28 → 16 clips, pool longer (121.2s → 127.6s) since sub-target remnants rejoin their shot.
**Issues/Resolution**: cut-reason label called the piece to camera "unusable span removed" — it compared against Gemini's segment end, which overruns the real duration. Now asks the damage set directly; reads "subject change".
**Learnings**: Gemini segmentation is non-deterministic (8 vs 4 segments for the same take across runs); production must PERSIST the timeline once (`listing_videos.ai_tags`, phase149 estimate), not re-derive per render.
**Next steps**: unchanged — narration as a continuous spine (`mux_audio` already does this) or an order that keeps each clip's own audio whole.

## 2026-09-02 08:30 UTC — phase152: the footage becomes a clip pool

**Objective**: owner rejected phase151 — 「静帧推镜不可以接受，有很多卡的地方 或者突然有些奇怪的画面」 — and asked 「你能不能把原视频裁剪成多个几秒的clip 每个clip都有信息量 然后最后再统一plan」. A push on a still reads as a stall, worse than the smear it hides.
**Actions**: `scripts/spikes/shred_clips.py`, `scripts/spikes/pool_preview.py`. Result 28 clips, 121.2s, all real footage: `https://customer-4vgbwrmdsd3h7zzb.cloudflarestream.com/a748d8bba0fcc5e810ce1e7db1399cc7/watch`. Kitchen 8, bedroom 6, exterior 5, living 4, hallway 3, stairs 1, dining 1; 14 clips hero >= 0.7, one below 0.4.
**Decisions**:
- Cut inputs: per-second smear/motion (no unusable second in a clip), Gemini's room timeline (never straddle rooms), 3–6s target (for 「单个镜头时间很长」). Each clip re-tagged on its own so 「有信息量」 is verified per clip.
- Preview silent (judged on picture; clip audio is sentence fragments). Labels via PIL because this ffmpeg lacks `drawtext`; `pool_preview.py` runs under `.venv-render`'s python.
**Issues/Resolution**: first draft dropped any second above corpus-p90 motion, discarding 9 of the exterior's 23 seconds — the SHARPEST footage (blur 3.6–6.2 vs 7.5 median) and source of hero 0.90/0.95. Now only smeared-AND-moving disqualifies; thresholds are ABSOLUTE constants calibrated once on the four-clip corpus, not percentiles. Exterior → five clips at 0.90; pool 25 → 28.
**Learnings**: motion alone is not damage — phase151's own note warned this and I walked into it one commit later.
**Next steps**: deferred — narration no longer matches a reordered picture: (a) continuous spine (what `mux_audio` does) or (b) order constrained to keep clip audio. Then the planner; clips carry `room_type`, `quality`, `hero_score` for `photo_selector.build_plan`.

## 2026-09-02 07:45 UTC — phase151: yes, it can be broken up — but only if the audio stops being part of the cut

**Objective**: owner on phase150 — 「先不用管web」, 「需要granular control 视频画面有些抖动 有些画面不清楚 单个镜头时间很长 打碎之后重新拼凑的可能性大不大」. Answer with measurement and a rebuilt clip.
**Actions**: `scripts/spikes/clip_quality_probe.py` (unusable seconds) and `scripts/spikes/recut_clip.py` (rebuild picture, keep voice). Re-cut: `https://customer-4vgbwrmdsd3h7zzb.cloudflarestream.com/2be43a2849e32df49d2af509cbac80f1/watch`.
- Probe: `blurdetect` for smear, `tblend=difference` + `signalstats` YAVG for motion, per second; unusable only when BOTH. 11 of 140 seconds (8%): `8b85be07` 9s (6-8, 13-15, 33-34, 37-41), `8e4c9c56` 2s (6-7, 11-12), `8e231af0`/`b83c1f55` clean.
- `deshake` on the worst 9s: blur 9.22 → 9.32, motion 7.828 → 8.208 — worse. Blur is baked into frames; bad windows must be REPLACED.
- Recut: each bad window covered by a slow push on the sharpest frame of the preceding 1.5s (by `blurdetect`). Output 44.56s vs 44.57s source; voice never drifts.
**Decisions**: audio is the spine and never moves; picture is free underneath. 13-15s sits inside 「然后上来了之后，首先是一个开放式的楼上的小客厅」 (7.0–14.8) and 37-41s straddles two sentences — cutting audio with video takes words out of her mouth.
**Verification**: before → after: blur p50 7.51 → 7.95, p90 10.77 → 10.39; motion p50 4.222 → 3.261, p75 7.129 → 4.625, p90 9.889 → 6.814. Whip-pans gone; blur p50 slightly worse (zoom on a still is softer than sharp handheld).
**Learnings**: percentile thresholds make single-clip and four-clip runs incomparable; production needs absolute thresholds calibrated once. Decoupling picture from voice also answers 「单个镜头时间很长」 — a 57s take becomes a source to cut from via Gemini's phase149 boundaries.
**Next steps**: feature shape = audio spine + free picture track: segment tags in DB, admin timeline to keep/drop/cover windows, assembler treating agent audio as spine. Nothing started.

## 2026-09-02 07:05 UTC — phase150: the agent's own cut, end to end, before any pipeline work

**Objective**: owner picked option 1 — the Chinese-language cut IS the main film. Prove the artefact before the planner: can her four clips be one watchable film?
**Actions**: `scripts/spikes/build_agent_cut.py` + Cloudflare Stream upload; no model calls, no schema change, nothing attached to the listing. 138.5s, 1080x1576, narration + music: `https://customer-4vgbwrmdsd3h7zzb.cloudflarestream.com/c3280f9e2288f66ad7871820690bc386/watch`.
- Order from her words: `8e231af0` hook 「跟着小云一起来看房」 → `b83c1f55` exterior, ends 「我们进去看一下」 → `8e4c9c56` main floor → `8b85be07`, opens 「好，我们去楼上看下」.
**Decisions**:
- Hard cuts, not `process_listing_assembly`'s 0.5s crossfades — her sentences run to the clip edge.
- Audio chain is `mux_audio` verbatim with her track in the TTS slot (`loudnorm I=-14`, music `I=-26`, `sidechaincompress`, 2s fade). Measured -16.8 LUFS, -0.9 dBTP, LRA 7.2.
- Music `piano/ai-luxury-*`, `paletteForListing`'s pick for a 2026 top-percentile build.
- iOS canvas only: 720x1280 scales 1.5x to 1080x1576 (loses 18% top/bottom); the 1920x1080 web canvas would be a centre-cropped strip — web unresolved.
- Did NOT publish into the existing `walkthrough` row (`ad06dc79`, from a photo tour the owner ran 05:33–05:55 UTC today). Handed over as a URL; `listing_videos` untouched.
**Learnings**: the artefact cost four ffmpeg invocations and no model spend — the pipeline is for the hundredth listing, not the first.
**Next steps**: owner watches. If it replaces the photo film: clips into storage + `listing_videos`, an assemble path concatenating agent footage with its audio, decide web. If her voice goes over the PHOTO film instead, `mux_audio` already takes the segments.

## 2026-09-02 06:30 UTC — phase149: can Gemini tag a walkthrough like a photo? Yes — and she is speaking Chinese

**Objective**: owner sent four videos Vivian recorded — 「We should tag videos just like what we do for photos, so we know how to orchestrate the home tour, can you give me some understanding of how difficult it is and how expensive it is」 — and chose Gemini over local faster-whisper for now.
**Actions**: `scripts/spikes/video_tag_probe.py` — one Gemini call per video for a room-level timeline + verbatim transcript in `photo_tagger.py`'s shape; model `GEMINI_VISION_MODEL=gemini-3.1-flash-lite`.
- Material: 720x1280, one continuous take each (scene detection finds 0 cuts): `8e231af0` 13.8s to camera in kitchen; `b83c1f55` 22.9s exterior; `8b85be07` 44.6s hall → storage → stairs → landing → bedroom; `8e4c9c56` 57.3s kitchen → dining → bedroom.
- Finding: narration is Mandarin, all four (opener 「跟着小云一起来看房，100万在亚特兰大，能够买到什么样的新房…」). Transcripts logged verbatim in full in the original entry.
- The house is standing — owner corrected phase147's "does not exist yet"; her words match the row (3400 sqft vs 3,476; 五房4.5卫; 100万/降价 vs $1,057,242 was $1,282,992). JW photos are the Waterstone MODEL, so footage and photos will not intercut cleanly.
- Cost: 17,549 tokens, 14.1s wall clock for 138.5s of video (per clip 2,239 / 2,970 / 5,692 / 6,648 tokens) — a fraction of a cent at flash-lite rates; `ai_usage_log` covers only `listing_copy`/`social_copy`, so this is arithmetic, not a bill.
- Quality: 44.6s clip → seven segments (hallway 0–3.8, closet 3.8–6.8, stairs 6.8–14.3, landing 14.3–27, bedroom 27–34.5, hallway 34.5–40.5, landing 40.5–44.5) with `quality`, `hero_score`, `usable`. Gap: speech timing coarse (13.8s clip = one 0–14.2 span); word-level needs `gemini-3.5-transcribe` or faster-whisper.
**Decisions**: estimate only, nothing built — migration `listing_videos.ai_tags` + `tagged_at`; spike beside `photo_tagger.py`; admin timeline review; the planner learning a shot can be "file X, seconds 14.3–27" (the real work — `photo_selector.build_plan` emits `{photo_id, duration_s, engine}` via `listing_photo_clips`); assembler carrying segment audio (`mux_audio` already ducks BGM under voice).
**Learnings**: the transcript is worth more than the tags — under-cabinet lighting, transom privacy, loft-as-study are `listing_insights` material no vision model infers from stills.
**Next steps**: owner decides whether the Chinese cut is the main film, a second-language variant, or a source for English TTS — on-strategy per CLAUDE.md §1, but it blocks the design.

## 2026-09-02 05:50 UTC — phase148: the home tour can fetch its own photos

**Objective**: owner on phase147's listing — 「1) agent name should be Vivian, 2) you need to add a manual fetch button (with some web urls) before tag in admin home tour - similar to community tour」.
**Actions**:
- `agents.name` for `vivzh123` → `Vivian`; listing `4159c606-71ed-46d5-b612-306277f3f05e` reassigned from `royxue812`. Path now `/v/vivzh123/2930-shoalwood-drive`; slug untouched so her existing links survive.
- `lib/poi/ingest-listing-page-photos.ts` — new, writes `listing_photos`.
- `lib/poi/ingest-page-photos.ts` — `collectPagePhotos` lifted out of `ingestPagePhotos`; community path unchanged.
- `app/api/admin/listings/[id]/ingest-url/route.ts` — one page per request, mirrors the community route.
- `app/admin/_components/ListingPhotoSourcePanel.tsx` — textarea, one URL per line, fetched SEQUENTIALLY (parallel crawls at one origin trigger 403s); above `TourStepStrip`; open by default only when the listing has no photos.
- `ListingPhotoIngest` in `lib/zod/schemas.ts` — community twin minus `label`.
**Decisions**:
- Photos land `approved`, not `pending`: migration 20260821100000 already inverted `listing_photos` on the owner's instruction ("all the photos in the listing should be auto approved for plan purpose"). Panel copy says so.
- No `listing_photo_sources` table — nothing discovers sites for a listing; cost: the box forgets last session's URLs.
- Idempotency via storage path `{listingId}/web-{sha256[:24]}.{ext}` rather than a `content_hash` column.
**Issues/Resolution**: first real page (phase147 JW) kept 1 of 10 — the footer signature `/-/media/images/footer-logos/jwhn-sig-1.png` (1806x578, over the 400px floor). `CHROME_PATH` widened to `favicons?` and `(?:[a-z]+-)?logos?`; fixes the community side too. JW's gallery is client-rendered, so both JW pages yield 0 kept — SPA galleries need a headless fetch, separate work.
**Verification**: end-to-end on a scratch listing via a local server (two JPEGs + `/logos/` decoy): found 3, kept 2, `status=ready`, `review_status=approved`, `enhanced_status=queued`, `cover_url` 200; second run added 0; cleaned up. `pnpm typecheck` + `pnpm test` (web 829 + mobile 628) pass; `pnpm lint` fails only on the two pre-existing phase147 errors. Panel not clicked in a browser (/admin cookie-gated).
**Next steps**: run the home tour for 2930 Shoalwood Drive when the owner wants it. Unchanged: DEVLOG rotation, `relocation-v1`.

## 2026-09-02 05:25 UTC — phase147: a builder's quick move-in, imported by hand

**Objective**: owner handed over a John Wieland URL — lot 10901, Sterling Pointe, Cumming — for a listing plus photos ready for the home tour pipeline.
**Actions**: new `scripts/admin/import-jw-listing.ts`; one listing + 14 photos to production.
- Listing `4159c606-71ed-46d5-b612-306277f3f05e`, slug `2930-shoalwood-drive`, agent `royxue812`, status `inactive` (the tour pipeline reads every non-archived listing; an unfinished builder home should not face buyers by default). 5/4.5/3,476 sqft, 2-car, 2 stories, $1,057,242 (was $1,282,992), completes Oct/Nov 2026.
- Page pitfalls: header address is the sales centre (2520 Wilton Ct), not the home; the Facebook-pixel blob carries the floor plan's spec (4/4), the `dataLayer.push({"pageType":"qmi_view"})` blob this home's (5/4.5) — script reads the latter and skips an earlier bare marker; spec tiles use `<p class="big">`/`<p class="regular">` interchangeably.
- Photos: client-rendered gallery; carousel `data-name` → picturepark, served only via Cloudinary's fetch proxy; `c_limit,w_2400` returns the native file (1448-1920px). All 14 `status='ready'`, `sort_order` = carousel position; the worker's enhance pass upscaled all 14 to `approved` unprompted (`enhanced_status` defaults `queued`).
**Decisions**:
- Agent-owned, not external: `listings_agent_or_external_chk` allows `agent_id` XOR `source`; `source='jwhomes'` would be an ownerless row at `/v/jwhomes/...`. Provenance in the script header.
- Committed script over an ad-hoc write (as `ingest-community-photos.ts`): dry run by default; `--apply` updates in place and uploads only positions with no row (second run skipped all 14).
**Issues**: `pnpm lint` fails on two pre-existing formatter errors in `app/api/research/responses/route.ts` and `lib/zod/__tests__/research-response.test.ts` (phase143-146, on `main`). Not touched.
**Verification**: `pnpm typecheck` and `pnpm test` (815 tests) pass; repo-root `scripts/` is outside both scopes, so the file was checked by hand.
**Learnings**: caveats for the tour — all 14 photos are the Waterstone model's marketing shots, not this lot; Sterling Pointe (Cumming) has no `communities` row (only same-name rows in McDonough, Powder Springs, Douglasville), so `community_id` is null.
**Next steps**: tag -> plan -> generate -> assemble in /admin/pipeline/tour-jobs when the owner wants it. Unchanged: DEVLOG rotation, `relocation-v1`.

## 2026-09-01 18:45 UTC — phase146: every answer, per respondent

**Objective**: owner on the summary page — 「逐个明细部分 对每个调查对象显示所有的回答」. Section 六 showed 11 hand-picked columns; he wants all 17 questions for each of the 10 respondents.
**Actions**: `public/demos/buyer-study-summary/index.html` only.
- Compact table stays as index; below it one native `<details>` per respondent (#, timestamp, purpose, location, duration, contact left) expanding to a `<dl>` in questionnaire order — choices as text, multi-selects as list, ratings `n / 5`, Q10 as quote, unanswered 「未答」. Plus 展开全部 / 全部收起.
- Empty `_other` supplements skipped rather than shown as 「未答」.
- Question order recovered from `git show 47db0851:...` (phase145 deleted the questionnaire) and baked in as an explicit `order` array.
**Issues/Resolution**: three extraction bugs caught by dumping the rendered DOM — nested groups (`q1_time`, `q2_where`, `q4_sources`) took the whole fieldset as title (`<p class="sub">` regex tightened to `[^<]*`); `q6_top` rendered raw values (radios built by JS; now borrows `q6_check`'s labels); `<small>` hints (「可多选」/「单选」) leaked into titles (stripped).
**Verification**: headless Chrome DOM dump — 10 detail blocks, 26 rows for respondent #1, every value label-resolved; screenshots; PII grep clean (`has_contact` only).
**Learnings**: verify the artefact, not the parse — a label regex that "works" can still be silently wrong.
**Next steps**: unchanged — DEVLOG rotation, `relocation-v1`.

## 2026-09-01 18:10 UTC — phase145: the study page comes down

**Objective**: owner clarified phase144 — 「关闭这个页面 对外不可见了」. The page should be gone, not carry a banner.
**Actions**: `git rm apps/web/public/research/atlanta-remote-buyer-study.html`; static file, so that is the whole change. Nothing in the app links to it.
**Decisions**:
- phase144's 410 stays as belt-and-braces (a stale tab can still POST); `CLOSED_STUDIES` stays (id still valid for the 10 rows and admin export).
- Demo assets in the same folder (`percho-demo-zh-720p.mp4`, `percho-demo-en-720p.mp4`, `percho-demo-poster.jpg`, ~26 MB) NOT removed — outside the ask, may be linked elsewhere; still publicly fetchable, flagged.
- Summary page `/demos/buyer-study-summary/` left up — asked for one message earlier; `noindex,nofollow`, no PII, but URL-reachable; flagged.
**Verification**: production 404 for `/research/atlanta-remote-buyer-study.html`; summary page 200 with 10 rows; `POST /api/research/responses` still 410.
**Learnings**: 「关闭通道」 and 「把页面撤下来」 are different asks — when a closing action leaves a visible artefact, ask which is meant before building the banner.
**Next steps**: unchanged — DEVLOG rotation into `docs/devlog/2026-08.md`, `relocation-v1` awaiting four decisions. Owner may want the mp4s and/or summary page down too.

## 2026-09-01 17:35 UTC — phase144: the study closes at 10 responses

**Objective**: owner: close the questionnaire channel and refresh the summary.
**Actions**:
- `lib/zod/research-response.ts` — `CLOSED_STUDIES` + `isStudyClosed()`; id stays in `RESEARCH_STUDIES` so rows validate and CSV export works.
- `app/api/research/responses/route.ts` — closed study returns 410 Gone after zod parsing; the real control, since a stale tab or `curl` can POST to the static page.
- `public/research/atlanta-remote-buyer-study.html` — closing banner, form `pointer-events:none`, submit hidden, `STUDY_CLOSED` early return; questions stay in the DOM.
- `lib/zod/__tests__/research-response.test.ts` — 2 new tests (6 total).
- `public/demos/buyer-study-summary/index.html` — payload regenerated (10 rows); prose corrected where the 10th response (2026-09-01 14:44 UTC) falsified it: first Q15 「无所谓」, KPI tile "Q15 落在同一档 9/9" → "Q15 答「非常失望」0/10", Q17 sample 2 → 3, contacts 7/9 → 8/10.
**Verification**: 6/6 vitest. Headless Chrome — banner renders, form inert; summary 10 tbody rows, 8 quotes, Q15 bars 9/1, KPI 0/10. PII grep clean.
**Issues**: `tsc --noEmit` and `biome check .` fail in this worktree BEFORE this diff — tsc cannot resolve `@percho/shared` (unbuilt); biome flags pre-existing formatting incl. lines of the test file I extended (verified against `origin/main`). Left alone per § 0.3.
**Learnings**: the 10th respondent (Q15 「无所谓」 but Q17 「愿意转给朋友」, `q14_trust` 「非常信任」, only `q8_decider` 「亲自飞过去看了一眼」) is a segment boundary, not a bad review — someone who decides on the ground can find a remote tool optional.
**Next steps**: cancel the response monitor; DEVLOG rotation into `docs/devlog/2026-08.md`; `relocation-v1` awaiting the owner's four decisions.

## 2026-09-01 02:05 UTC — phase143: the study's nine responses become one page

**Objective**: owner wants every questionnaire result summarised on a web page. Nine responses to `atlanta-remote-buyer-v4` as of 2026-08-31 23:19 UTC.
**Actions**: one new file `apps/web/public/demos/buyer-study-summary/index.html` (~43 KB, self-contained, no build, no network). Data baked in as a JSON `<script>` block; option labels parsed from the questionnaire page so the two cannot drift. Sections: KPI tiles, sample, decision behaviour, post-demo evaluation, intent, seven verbatim Q10 answers, per-response table, limitations.
**Decisions**:
- Counts, never percentages — at n=9 one response moves any proportion 11 points; each card carries its own `n=` (`q17_commit` has 2 valid answers).
- No PII: 7 of 9 left WeChat/phone; reduced to `has_contact` at generation time, verified by grep. `noindex,nofollow` as a second layer.
- Single-hue sequential palette (`#2a78d6` / `#3987e5`, soft `#86b6ef` / `#184f95`) — bars compare within one question, so no categorical ramp; `validate_palette.js --ordinal` ALL PASS both modes.
- Limitations in-page: Q15 is not a PMF reading (Sean Ellis presumes active users), Q17 n=2, channel WeChat-only.
- Table uses a `SHORT` label map; first render overflowed three columns.
**Verification**: headless Chrome at 1000x5600 plus crops and dark mode — all sections populate, 21 cards, 9 rows, 7 quotes, no overflow. PII grep clean.
**Learnings**: the honest form for a 9-response survey is mostly not a chart — stat tiles, count bars with visible denominators, quotes, and a full table the reader can check against.
**Next steps**: DEVLOG rotation due — move August into `docs/devlog/2026-08.md` per § 2.1 rule 2. Owner reviewing a successor questionnaire reframed to relocation (`relocation-v1`), prompted by "Percho 是个移居的 app，不是买房的 app"; nothing built.
