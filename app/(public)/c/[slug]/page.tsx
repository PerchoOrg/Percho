/**
 * /c/[slug] — buyer-facing community page (Phase 27).
 *
 * Shows: community name + description + counts, a thumbnail grid of all
 * videos that belong to this community (primary + extra memberships via the
 * community_video_membership view), and a CTA to view the active listings
 * inside this community.
 *
 * Phase 27 ships the IA + data plumbing. Tapping a video tile currently
 * routes the user back to /browse/feed (the existing buyer swipe surface);
 * a community-scoped swipe feed (filter the feed to this community's
 * videos only) is a follow-up — the wiring needed lives in
 * `lib/feed/browse-cards.ts` and is not in scope for this phase to keep
 * the change surgical.
 */

import { createClient } from '@/lib/supabase/server';
import { thumbnailUrl } from '@/lib/cloudflare/stream';
import { resolveCommunityCoverWithCfIds } from '@/lib/community/cover';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Building2, Film } from 'lucide-react';

interface CommunityRow {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state: string;
  description: string | null;
  created_by: string | null;
  cover_video_id: string | null;
  cover_storage_path: string | null;
}

interface VideoRow {
  id: string;
  cf_video_id: string;
  title: string | null;
  category: string | null;
}

export default async function CommunityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: community } = (await (supabase as any)
    .from('communities')
    .select('id, name, slug, city, state, description, created_by, cover_video_id, cover_storage_path')
    .eq('slug', slug)
    .maybeSingle()) as { data: CommunityRow | null };

  if (!community) notFound();

  // Membership view: primary community_id on community_videos UNION extras.
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: memberships } = (await (supabase as any)
    .from('community_video_membership')
    .select('video_id')
    .eq('community_id', community.id)) as { data: Array<{ video_id: string }> | null };

  const videoIds = (memberships ?? []).map((m) => m.video_id);

  let videos: VideoRow[] = [];
  if (videoIds.length > 0) {
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    const { data: rows } = (await (supabase as any)
      .from('community_videos')
      .select('id, cf_video_id, title, category')
      .in('id', videoIds)
      .eq('status', 'ready')) as { data: VideoRow[] | null };
    videos = rows ?? [];
  }

  // Active listings count (status filter mirrors how /browse already
  // selects "active" inventory — see lib/feed/browse-cards.ts).
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { count: activeListings } = await (supabase as any)
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .eq('community_id', community.id)
    .eq('status', 'published');

  // Resolve hero cover: explicit pick → uploaded image → first ready video poster.
  const firstReadyVideo = videos[0] ?? null;
  const coverVideoCfId = community.cover_video_id
    ? videos.find((v) => v.id === community.cover_video_id)?.cf_video_id ?? null
    : null;
  const heroCover = resolveCommunityCoverWithCfIds({
    cover_video_id: community.cover_video_id,
    cover_video_cf_id: coverVideoCfId,
    cover_storage_path: community.cover_storage_path,
    fallback_video_cf_id: firstReadyVideo?.cf_video_id ?? null,
  });

  return (
    <div className="mx-auto max-w-5xl">
      {/* Hero — 21:9 banner with cover + dark gradient overlay for text legibility */}
      <div className="relative aspect-[21/9] w-full overflow-hidden bg-ink2 sm:rounded-b-xl">
        {heroCover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroCover.url}
            alt={community.name}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-bronze/30 to-ink" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/60 to-ink/10" />
        <div className="absolute inset-x-0 bottom-0 px-4 py-4 sm:px-6 sm:py-5">
          <h1 className="font-semibold text-2xl text-cream tracking-tight sm:text-3xl">
            {community.name}
          </h1>
          <div className="mt-1 text-cream/70 text-sm">
            {community.city ? `${community.city}, ${community.state}` : community.state}
          </div>
        </div>
      </div>

      <div className="px-4 py-6">
        <header className="mb-6">
          {community.description ? (
            <p className="max-w-2xl text-cream/70 text-sm">{community.description}</p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/10 px-3 py-1 text-gold text-xs">
              <Film size={12} aria-hidden="true" />
              {videos.length} community {videos.length === 1 ? 'video' : 'videos'}
            </span>
            <Link
              href={`/browse?community=${community.slug}`}
              prefetch={false}
              className="inline-flex items-center gap-1.5 rounded-full bg-gold/10 px-3 py-1 text-gold text-xs transition hover:bg-gold/20"
            >
              <Building2 size={12} aria-hidden="true" />
              {activeListings ?? 0} active{' '}
              {(activeListings ?? 0) === 1 ? 'listing' : 'listings'}
            </Link>
          </div>
        </header>

      {videos.length === 0 ? (
        <div className="rounded border border-bronze/30 border-dashed bg-ink2 px-6 py-12 text-center">
          <p className="text-cream/60 text-sm">No videos in this community yet.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {videos.map((v) => (
            <li key={v.id}>
              <Link
                href={`/c/${community.slug}/feed?start=${v.id}`}
                prefetch={false}
                className="group relative block aspect-[9/16] overflow-hidden rounded-lg bg-ink2"
              >
                {/* Cloudflare Stream auto-generated thumbnail */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbnailUrl(v.cf_video_id)}
                  alt={v.title ?? 'Community video'}
                  className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                  loading="lazy"
                />
                {v.category ? (
                  <span className="absolute top-1.5 left-1.5 rounded bg-gold/90 px-1.5 py-0.5 font-medium text-[10px] text-ink">
                    {v.category}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
      </div>
    </div>
  );
}
