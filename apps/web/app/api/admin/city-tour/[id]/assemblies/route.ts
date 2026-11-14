/** GET /api/admin/city-tour/[id]/assemblies — a city's assembled films (phase318). */

import { getTourAssemblies } from '@/lib/poi/tour-steps/admin-handlers';
import { CITY_TOUR } from '@/lib/poi/tour-steps/scope';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return getTourAssemblies(CITY_TOUR, (await params).id);
}
