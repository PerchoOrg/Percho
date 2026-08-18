You are finishing Task 1 in the Percho repo (`~/Percho`). Steps 1–8 of the plan are DONE
and committed on `phase-ios1/discovery-feed`. You do steps 9 and 10, and only those.

## Read first

1. `CLAUDE.md` — §2.1 especially: no false completion claims (quote real SHAs from
   `git log`), DEVLOG.md reverse-chronological (newest at TOP), do not push, do not merge.
2. `DEVLOG.md` — top 6 entries. They describe steps 1–8 as actually built.
3. `docs/design/spec-v3/prompts/PLAN-task-1.md` — §7 rows 9 and 10 are your scope.
4. `docs/design/spec-v3/prompts/RUN-task-1-approved.md` — owner rulings.
5. `docs/design/spec-v3/VERIFY-task-0-on-mac.md` — the doc you are mirroring in step 10.
6. `docs/design/spec-v3/01-feed.md` §1.9 and `docs/design/spec-v3/prompts/task-1-feed.md`
   — the 6 visual acceptance items.
7. The existing code: `apps/mobile/lib/feed/`, `apps/mobile/components/cards/`,
   `apps/mobile/components/feed/`, `apps/mobile/state/`. **The committed code is ground
   truth** — wire step 9 against the APIs that actually exist, not the plan's prose.

## Starting state — verified by the owner just now

- Branch `phase-ios1/discovery-feed`, working tree CLEAN.
- Gate GREEN: `apps/mobile` → `pnpm test` **176/176**, `pnpm typecheck` 0, `pnpm lint`
  clean. `apps/web` → `pnpm typecheck` 0.
- You are the ONLY agent on this branch. There is no contention, no parallel writer. Do
  not stop to raise worktree-protocol concerns — `~/Percho` is your designated write
  target for this run. Just do the work.

## Step 9 — wire the screen

- Create the `(tabs)` route group with the 3 stubs, consuming the existing `TabBar`
  (which has had zero consumers since task-0).
- New `app/(tabs)/feed.tsx` composing the committed engine + card faces + chrome/system
  states. This is the real screen, per §1.9.
- Delete the legacy `apps/mobile/app/feed.tsx` (1515 lines, pre-v3: 25% threshold,
  hardcoded hex, dead Cloudflare tunnel base) and `apps/mobile/app/place/[slug].fsx`
  — check the real filename under `app/place/`. Also reconcile `app/index.tsx` and
  `app/_layout.tsx` so routing lands on the tabs group.
- Verify with `pnpm test`, `pnpm typecheck`, `pnpm lint` AND `npx expo export --platform ios`.

## Step 10 — the verification doc

Write `docs/design/spec-v3/VERIFY-task-1-on-mac.md` mirroring the structure of
`VERIFY-task-0-on-mac.md`. It must contain:
- Exact commands the owner runs on his Mac mini (`git pull`, `pnpm install`,
  `pnpm mobile:start`, scan QR in Expo Go SDK 54).
- All 6 `PENDING-SIM` visual acceptance items as numbered checks with expected/observed:
  1. Stage 0→1 walkthrough: ask/tradeoff flow → milestone insert → milestone is
     non-swipeable → CTA continues.
  2. Tradeoff drag: chosen half brightens / discarded half dims, tracking the finger.
  3. Challenge card: 900ms reveal, then flyout.
  4. Flip: 350ms crossfade on listing/community/area; swipe disabled while flipped; tap
     on an ask card is a no-op (this is the task-0 bug fixed in step 4 — call it out).
  5. Undo toast 3s; ask/tradeoff not undoable.
  6. `push` to `/listing/[id]` and back preserves `activeIndex`; exhausted terminal card;
     `seen` micro-badge on looped cards.
- A short section documenting exactly how Stage 2 degrades today: `communities.zip` is
  100% NULL, so `finestAvailableLevel()` reads city, and the zip reverse-geocode backfill
  is a separate un-approved task. Say what the owner will actually see because of it.
- What is NOT verifiable on the Mac and why, if anything.

## Then

Insert a DEVLOG entry at the TOP for each step. Commit each step separately with the
`phase-ios1.1:` prefix. **Do not push. Do not merge to main.**

Final report must include: the real branch tip SHA from `git log`, the test/typecheck/lint
numbers you actually observed, the `expo export` result, and an honest list of anything in
steps 1–10 you believe is incomplete or shaky — including whether the step-6 server work
(committed as several "WIP step6 ... (checkpoint)" commits) is actually finished, since
those checkpoint messages suggest it may not be. If step 6 has a real gap, report it;
do not silently fix it.

## Standing constraints

- Bedrock / opus-5 only. No mock/test data in commits; dev fixtures on gitignored paths.
- No fabricated stat anywhere, not even a placeholder. Missing renders as absent.
- Tokens only; zero hex literals outside `theme/tokens.ts`.
- Step 9 is compile/export-verifiable only on this Linux box — never claim visual
  verification. That is what step 10's doc exists for.
