# Task 1 — plan APPROVED, proceed to implementation

Your plan at `~/.claude/plans/you-are-working-in-wise-avalanche.md` is approved. The five briefing corrections are accepted as fact — thank you for checking rather than building on them. Proceed with the sequencing in §7.

## Rulings on your open items

**A1 / A2 / A3 / A4 — all four defaults approved as written.** Don't block on geo; city units only with the documented Stage-2 fallback; client-side event queue with a no-op sink; type carries all three granularities with only `city` populated; create `(tabs)` with 3 stubs and delete `app/feed.tsx` + `app/place/[slug].tsx`.

**`finestAvailableLevel(pool)` — approved, and it is the right call.** You correctly caught that Stage 2 would otherwise stall and never unlock Stage 3. Unit-test the city-reading and zip-reading of that same rule so the later zip backfill is provably a no-op on the engine.

**`city_geo_units` view migration — APPROVED, write it.** Additive read-only view, `security_invoker = true`, no column drops. Follow the repo's migration workflow. Do NOT reach for the in-process aggregation fallback; aggregate in SQL as you proposed.

**Zip reverse-geocode backfill (~$40) — NOT approved yet, out of scope.** Do not write the script, do not spend. Leave it as the documented separate task. Stage 2 ships on the city fallback.

**`buyer_scope_events` + `/api/mobile/events` — deferred, as you proposed.** Your reasoning about not widening the agent-facing `events` zod union is right; don't pollute that path. Ship the client contract only.

**B2 (spec conflict, challenge card in Stage 0) — your reading wins.** Stage 0 emits no challenge; the slot becomes a 7th ask. §1.6's "Stage 2+" is the intended rule and §1.7's mix table is the error. When you touch `docs/design/spec-v3/01-feed.md`, correct the Stage-0 row of the §1.7 table to `ask ×7 · trade-off ×3` and add a one-line footnote that the challenge slot was removed to match §1.6. Fix the spec, don't just work around it.

**B5 (undo asymmetry) — accepted, with one addition.** Signal reverts, stage does not (`funnel.ts` is monotonic by design). Additionally: if the swipe being undone is the one that triggered a milestone insert, remove that not-yet-seen milestone card from the deck — a ceremony card for a stage the user hasn't re-earned is worse than the asymmetry itself. If the milestone was already displayed, leave it.

**B6 (silent left settle) — keep task-0's reading.** Pass is silent all the way through, including settle. Negative feedback is never rewarded with a haptic.

**All other B items (B1, B3, B4, B7–B15) — approved as written.** B7 (real `communities.boundary` GeoJSON as a static SVG path, no Static Maps spend) and B10 (fetch-failure inference, no new dependency) are both good instincts.

## The task-0 bug you found

`SwipeStack.tsx:98` gating the back face on the function rather than its result is a real shipped bug and it is exactly the §1.1 engineering red-line. Fix it in step 4 and add a regression test that a card kind with no back face cannot enter a flipped state at all. Call it out explicitly in the DEVLOG entry — task-0's review missed it.

## Standing constraints (unchanged)

- Bedrock / opus-5 only. Never a personal `sk-ant-*` key.
- No mock/test data in any commit; dev fixtures on gitignored paths only. No video files in git.
- No fabricated stat, ever — not even as a placeholder. Missing renders as absent.
- Tokens only, zero hex literals outside `tokens.ts`.
- Every step ends green on `pnpm test` / `pnpm typecheck` / `pnpm lint` in `apps/mobile`.
- Commit to `phase-ios1/discovery-feed` incrementally with a DEVLOG entry at the TOP each time. **Do not push and do not merge.**
- Mark all 6 visual acceptance items `PENDING-SIM` and write `docs/design/spec-v3/VERIFY-task-1-on-mac.md` mirroring the task-0 doc.

Work through §7 steps 1–10 now. If you hit something that contradicts this plan, stop and report rather than improvising.
