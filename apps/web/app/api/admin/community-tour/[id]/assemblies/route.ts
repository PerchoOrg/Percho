/**
 * GET /api/admin/community-tour/[id]/assemblies
 *   Return tour_assemblies rows for this community, newest first. The admin
 *   Community Tour page's top panel renders the latest ready assembly as the
 *   community's video (owner 2026-08-17: "assembly的结果放到顶部").
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const sb = createServiceClient();
  const { data, error } = await sb
    .from('tour_assemblies')
    .select('id, status, cf_stream_uid, video_url, error, created_at')
    .eq('community_id', id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ assemblies: data ?? [] });
}
