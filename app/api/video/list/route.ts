import { createClient } from '@/lib/supabase/server';
/**
 * GET /api/video/list?listing_id=<uuid>
 *
 * Returns listing_videos rows for the given listing. Owner-fenced via RLS:
 * the caller's anon client only sees rows under listings they own.
 *
 * Used by the dashboard upload harness to poll for status transitions
 * (processing → ready) as a fallback when Realtime isn't delivering events.
 */
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const listingId = url.searchParams.get('listing_id');
  if (!listingId) {
    return NextResponse.json({ error: 'missing_listing_id' }, { status: 400 });
  }

  const { data, error } = (await supabase
    .from('listing_videos')
    .select('id, cf_video_id, kind, title, status, created_at')
    .eq('listing_id', listingId)
    .order('created_at', { ascending: false })) as {
    data: Array<{
      id: string;
      cf_video_id: string;
      kind: string;
      title: string | null;
      status: string;
      created_at: string;
    }> | null;
    error: unknown;
  };

  if (error) {
    return NextResponse.json({ error: 'list_failed' }, { status: 500 });
  }

  return NextResponse.json({ videos: data ?? [] });
}
