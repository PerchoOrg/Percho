# Reddit / FB / Quora account roster

**Credentials live in `~/.percho-secrets/`, never here.** This file tracks
handles + karma + status only.

## Beachhead

**Atlanta metro** — chosen because that's where all Percho verified content
lives (Peachtree Corners / Norcross / Alpharetta subs, k12 pipeline seeded
on ATL zones as of 2026-07-18, KW Atlanta meetup outreach in progress).
Houston / other metros wait until we have real listing content there.

## Reddit account plan — 4 accounts, staggered

**Why 4:** shadowban insurance, karma parallelism, sub isolation. See the
"Why 4 Reddit accounts" section in `voice.md` / `README.md`. Don't compress
to 1 — the multi-account cost is one-time (name + verification), the
throughput gain compounds.

**Registration timing to avoid Reddit's anti-brigading pattern-match:**

- Day 1 (today): register **main only**
- Day 3: register alt #2
- Day 5: register alts #3 & #4

Each registration: different browser session, ideally different network
(mobile hotspot vs home wifi is enough). Same recovery email
(`marketing@percho.co`) is fine — Reddit doesn't cross-check that on its own.

### Roster

| slot | handle | persona | primary sub | created | karma | last active | status |
|---|---|---|---|---|---|---|---|
| 1 (main) | `Majestic-Pizza2175` | Peachtree Corners SWE dad, NYC transplant 2022, 2 kids in Simpson ES zone | r/Atlanta | 2026-07-20 | 0 | 2026-07-20 | warmup — 3 r/SampleSize replies sent |
| 2 | tbd | Alpharetta mom, 2 kids Cambridge HS zone, remote worker | r/Alpharetta | pending 2026-07-22 | 0 | — | not created yet |
| 3 | tbd | East Cobb parent, Walton HS grad, moved back after college | r/Marietta | pending 2026-07-24 | 0 | — | not created yet |
| 4 | tbd | Recent Decatur first-time buyer, no kids yet, walkability-driven | r/RealEstate + r/SameGrassButGreener | pending 2026-07-24 | 0 | — | not created yet |

**Handle note for slot 1:** `Majestic-Pizza2175` is Reddit's auto-generated
default (Adjective-Noun+4digits). Zero commercial signal, reads as "user
didn't bother renaming" = ordinary. Kept as-is over a hand-crafted handle
because it already has account-age accruing.

### Handle naming — avoid these patterns

- **NO:** anything with `percho`, `official`, `real_estate`, `agent`,
  `buy`, `sell`, `home`, current year, or 4+ digits at the end
- **NO:** perfectly-plausible-fake real names (`sarah_johnson_atl`) —
  ironically these read as bot
- **YES:** slightly-weird human-typed handles. Examples:
  - `peachtree_dad_ish`
  - `norcross_or_bust`
  - `moved_from_queens`
  - `stuck_on_141`
  - `pcorners_papabear`
  - `waltonhsalum`
  - `east_cobb_or_die` (obvious joke — reads real)
  - `roswell_regret` (self-deprecating — reads real)
  - `johnscreek_soccerdad`

The rule: a handle should look like something someone actually thought of
in 10 seconds while distracted, not something optimized. Slight cringe is
authenticity.

Pick handles from this list (or make similar), commit them to this file
before creating the account so we have a paper trail.

## Facebook groups to lurk

| group | approx members | applied? | approved? | first lurk-only day | first reply-to-others day (never post) |
|---|---|---|---|---|---|
| Moving to Atlanta | ~50k | pending | — | — | — |
| Atlanta Real Estate & Relocation | ~30k | pending | — | — | — |

Rules from playbook: **5 full days of lurk + like only** before replying to
any post. **NEVER post your own thread** in these groups (mod trigger #1).

## Quora

Deferred until Day 20+. Reddit + FB is enough surface area for weeks 1-3.
Quora account planning goes here when we get there.

## Warmup progression per account

Karma milestones = permissions unlocked:

- 0-25 karma (Day 1-3): reply only to unrelated topics — food, traffic,
  weather questions in r/Atlanta, plus r/SampleSize karma-farming. Never
  mention housing.
- 25-100 karma (Day 4-7): can reply to housing threads BUT no Percho
  mention. Pure-value replies from templates.
- 100+ karma (Day 8+): eligible for Percho mention, once per day per
  account max.

Log every reply to `daily/YYYY-MM-DD.md` — that's the audit trail. Karma
snapshot for each account goes at bottom of daily file.
