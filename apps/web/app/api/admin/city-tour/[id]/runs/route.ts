/**
 * GET  /api/admin/city-tour/[id]/runs → a city's film runs (phase318)
 * POST /api/admin/city-tour/[id]/runs → create one
 *
 * The community route's twin; both are `admin-handlers.ts`.
 */

import { createTourRun, getTourRuns } from '@/lib/poi/tour-steps/admin-handlers';
import { CITY_TOUR } from '@/lib/poi/tour-steps/scope';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return getTourRuns(CITY_TOUR, (await params).id);
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return createTourRun(CITY_TOUR, (await params).id);
}
