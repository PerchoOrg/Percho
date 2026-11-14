/** GET /api/admin/city-tour/[id]/clips — clip status for a city's photos (phase318). */

import { getTourClips } from '@/lib/poi/tour-steps/admin-handlers';
import { CITY_TOUR } from '@/lib/poi/tour-steps/scope';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return getTourClips(CITY_TOUR, (await params).id);
}
