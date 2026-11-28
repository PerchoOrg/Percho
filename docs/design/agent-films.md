# Agent films — an agent's own version of a community film

**Status**: proposal, 2026-11-27 (phase406), revised 2026-11-28 (phase420).
Nothing is built.
**Demos**: `https://www.percho.co/demos/agent-film-v1` (the four upload
steps), `https://www.percho.co/demos/agent-film-v2` (the revision).

## Revision, 2026-11-28

Re-read against phase407–419. Where this section and the text below
disagree, this section holds.

1. **The job is the first film of an unfilmed community.** 20 of 22,730
   active communities have a film; the county page says "No films in this
   county yet" and search (cities, schools, ZIPs since phase409–410) mostly
   finds places with none. An agent's film of a community that has no film
   is, once reviewed, that community's film in the app, with one credit line
   under the name on the card ("with Dana Cole · Keller Williams", a tap
   opens the agent's card). First agent in holds it; a second agent's
   version lives on their own link. For the 20 filmed communities nothing
   changes: Percho's film stays, the agent's is another version.
2. **An agent's link must work in the app.** `/watch/*` is a universal link
   (`lib/share/app-links.ts`), so a buyer with the app never sees the web
   page the first draft put the agent's version and card on. The link opens
   the community in the app playing that agent's version, the agent's card
   under the name. This needs an iOS release — the first draft's "no app
   release" is withdrawn.
3. **The agent sees numbers.** My film shows buyers who watched, watched to
   the end, hearts, contacts. Hearts are saves (`saved_communities`) and
   contacts are leads, both on the server already; the app posts its event
   queue to `/api/mobile/events` (a card's verdict, Explore taps). Whether a
   film's plays and watch-through are in that stream was not confirmed —
   count on adding those two events with the iOS release item 2 needs.
4. **The thumbs-down is the safety net.** An agent film hidden clearly more
   often than the others is pulled from the app back to review. Not shown to
   the agent.
5. **Material is framed for the card.** The place label (top left, about 24
   characters), the four corner buttons and the name block cover parts of
   the frame; moment picking and photo crops keep the subject clear of
   them, and an item's name is capped at what the label fits.

New cost: an unfilmed community has no nearby pool, so the research and
photo steps run for it automatically (Google Places, Gemini). Not priced —
run one community and measure before any batch. The page must work in a
phone browser; the material is on the agent's phone.

## Decided, and the way in — 2026-11-28 (phase422)

Owner's answers to the revision's four points: yes; yes — and more than a
card: **a photo, a moving portrait, the agent's own voice, as paid
features**; yes; ok. Then: 「我还是不明白入口在哪里 管理界面长什么样子 如何快速
定义并且上传一个社区 而不是找现有的社区」. Demo:
`https://www.percho.co/demos/agent-film-v3`. Proposed, not yet ruled:

- **One address**, `percho.co/film` (name open), phone browser first — the
  material is on the agent's phone and a web page needs no App Review. It
  signs in with the existing agent account. Three ways to it: the address
  itself; a row at the foot of the app's You tab ("Are you an agent?",
  opened in the in-app browser of phase411); a line under every agent
  film's shared page. This replaces the "My film tab on the dashboard's
  community page" of the first draft as the way in; the dashboard can link
  to it.
- **Management is one list**: My films — a row per film with its state
  (needs material / being checked / live) and, when live, its numbers — and
  one button, New film.
- **New film is material first, place second.** The agent picks photos and
  video; the place is read from where they were taken and matched with the
  `match_community` RPC (containing boundary, else nearest within 250 m);
  one tap confirms. Otherwise the agent types a name, picks a suggestion,
  or adds a new community with a name and a pin. A new community stays
  `inactive` until its film is approved; `lib/communities/naming.ts`
  de-duplicates. The same coordinates settle "one item from inside the
  community". **Unverified**: whether iOS Safari hands a picked photo's
  location to the page — test on a device; the fallback is the phone's
  current position.
- **A film's own page**: watch, copy link, numbers, add material; under it
  Your card — name and brokerage free; photo, moving portrait and own voice
  marked Partner.
- **The three paid things, as proposed**: the photo on the card and the end
  card; the moving portrait a few seconds the agent records of themself,
  looped on the card — not a generated avatar; the voice the agent reading
  the film's script line by line on the phone, replacing the synthetic
  narration — not a cloned voice. Neither needs a new service, and a read
  narration spends none of the 100-lines-a-day quota. A generated avatar or
  a cloned voice would be a new paid service and is priced before it is
  proposed. Payment is the Community Partner plan of phase341 (dark; needs
  the owner's Stripe account).

## Why

Every film today is cut by Percho from photos Percho found. That is the cold
start. The material we are shortest of — the pool, the clubhouse, the
entrance, the streets inside the gate — is what a local agent already has on
their phone, and an agent has a reason to hand it over: a film of the
community they farm, ending on their name, is marketing they would otherwise
pay a videographer for.

Owner rulings, 2026-11-27: agents first (residents later); each uploader gets
**their own version** of the film; photos **and** video are both accepted.

## What the agent does

All of it happens in the dashboard's community page, in a new **My film** tab
beside Media. No app release is needed.

1. **Add material.** Drop photos and videos. One checkbox per batch: *I took
   these or have the right to use them. They are not MLS listing photos.*
   Each item is checked on its own and ends as **Ready** or **Not used** with
   a reason in plain words ("a person's face", "blurry", "a single home").
2. **Video becomes moments.** From each video Percho picks up to four steady
   3–5 second stretches and shows them on the video's strip. The agent can
   untick a moment; they cannot trim by hand in v1.
3. **Make my film.** Enabled once five items are Ready and at least one of
   them is inside the community. The agent sees the shot list before it
   renders: their shots marked *Yours*, the rest filled from Percho's own
   material for that community, and the end card with their name.
4. **Watch, publish, share.** The film is ready in minutes. *Publish* gives a
   link — `percho.co/watch/c/<community>/<agent>` — and that is the only way
   out in v1 (no file download; see Rules).

## What a buyer sees

- **The agent's link**: the agent's version, full screen, the agent's card
  under it (headshot, name, brokerage, a contact button that writes a lead),
  and the App Store button the watch page already has.
- **The app**: unchanged. A community still has one public film, Percho's.
  Putting an agent's version or card inside the app is what the Community
  Partner seat (phase341, dark) would sell — a later decision.

## Rules

**Material**
- The upload is the agent's own. MLS listing photos are refused by the
  checkbox and by the terms: the FMLS licence covers percho.co listing
  display, not films, and forbids AI processing of listing data.
- Everything the film rules already refuse is refused here, by the tagger and
  not by a person: foreground people, pets, single homes and interiors,
  blurred or tiny files, a covered pool.

**The cut**
- The agent's material leads: it opens the film and takes every slot it can
  fill. Percho's material fills the rest (schools, parks, shops nearby).
- Same length, pacing, narration and music as a Percho film (45–90 s). An
  agent's footage plays as itself; no paid generated clips are spent on an
  agent version.
- The end card reads the community's name, then the agent's name and
  brokerage, then Percho.

**Whose material goes where**
- An agent's material never appears in another agent's version.
- It does enter Percho's pool for that community, so the public film gets
  better with every upload, credited in the film's credits. This is the
  flywheel, and the upload terms must grant it.

**Limits**
- One version per agent per community. A recut needs new material and is
  limited to one a day.
- Narration is the bottleneck: 100 spoken lines a day across everything
  Percho voices, about ten lines a film. Agent films queue behind that and
  the page says when the film will be ready rather than failing.
- No download in v1. A version is partly Percho's pool, which includes Google
  Places photographs; a link on percho.co keeps them where their credits are
  shown, a file posted to another platform does not.

**Review**
- For the first batch, a published film is watched by Percho before its link
  works (the reviews queue pattern: pending → approved). Automatic checks
  decide what may be *in* a film; a person decides that the first films are
  *good*.

## How it fits the pipeline

The film pipeline already has the shape this needs; three things are new.

1. **A fifth photo source.** `poi_photos.source` gains `agent_upload`, with
   the uploading agent and the time the rights box was ticked. Files are
   ingested the way `scripts/admin/ingest-community-photos.ts` does it today:
   a synthetic POI per subject ("Harvest Park Pool"), linked to the community,
   queued for enhance, tagged and filtered by the existing `tag` step.
2. **Footage as a clip engine.** `photo_clips.engine` gains `footage`. A
   picked moment is stored as one keyframe (a `poi_photos` row, so every photo
   rule applies to it) plus a ready clip cut from the upload. Clips are
   already one row per photo and engine, and the city plan already plays a
   photo that has a ready Seedance clip as that clip, so the scheduler gains
   an engine, not a concept. Picking
   moments (scene cuts, sharpness, shake) is a new render-worker step; the
   upload itself is the existing Cloudflare Stream path. Sound is dropped.
3. **An owner on the assembly.** `tour_assemblies.agent_id`, null for
   Percho's film. **Every reader that takes "the newest ready assembly" as
   the community's film must add `agent_id is null`** — there are about ten
   (`lib/communities/detail.ts`, `lib/feed/community-pool.ts`,
   `lib/feed/tour-segments.ts`, `lib/feed/vertical-videos.ts`,
   `film-credits.ts`, the admin pages, `scripts/admin/reassemble-community-tours.ts`).
   Missing one makes an agent's version the public film without anyone
   choosing that.

The hard part is not the upload. Every film today is finished by an operator
pass — no house as the opening shot, at most one group of homes, a school
shot must show the school, the film must contain the community itself. Some
of this is in the tagger, the scheduler and `guard.ts`; the rest lives in
review notes. A self-serve film has no operator, so those rules become plan
checks that refuse to render, each with a sentence the agent can act on
("Add one more photo from inside Harvest Park").

## Build order

1. Photos only, end to end: source, upload tab, automatic plan, agent end
   card, `agent_id` on assemblies and its reader filters, the agent's watch
   link, the review queue.
2. Video moments (`footage` engine, the worker's picking step).
3. Agent uploads feeding the public film, with credits.
4. Residents on iOS (a separate proposal).

## Open decisions

1. The app keeps Percho's film; an agent's version lives on the agent's link.
2. Agent uploads also feed Percho's public film, credited.
3. Free: one version per agent per community, one recut a day.
4. First batch: Percho watches each film before its link works.
