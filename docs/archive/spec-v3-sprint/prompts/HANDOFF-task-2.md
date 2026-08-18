# Session handoff — Percho spec-v3, task-1 done, starting task-2

Paste this whole file as the first message of a new session.

---

You are picking up Percho iOS spec-v3 work. Read these first, in order:

1. `~/Percho/CLAUDE.md` — all rules. Especially §2.1: never a personal Anthropic
   key (Bedrock/opus-5 only), no false completion claims (quote real SHAs from
   `git log origin/main`), DEVLOG.md is reverse-chronological (newest at TOP).
2. `~/Percho/DEVLOG.md` — the top 10 entries. All from 2026-07-27: task-1 plus a
   long run of device bugs found on a real iPhone, and the challenge-card
   redesign. Read them — several document mistakes that are cheap to repeat.
3. `~/Percho/docs/design/spec-v3/00-overview.md` — global contracts.
4. `~/Percho/docs/design/spec-v3/02-listing.md` — the screen you are building.
5. `~/Percho/docs/design/spec-v3/prompts/_MASTER.md` — the 8 hard rules +
   delivery protocol.
6. `~/Percho/docs/design/spec-v3/prompts/task-2-listing.md` — your task.

## Verified state (do not re-derive)

- `origin/main` = `e009d5a`. Tasks 0 and 1 are merged. No open branch.
- `apps/mobile` gate GREEN: `pnpm test` 393/393, `pnpm typecheck` 0,
  `pnpm lint` clean over 91 files.
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
- `components/cards/` — 12 files incl. `CardSurface`, which takes a required
  `variant` and paints the background for a face with no photo (9 hues, one per
  card kind — see `theme/tokens.ts` `cardSurfaces`).
- `lib/feed/` — `generate-feed.ts`, `rhythm.ts`, `signals.ts`, `stage-advance.ts`,
  `content.ts`, `milestone.ts`, `ratios.ts`.
- `state/` — `funnel.ts`, `feed-session.ts`, `event-queue.ts`, `sound.ts`.
- `theme/tokens.ts` — the ONLY place a hex literal may appear.

## Open items you inherit

1. **`Explore →` is unwired on listing/community cards.** `CardFoot` renders the
   button only when given a handler, so today there is no dead affordance. Task-2
   is what gives it a destination — wiring it is part of this task.
   **Also**: the challenge card's reveal now has its own `Explore →`, and it is
   wired to a `BottomSheet` showing the fields the card already carries, because
   the listing detail screen does not exist yet. `ChallengeCardV3.listingId` is
   the real target. **When task-2 lands the detail screen, change that sheet into
   a navigation** (`app/(tabs)/feed.tsx`, search `THE HOME BEHIND THIS`).
2. **Media-less card backgrounds are SETTLED — do not redesign them.** The owner
   reviewed and accepted the 9-hue `cardSurfaces` treatment (a two-stop ramp,
   three hairline arcs, a corner glow; trade-off carries a different hue per
   half). `theme/card-surfaces.test.ts` encodes "not a black screen" as numeric
   invariants — dark stop mean ≥ 0x20, both stops chromatic, AA ≥ 4.5:1, all nine
   hues distinct. If you touch a hue, that suite is the gate.
3. **Stage 0 has ~23 client-side cards and no other inventory.** The finite ask /
   trade-off tables are the entire fresh supply, so §1.9 looping kicks in within a
   session and `seenIds` is persisted. The `SEEN` badge was REMOVED for this
   reason (it marked 100% of cards). Real inventory is a content/data problem, not
   a UI one — do not re-add a badge.
4. **Real data gap, not an engine bug:** only **3 of 260** `listings` rows carry
   `community_id`, so stage 3's "inside a liked community" preview has almost no
   inventory in production. Needs its own scheduled work. Do not paper over it
   with fabricated joins.
5. `apps/web` has 1 pre-existing test failure (`create-upload.test.ts`) and ~131
   biome errors. Both predate this work. Leave them unless asked.

## Hard rules that bit us repeatedly on device

These are cheap to re-break and expensive to find. Every one was a real bug found
only on a physical phone:

- **React identity and UI-thread state are separate clocks.** Never derive
  animation geometry from a React-rendered position when the "current item" is
  decided on the UI thread — they commit on different frames. `useAnimatedStyle`
  per item, never per slot.
- **Reanimated does not revert props a detached style wrote, and NEVER switch a
  view between a static style and an animated one.** This class bit three times:
  the stack transform (ghosting), a tap-dismissed card inheriting an opacity, and
  the flip's face styles flashing a card's own data face on promotion. Every
  visual property of a stacked card must be a pure function of its own
  `absIndex`. If you write `isTop ? someStyle : staticStyle`, that IS the bug.
- **A React key must be unique across the WHOLE list, not just the visible page.**
  §1.9 deliberately re-emits a seen card, so a card id appears twice in one deck.
  Keying on it alone gave "two children with the same key" and React then reused
  or omitted a subtree — which presented as a flashing card AND a card that would
  not leave. Use `lib/feed/deck-key.ts`.
- **Never put a caller-supplied callback in the dependency list of a `useMemo`
  that builds a long-lived object.** An inline arrow is a new identity every
  render, so the gesture was rebuilt constantly; replacing a live `Gesture.Pan`
  mid-touch drops the touch, `onEnd` never fires, and the card sticks forever.
  Depend on primitives plus ref-backed trampolines. Guarded by
  `lib/gesture/memo-identity.test.ts`, which reads the real source.
- **Never advance state from an animation completion callback without a gate.**
  Any input that cancels the animation silently swallows the advance. See
  `panLive`'s `committed` flag.
- **Mount a `Modal` conditionally; do not leave one mounted and toggle
  `visible`.** An always-mounted transparent Modal over real content black-screened
  the whole feed on iOS.
- **An accumulating cache and a view composed from it must be joined by a READ,
  not a dependency.** `[pool]` on anything that resets a cursor is a guaranteed
  mid-session jump once pagination lands.
- **Never splice into a windowed list at `+ 1`.** The visible window is exactly
  the region where an insert is a visual bug. Use `VISIBLE_WINDOW`.
- **A paginating composer must be tested per SESSION, not per page.** 36 green
  single-page tests hid a 39-card wall; page 0 is always clean. See
  `apps/mobile/scripts/probe-session.ts` and `lib/feed/rhythm.test.ts`.
- **Two places computing the same quota must share the same arithmetic.** The
  tease ration was counted against the REQUESTED page size while `assertGate`
  capped on what was EMITTED, so the engine threw its own §0.2 violation on any
  short page.
- **A specified behaviour can still be the wrong behaviour.** "The spec says
  900ms" was used to justify keeping swipe-to-answer on the challenge card through
  two failed attempts. The real fault was overloading one gesture with two
  meanings (swipe = leave AND swipe = answer). When the same interaction reads as
  a malfunction round after round, question the interaction, not its easing curve.
- **When a symptom appears right after an interaction, suspect the thing you
  added to that path this round** before re-reading the whole subsystem. Several
  rounds here were lost to reasoning when the newest untested addition was the
  culprit. If the user sends a LogBox screenshot, reproduce THAT first.
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
commit ending green on test/typecheck/lint.

Task-1's device fixes were committed straight to `main` because the owner was
testing each one on his phone in a tight loop — that was his explicit call for
that loop, not the default. For a feature phase, hold the branch and ask before
pushing or merging.
