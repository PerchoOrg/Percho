/**
 * POST /api/admin/community-tour/[id]/runs/[runId]/step
 *   Execute one pipeline step, persist its output into step_results.
 *
 * Steps (owner-fixed 2026-08-15):
 *   research   — dual Gemini grounding calls (gemini_a/gemini_b). Runs
 *                INLINE on Vercel (plain HTTP to Gemini — no local CLI).
 *                ~5-10s total, under the platform function timeout.
 *   resolve    — Google Places Text Search firewall on agent candidates.
 *   photos     — 3 Places photos per POI the tour has, and the enhance queue.
 *   ingest     — photos from the community's own website and its subpages,
 *                plus any other page the owner ticked.
 *   tag        — a Gemini description for every untagged photo in scope, then
 *                the initial filter over what came back. STOPS at 'review'.
 *   filter     — that filter on its own. Not on the strip; `tag` calls it.
 *   ——— the owner reviews the approved AND rejected photos by hand ———
 *   plan       — the shot list, from whatever survived that review.
 *   generate   — enqueue photo→clip jobs in photo_clips (seedance worker
 *                picks them up).
 *   assemble   — ffmpeg concat per shot list (photo_clips must all be ready).
 *
 * photos/ingest/tag/filter were ONE step until 2026-08-23 (owner: "we need to
 * split the fetch & tag to 4 steps: fetch from resolved pois, fetch from
 * selected websites, tag selected photos, auto-filtering"). Four jobs sharing
 * one 300s function is why the tag loop needed a clock budget.
 *
 * Later the same day, tag and filter were folded back into one chip (owner:
 * "tag and filtering can be combined") — filtering an untagged photo is
 * meaningless, so a Filter button could only refuse until Tag had finished.
 * Three steps run before the gate, not four.
 *
 * This file is dispatch only, and since phase318 even the dispatch lives in
 * `lib/poi/tour-steps/step-route.ts`, shared with the city route. Each step
 * lives in `lib/poi/tour-steps/`; they share `tour-steps/shared.ts`.
 */

import { COMMUNITY_TOUR } from '@/lib/poi/tour-steps/scope';
import { postTourStep } from '@/lib/poi/tour-steps/step-route';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; runId: string }> },
) {
  const { id, runId } = await params;
  return postTourStep(req, COMMUNITY_TOUR, id, runId);
}
