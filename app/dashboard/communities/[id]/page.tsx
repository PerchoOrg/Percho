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
import {
  CommunityVideoManageList,
  type ManageVideoRow,
} from './CommunityVideoManageList';

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

  // Phase 35.2: full manage-list rows (visibility + category) so the editor
  // page is the manage surface — no more bouncing to /upload to delete or
  // hide a video.
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: videoRows } = (await (supabase as any)
    .from('community_videos')
    .select(
      'id, cf_video_id, title, category, category_needs_review, status, visibility, created_at',
    )
    .eq('community_id', community.id)
    .order('created_at', { ascending: false })) as {
    data: ManageVideoRow[] | null;
  };
  const manageVideos = videoRows ?? [];
  // CoverPanel still wants the lighter shape (id, cf_video_id, title) for
  // ready videos only — not every uploaded video is cover-eligible.
  const coverVideos = manageVideos
    .filter((v) => v.status === 'ready' && v.visibility === 'public')
    .map((v) => ({ id: v.id, cf_video_id: v.cf_video_id, title: v.title }));

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

      {/* Phase 35.2: Videos first — that's why agents come here. Inline manage
       * list lets them re-categorize / hide / archive / delete without bouncing
       * to /upload. The metadata editor and cover picker drop below. */}
      <section className="rounded border border-bronze/30 bg-ink2 p-4 sm:p-5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold">
            Videos{' '}
            <span className="text-cream/50 text-xs font-normal">({manageVideos.length})</span>
          </h2>
          <Link
            href={`/dashboard/communities/${community.id}/upload`}
            className="text-xs text-gold hover:underline"
          >
            + Add
          </Link>
        </div>
        <CommunityVideoManageList
          communityId={community.id}
          videos={manageVideos}
        />
      </section>

      {/* Cover picker — uses the public+ready subset. */}
      <CommunityCoverPanel
        communityId={community.id}
        canEdit={canEditMetadata}
        videos={coverVideos}
        initialCoverVideoId={community.cover_video_id}
        initialCoverStoragePath={community.cover_storage_path}
      />

      {/* Metadata editor moved below — agents rarely re-edit name/city after
       * creation. Collapsed by default to keep the working video list above
       * the fold. */}
      <details className="rounded border border-bronze/30 bg-ink2">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-cream/85 hover:text-cream sm:px-5">
          Community details{' '}
          <span className="ml-1 text-xs text-cream/50">(name, city, description)</span>
        </summary>
        <div className="border-t border-bronze/20 p-4 sm:p-5">
          <CommunityEditor community={community} canEditMetadata={canEditMetadata} />
        </div>
      </details>
    </div>
  );
}
