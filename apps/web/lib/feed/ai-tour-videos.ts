/**
 * AI community-tour videos (Seedance, generated via the admin Community Tour
 * page) for the mobile feed — the same source the admin route and the
 * community detail DTO read.
 *
 * Feed uses this to (a) hoist communities that HAVE an AI tour video into the
 * dev sampler (`videoFirst`), and (b) attach the mp4 URL to the community DTO
 * so `CommunityFace` renders `CardVideo` for AI tours exactly as it does for
 * vertical hero videos.
 */

import { AI_VIDEO_BUCKET } from '@/lib/poi/ai-tour-video';
import { createServiceClient } from '@/lib/supabase/server';

/** Map of community id → public URL of its latest READY AI tour video. */
export async function fetchAiTourVideoByCommunity(): Promise<Map<string, string>> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('ai_tour_videos')
    .select('community_id, storage_path, created_at')
    .eq('status', 'ready');

  if (error) throw new Error(`ai tour videos fetch failed: ${error.message}`);
  if (!data) return new Map();

  // Latest ready video per community (multiple videos per community possible).
  const latest = new Map<string, { url: string; createdAt: string }>();
  for (const row of data as { community_id: string; storage_path: string; created_at: string }[]) {
    if (!row.storage_path) continue;
    const prev = latest.get(row.community_id);
    if (prev === undefined || row.created_at > prev.createdAt) {
      const { data: urlData } = supabase.storage
        .from(AI_VIDEO_BUCKET)
        .getPublicUrl(row.storage_path);
      latest.set(row.community_id, {
        url: (urlData as { publicUrl: string }).publicUrl,
        createdAt: row.created_at,
      });
    }
  }
  return new Map([...latest].map(([id, v]) => [id, v.url]));
}
