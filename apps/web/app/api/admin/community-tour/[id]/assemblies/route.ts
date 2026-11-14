/**
 * GET /api/admin/community-tour/[id]/assemblies
 *   Return tour_assemblies rows for this community, newest first. The admin
 *   Community Tour page's top panel renders the latest ready assembly as the
 *   community's video (owner 2026-08-17: "assembly的结果放到顶部").
 */

import { getTourAssemblies } from '@/lib/poi/tour-steps/admin-handlers';
import { COMMUNITY_TOUR } from '@/lib/poi/tour-steps/scope';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return getTourAssemblies(COMMUNITY_TOUR, (await params).id);
}
