import { createClient } from '@/lib/supabase/server';
/**
 * GET /api/video/list?listing_id=<uuid>
 * GET /api/video/list?community_id=<uuid>
 *
 * Returns video rows for the given parent. Owner-fenced via RLS for listings;
 * communities are publicly readable (V1 shared-community model).
 *
 * Used by dashboard panels to poll for status transitions (processing → ready)
 * as a fallback when Realtime isn't delivering events.
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
  const communityId = url.searchParams.get('community_id');

  if (listingId) {
    const { data, error } = (await supabase
      .from('listing_videos')
      .select('id, cf_video_id, cf_video_id_landscape, kind, title, status, created_at')
      .eq('listing_id', listingId)
      .order('created_at', { ascending: false })) as {
      data: Array<{
        id: string;
        cf_video_id: string;
        cf_video_id_landscape: string | null;
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

  if (communityId) {
    const { data, error } = (await supabase
      .from('community_videos')
      .select(
        'id, cf_video_id, kind, category, category_needs_review, school_id, poi_id, title, status, created_at',
      )
      .eq('community_id', communityId)
      .order('created_at', { ascending: false })) as {
      data: Array<{
        id: string;
        cf_video_id: string;
        kind: string;
        category: string | null;
        category_needs_review: boolean | null;
        school_id: string | null;
        poi_id: string | null;
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

  return NextResponse.json({ error: 'missing_parent_id' }, { status: 400 });
}
