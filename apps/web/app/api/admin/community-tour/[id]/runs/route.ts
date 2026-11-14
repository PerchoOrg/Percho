/**
 * GET  /api/admin/community-tour/[id]/runs  → all pipeline runs + step_results
 * POST /api/admin/community-tour/[id]/runs  → create a new run
 *
 * Each run persists per-step outputs in step_results jsonb; the admin page
 * renders whichever steps have data. Step execution happens in
 * /runs/[runId]/step (this route only creates rows).
 */

import { createTourRun, getTourRuns } from '@/lib/poi/tour-steps/admin-handlers';
import { COMMUNITY_TOUR } from '@/lib/poi/tour-steps/scope';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return getTourRuns(COMMUNITY_TOUR, (await params).id);
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return createTourRun(COMMUNITY_TOUR, (await params).id);
}
