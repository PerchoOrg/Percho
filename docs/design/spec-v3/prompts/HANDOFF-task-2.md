# Session handoff — Percho spec-v3, task-1 done, starting task-2

Paste this whole file as the first message of a new session.

---

You are picking up Percho iOS spec-v3 work. Read these first, in order:

1. `~/Percho/CLAUDE.md` — all rules. Especially §2.1: never a personal Anthropic
   key (Bedrock/opus-5 only), no false completion claims (quote real SHAs from
   `git log origin/main`), DEVLOG.md is reverse-chronological (newest at TOP).
2. `~/Percho/DEVLOG.md` — the top 6 entries. They are all from 2026-07-27 and
   cover task-1 plus five device bugs found and fixed on a real iPhone.
3. `~/Percho/docs/design/spec-v3/00-overview.md` — global contracts.
4. `~/Percho/docs/design/spec-v3/02-listing.md` — the screen you are building.
5. `~/Percho/docs/design/spec-v3/prompts/_MASTER.md` — the 8 hard rules +
   delivery protocol.
6. `~/Percho/docs/design/spec-v3/prompts/task-2-listing.md` — your task.

## Verified state (do not re-derive)

- `origin/main` = `7661dc5`. Tasks 0 and 1 are merged. No open branch.
- `apps/mobile` gate GREEN: `pnpm test` 317/317, `pnpm typecheck` 0,
  `pnpm lint` clean over 88 files.
- Expo dev server is running on this box in tunnel mode; the owner tests on a
  real iPhone through Expo Go. If it is dead, see the
  `expo-dev-server-headless-remote` skill — the short version is
  `terminal(background=true, command="cd ~/Percho/apps/mobile && exec > /tmp/expo.log 2>&1 && npx expo start --tunnel")`
  then `bash ~/.hermes/skills/software-development/expo-dev-server-headless-remote/scripts/get-expo-tunnel-qr.sh`.
- Live pool today (`GET https://www.percho.co/api/mobile/feed?stage=0`):
  **109 city geo units, 0 listings, 0 communities.** Plan around that.

## What task-1 shipped that task-2 must reuse, not rebuild

In `apps/mobile/`:

- `lib/gesture/` — `decide-swipe.ts` (35% threshold, 800pt/s, ±30° sector),
  `capability.ts` (per-card gesture capability), `can-flip.ts`,
  `stack-layer.ts` (**exports `VISIBLE_WINDOW`** — anything that splices the deck
  must use it), `label-reveal.ts` (the arming latch for swipe labels).
- `hooks/use-swipe-card.ts` — pan + tap, the atomic `handoff` worklet.
- `components/SwipeStack.tsx` — `StackCard` owns one never-swapped
  `useAnimatedStyle` per card, keyed by ABSOLUTE index.
- `components/cards/` — 11 faces incl. `CardSurface` (the gradient for faces
  with no photo).
- `lib/feed/` — `generate-feed.ts`, `rhythm.ts`, `signals.ts`, `stage-advance.ts`,
  `content.ts`, `milestone.ts`, `ratios.ts`.
- `state/` — `funnel.ts`, `feed-session.ts`, `event-queue.ts`, `sound.ts`.
- `theme/tokens.ts` — the ONLY place a hex literal may appear.

## Open items you inherit

1. **`Explore →` is unwired on listing/community cards.** `CardFoot` renders the
   button only when given a handler, so today there is no dead affordance. Task-2
   is what gives it a destination — wiring it is part of this task.
2. **Trade-off card background is an open PRODUCT question, not yours to decide.**
   The owner asked for a photo behind it; trade-off cards are pure client-side
   content with no geo unit and therefore no photo source. Currently a warm
   gradient (`CardSurface`). The owner has NOT picked a source yet. Do not invent
   one — if it comes up, ask.
3. **Real data gap, not an engine bug:** only **3 of 260** `listings` rows carry
   `community_id`, so stage 3's "inside a liked community" preview has almost no
   inventory in production. Needs its own scheduled work. Do not paper over it
   with fabricated joins.
4. `apps/web` has 1 pre-existing test failure (`create-upload.test.ts`) and ~131
   biome errors. Both predate this work. Leave them unless asked.

## Hard rules that bit us repeatedly on device

These are cheap to re-break and expensive to find. All five were real bugs found
only on a physical phone:

- **React identity and UI-thread state are separate clocks.** Never derive
  animation geometry from a React-rendered position when the "current item" is
  decided on the UI thread — they commit on different frames. `useAnimatedStyle`
  per item, never per slot.
- **Reanimated does not revert props a detached style wrote.** If a style can be
  handed to a different view during its life, every candidate style must write
  the identical prop set.
- **An accumulating cache and a view composed from it must be joined by a READ,
  not a dependency.** `[pool]` on anything that resets a cursor is a guaranteed
  mid-session jump once pagination lands.
- **Never splice into a windowed list at `+ 1`.** The visible window is exactly
  the region where an insert is a visual bug. Use `VISIBLE_WINDOW`.
- **A paginating composer must be tested per SESSION, not per page.** 36 green
  single-page tests hid a 39-card wall; page 0 is always clean. See
  `apps/mobile/scripts/probe-session.ts` and `lib/feed/rhythm.test.ts`.
- No fabricated stat anywhere, not even as a placeholder — a missing value
  renders as ABSENT. No mock/test data in commits; dev fixtures on gitignored
  paths.
- Tokens only, zero hex literals outside `theme/tokens.ts`.
- This box is Linux with **no iOS simulator**. Never claim visual verification.
  Bundle headlessly to prove it compiles under real Metro:
  `npx expo export --platform ios --output-dir /tmp/bundle-check --clear`
  or hit the running dev server's bundle endpoint. Reading the emitted bundle to
  confirm a change actually shipped is worth doing — `tsc` type-checks, Metro
  resolves, and they catch different things.

## First deliverable: PLAN ONLY

Per `_MASTER.md` step 1, output ONLY an implementation plan. Do not create, edit,
or delete a single file in this step. Cover:

1. Component tree — every new file, and which task-0/1 component each composes.
2. State + data flow — what is pure and tested vs. what is screen wiring.
3. Which fields you can populate from real data TODAY vs. which must render as
   absent, given the live pool above.
4. Server plan — what the API must change to.
5. Test plan — which pure functions get unit tests, and the boundary cases.
6. Ambiguity list — every underspecified point in the spec with the default you
   propose. Be exhaustive; this is the step that prevents rework.
7. Sequencing, marking anything visually verifiable only on the owner's phone as
   `PENDING-SIM`.

Then STOP and wait for approval.

## Branch

One branch per phase: `git checkout -b phase-ios2/listing` off current main.
Commit prefix `phase-ios2.N:`. DEVLOG entry at the TOP on every commit, each
commit ending green on test/typecheck/lint. **Do not push. Do not merge to main.**
