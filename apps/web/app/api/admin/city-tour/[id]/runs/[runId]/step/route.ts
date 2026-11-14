/**
 * POST /api/admin/city-tour/[id]/runs/[runId]/step — one step of a city film
 * (phase318). Same steps and handlers as the community route; `ingest` refuses,
 * a city's photos come from Google Places.
 */

import { CITY_TOUR } from '@/lib/poi/tour-steps/scope';
import { postTourStep } from '@/lib/poi/tour-steps/step-route';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; runId: string }> },
) {
  const { id, runId } = await params;
  return postTourStep(req, CITY_TOUR, id, runId);
}
