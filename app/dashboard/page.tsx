/**
 * Dashboard home — my listings (Phase 46 rebuild).
 *
 * Phase 46 changes:
 *   - status simplified to 'active' | 'inactive' (was draft/published/archived).
 *   - status tabs already hidden (phase 45.9). All rows render in a single
 *     buyer-facing grid — same layout as `/browse`.
 *   - Removed the `max-w-6xl px-3 sm:px-6 py-6 sm:py-8` wrapper that caused
 *     the empty-spaces gripe. Grid now bleeds edge-to-edge on mobile, with
 *     the same gutter rules as `/browse`.
 *
 * RLS scopes the result to the calling agent's own listings.
 *
 * Phase 35.3 (preserved): server-side loads all statuses in one query and
 * hands them to the client island; island filters in memory if needed.
 */

import {
  type ListingRow,
  ListingsTabbedList,
} from '@/app/dashboard/_components/ListingsTabbedList';
import { thumbnailUrl } from '@/lib/cloudflare/stream';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function DashboardHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: agentRow } = (await (supabase as any)
    .from('agents')
    .select('id, slug')
    .eq('user_id', user.id)
    .maybeSingle()) as { data: { id: string; slug: string } | null };
  const agentSlug = agentRow?.slug ?? null;
  const agentId = agentRow?.id ?? null;

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: allRows } = agentId
    ? ((await (supabase as any)
        .from('listings')
        .select(
          'id, slug, address, city, state, status, price, beds, baths, sqft, cover_url, updated_at',
        )
        .eq('agent_id', agentId)
        .order('updated_at', { ascending: false })) as {
        data: Array<{
          id: string;
          slug: string;
          address: string | null;
          city: string | null;
          state: string | null;
          status: string;
          price: number | null;
          beds: number | null;
          baths: number | null;
          sqft: number | null;
          cover_url: string | null;
          updated_at: string;
        }> | null;
      })
    : { data: [] };

  // Fallback covers: pull the first listing_video thumbnail per listing
  // when cover_url is null. One batched query ordered by ord asc; we keep
  // the first hit per listing in JS.
  const idsNeedingCover = (allRows ?? []).filter((l) => !l.cover_url).map((l) => l.id);
  const fallbackCovers = new Map<string, string>();
  if (idsNeedingCover.length > 0) {
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    const { data: vids } = (await (supabase as any)
      .from('listing_videos')
      .select('listing_id, cf_video_id, ord')
      .in('listing_id', idsNeedingCover)
      .eq('status', 'ready')
      .order('ord', { ascending: true })) as {
      data: Array<{ listing_id: string; cf_video_id: string; ord: number }> | null;
    };
    for (const v of vids ?? []) {
      if (!fallbackCovers.has(v.listing_id) && v.cf_video_id) {
        fallbackCovers.set(v.listing_id, thumbnailUrl(v.cf_video_id));
      }
    }
  }

  const rows: ListingRow[] = (allRows ?? []).map((r) => ({
    ...r,
    fallback_cover_url: fallbackCovers.get(r.id) ?? null,
  }));

  return (
    <ListingsTabbedList
      agentSlug={agentSlug}
      rows={rows}
      view="grid"
    />
  );
}
