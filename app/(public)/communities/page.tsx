/**
 * /communities — buyer-facing community grid (Phase 27).
 *
 * Phase 27.8 (2026-06-16): cards now use a 9:16 hero with the agent-
 * picked cover (video poster or uploaded image), falling back to the
 * first ready video's poster when no cover is set.
 */

import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { resolveCommunityCoverWithCfIds } from '@/lib/community/cover';

interface CommunityRow {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state: string;
  description: string | null;
  cover_video_id: string | null;
  cover_storage_path: string | null;
}

export default async function CommunitiesGridPage() {
  const supabase = await createClient();

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: rows } = (await (supabase as any)
    .from('communities')
    .select(
      'id, name, slug, city, state, description, cover_video_id, cover_storage_path',
    )
    .order('name', { ascending: true })) as { data: CommunityRow[] | null };

  const communities = rows ?? [];

  // Pull video counts + first-ready-video cf_video_id per community via
  // the membership view. We then resolve cover with two cf_video_ids
  // available (the chosen one and the fallback).
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: memberships } = (await (supabase as any)
    .from('community_video_membership')
    .select('community_id, video_id')) as {
    data: Array<{ community_id: string; video_id: string }> | null;
  };

  const allVideoIds = Array.from(new Set((memberships ?? []).map((m) => m.video_id)));
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: videoRows } = (await (supabase as any)
    .from('community_videos')
    .select('id, cf_video_id, status')
    .in('id', allVideoIds.length > 0 ? allVideoIds : ['00000000-0000-0000-0000-000000000000'])
    .eq('status', 'ready')) as {
    data: Array<{ id: string; cf_video_id: string }> | null;
  };
  const cfById = new Map<string, string>();
  for (const v of videoRows ?? []) cfById.set(v.id, v.cf_video_id);

  const countByCommunity = new Map<string, number>();
  const firstVideoCfByCommunity = new Map<string, string>();
  for (const m of memberships ?? []) {
    const cf = cfById.get(m.video_id);
    if (!cf) continue;
    countByCommunity.set(m.community_id, (countByCommunity.get(m.community_id) ?? 0) + 1);
    if (!firstVideoCfByCommunity.has(m.community_id)) {
      firstVideoCfByCommunity.set(m.community_id, cf);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-6">
        <h1 className="font-semibold text-2xl text-cream tracking-tight">Communities</h1>
        <p className="mt-1 text-cream/60 text-sm">
          Walk the block, hear the morning rush, see what after-dark really looks like — twelve
          neighborhood stories per community.
        </p>
      </header>

      {communities.length === 0 ? (
        <div className="rounded border border-bronze/30 border-dashed bg-ink2 px-6 py-12 text-center">
          <p className="text-cream/60 text-sm">No communities yet.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {communities.map((c) => {
            const videoCount = countByCommunity.get(c.id) ?? 0;
            const cover = resolveCommunityCoverWithCfIds({
              cover_video_id: c.cover_video_id,
              cover_video_cf_id: c.cover_video_id ? cfById.get(c.cover_video_id) ?? null : null,
              cover_storage_path: c.cover_storage_path,
              fallback_video_cf_id: firstVideoCfByCommunity.get(c.id) ?? null,
            });
            return (
              <li key={c.id}>
                <Link
                  href={`/c/${c.slug}`}
                  prefetch={false}
                  className="group relative block aspect-[9/16] overflow-hidden rounded-xl bg-ink2 ring-1 ring-bronze/30 transition hover:ring-gold/60"
                >
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={cover.url}
                      alt={c.name}
                      className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-bronze/20 to-ink">
                      <span className="font-semibold text-3xl text-cream/30">
                        {c.name.charAt(0)}
                      </span>
                    </div>
                  )}
                  {/* Bottom gradient + text overlay */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink via-ink/80 to-transparent p-3 pt-10">
                    <div className="font-medium text-cream text-sm leading-tight">{c.name}</div>
                    <div className="mt-0.5 text-cream/60 text-[11px]">
                      {c.city ? `${c.city}, ${c.state}` : c.state}
                    </div>
                    <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-gold/20 px-2 py-0.5 text-[10px] text-gold backdrop-blur">
                      {videoCount} {videoCount === 1 ? 'video' : 'videos'}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
