/**
 * GET /api/admin/listings/[id]/assemblies
 *   listing_tour_assemblies rows for this listing, newest first.
 *
 * The step strip's Assemble chip reads this rather than whether the assemble
 * request returned. Owner 2026-08-20, on the community tour and equally true
 * here: "I clicked rerun of assembly, the video is not yet ready, the Assemble
 * is green, that is not right." Green means the film exists.
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { id } = await params;
  const sb = createServiceClient();

  const { data, error } = await sb
    .from('listing_tour_assemblies')
    .select('id, run_id, surface, status, cf_stream_uid, video_url, error, created_at')
    .eq('listing_id', id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ assemblies: data ?? [] });
}
