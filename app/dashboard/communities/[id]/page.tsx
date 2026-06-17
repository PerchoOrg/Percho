/**
 * /dashboard/communities/[id] — community editor.
 *
 * Phase 17: video upload moved off this page (now at ./upload).
 * Phase 23 (2026-06-14): dropped Schools and POIs sections — agents weren't
 * using them and they cluttered the page. The DB tables stay (other code
 * paths still read them) but the UI no longer surfaces add/edit/delete.
 * Add-photos and Add-video are now a single "Upload" button (combined page).
 */

import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CommunityEditor } from './CommunityEditor';
import { CommunityCoverPanel } from './CommunityCoverPanel';
import { thumbnailUrl } from '@/lib/cloudflare/stream';

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

// Re-exported for downstream consumers that import these row types from
// this page module (e.g. the upload subpage). These mirror the shape of
// the corresponding tables; we keep them here to avoid churning callers.
export interface SchoolRow {
  id: string;
  name: string;
  grades: string | null;
  rating: number | null;
  source_url: string;
  recorded_at: string;
}

export interface PoiRow {
  id: string;
  name: string;
  poi_type: string;
  distance_text: string | null;
  source_url: string;
  recorded_at: string;
}

export default async function CommunityEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=%2Fdashboard%2Fcommunities%2F${id}`);

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: community } = (await (supabase as any)
    .from('communities')
    .select('id, name, slug, city, state, description, created_by, cover_video_id, cover_storage_path')
    .eq('id', id)
    .maybeSingle()) as { data: CommunityRow | null };

  if (!community) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center">
        <p className="text-sm text-cream/60">Community not found.</p>
      </div>
    );
  }

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: agentRow } = (await (supabase as any)
    .from('agents')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()) as { data: { id: string } | null };
  const myAgentId = agentRow?.id ?? null;
  const canEditMetadata = community.created_by == null || community.created_by === myAgentId;

  // Load this community's ready videos for the cover picker.
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: videoRows } = (await (supabase as any)
    .from('community_videos')
    .select('id, cf_video_id, title')
    .eq('community_id', community.id)
    .eq('status', 'ready')
    .order('created_at', { ascending: true })) as {
    data: Array<{ id: string; cf_video_id: string; title: string | null }> | null;
  };
  const coverVideos = videoRows ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4">
      <header className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{community.name}</h1>
          <p className="mt-1 text-sm text-cream/60">
            {community.city ? `${community.city}, ${community.state}` : community.state}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            href={`/dashboard/communities/${community.id}/upload`}
            className="rounded bg-gold px-3 py-2 font-medium text-ink text-sm transition hover:opacity-90"
          >
            + Upload
          </Link>
        </div>
      </header>

      <CommunityEditor community={community} canEditMetadata={canEditMetadata} />

      {/* Phase 35: video roster on the editor itself. Previously you had to
       * tap "+ Upload" just to see what was already there; now the editor
       * shows thumbnails up-front and the upload page is one tap away. */}
      <section className="rounded border border-bronze/30 bg-ink2 p-5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold">
            Videos <span className="text-cream/50 text-xs font-normal">({coverVideos.length})</span>
          </h2>
          <Link
            href={`/dashboard/communities/${community.id}/upload`}
            className="text-xs text-gold hover:underline"
          >
            Manage →
          </Link>
        </div>
        {coverVideos.length === 0 ? (
          <p className="text-xs text-cream/50">
            No videos yet. Tap <span className="text-cream/80">+ Upload</span> to add one.
          </p>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {coverVideos.slice(0, 8).map((v) => (
              <li
                key={v.id}
                className="aspect-video overflow-hidden rounded bg-ink"
                style={{
                  backgroundImage: `url(${thumbnailUrl(v.cf_video_id)})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
                title={v.title ?? '(untitled)'}
              />
            ))}
          </ul>
        )}
      </section>

      <CommunityCoverPanel
        communityId={community.id}
        canEdit={canEditMetadata}
        videos={coverVideos}
        initialCoverVideoId={community.cover_video_id}
        initialCoverStoragePath={community.cover_storage_path}
      />
    </div>
  );
}
