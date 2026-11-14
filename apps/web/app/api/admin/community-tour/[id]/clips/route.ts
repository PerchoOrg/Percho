/**
 * GET /api/admin/community-tour/[id]/clips
 *   Photo→clip status for a community's photos, including cache hits
 *   (photo_clips rows created by another community are reused).
 *
 * Returns every poi_photos row linked to this community's POIs, joined with
 * its photo_clips status + public video URL.
 */

import { getTourClips } from '@/lib/poi/tour-steps/admin-handlers';
import { COMMUNITY_TOUR } from '@/lib/poi/tour-steps/scope';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return getTourClips(COMMUNITY_TOUR, (await params).id);
}
