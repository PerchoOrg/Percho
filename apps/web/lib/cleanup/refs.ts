/**
 * Every Cloudflare Stream uid the database still points at, read from all six
 * columns that hold one, plus the stalled home-tour runs the cleanup panel
 * offers to close.
 *
 * The `live` / `superseded` split is the whole safety story, so it is spelled
 * out per column rather than inferred: a uid is `live` when something a viewer
 * can reach plays it, and `superseded` only when the sole thing holding it is
 * a tour assembly row that is no longer the current cut for its
 * (listing, surface) pair.
 */

import { type RefKind, buildRefMap } from '@/lib/cleanup/stream-orphans';
import type { createServiceClient } from '@/lib/supabase/server';

type Db = ReturnType<typeof createServiceClient>;

/** A run that stopped mid-pipeline and has not moved since. */
export type StalledRun = {
  id: string;
  listingId: string;
  status: string;
  updatedAt: string | null;
};

/** Statuses a run can sit in forever without anything noticing. */
const IN_FLIGHT = ['tagging', 'review', 'planning', 'generating', 'assembling'];

export const STALLED_AFTER_HOURS = 6;

export async function loadStreamRefs(sb: Db): Promise<Map<string, RefKind>> {
  const [videos, communityVideos, generated, covers, listingAsm, communityAsm] = await Promise.all([
    sb.from('listing_videos').select('cf_video_id, cf_video_id_landscape, cf_video_id_square'),
    sb.from('community_videos').select('cf_video_id'),
    sb.from('generated_videos').select('cf_stream_uid'),
    sb.from('communities').select('cover_video_id').not('cover_video_id', 'is', null),
    sb.from('listing_tour_assemblies').select('cf_stream_uid'),
    sb.from('tour_assemblies').select('cf_stream_uid'),
  ]);

  for (const res of [videos, communityVideos, generated, covers, listingAsm, communityAsm]) {
    // A failed read here would silently shrink the live set, and everything it
    // was hiding would be offered for deletion. Refuse to answer instead.
    if (res.error) throw new Error(`stream reference read failed: ${res.error.message}`);
  }

  const live: Array<string | null | undefined> = [];
  for (const v of videos.data ?? []) {
    live.push(v.cf_video_id, v.cf_video_id_landscape, v.cf_video_id_square);
  }
  for (const v of communityVideos.data ?? []) live.push(v.cf_video_id);
  for (const g of generated.data ?? []) live.push(g.cf_stream_uid);
  for (const c of covers.data ?? []) live.push(c.cover_video_id);

  const assemblies: Array<string | null | undefined> = [];
  for (const a of listingAsm.data ?? []) assemblies.push(a.cf_stream_uid);
  for (const a of communityAsm.data ?? []) assemblies.push(a.cf_stream_uid);

  return buildRefMap({ live, assemblies });
}

export async function loadStalledRuns(sb: Db, now = Date.now()): Promise<StalledRun[]> {
  const cutoff = new Date(now - STALLED_AFTER_HOURS * 3_600_000).toISOString();
  const { data, error } = await sb
    .from('listing_tour_runs')
    .select('id, listing_id, status, updated_at')
    .in('status', IN_FLIGHT)
    .lt('updated_at', cutoff)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`stalled run read failed: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id,
    listingId: r.listing_id,
    status: r.status,
    updatedAt: r.updated_at,
  }));
}
