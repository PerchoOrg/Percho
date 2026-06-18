/**
 * /dashboard/communities/[id] — community editor.
 *
 * Phase 17: video upload moved off this page (now at ./upload).
 * Phase 23 (2026-06-14): dropped Schools and POIs sections — agents weren't
 * using them and they cluttered the page. The DB tables stay (other code
 * paths still read them) but the UI no longer surfaces add/edit/delete.
 * Add-photos and Add-video are now a single "Upload" button (combined page).
 *
 * Phase 36 follow-up (2026-06-18, Tianrou agent UAT): manage list only shows
 * videos uploaded by the viewing agent. Showing other agents' rows here
 * was meaningless — RLS already blocks edit/hide/delete, the videos can't
 * play in this surface, and after Phase 36 IA (agents share buyer
 * surfaces), the right place to browse a community's full video set is
 * `/c/<slug>` itself. Header carries a small link there.
 */

import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CommunityCoverPanel } from './CommunityCoverPanel';
import { CommunityEditor } from './CommunityEditor';
import { CommunityVideoManageList, type ManageVideoRow } from './CommunityVideoManageList';

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
    .select(
      'id, name, slug, city, state, description, created_by, cover_video_id, cover_storage_path',
    )
    .eq('id', id)
    .maybeSingle()) as { data: CommunityRow | null };

  if (!community) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center">
        <p className="text-sm text-ink2">Community not found.</p>
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
  // Phase 35.3: include uploaded_by so the row can render owner-only chrome
  // (delete/edit only if you uploaded it; "by @other-agent" caption otherwise).
  // Phase 36 follow-up: filter to videos owned by the viewing agent. Legacy
  // NULL `uploaded_by` rows are included only if this agent is the
  // community creator — otherwise they'd be unmanageable forever.
  const ownsLegacy = community.created_by != null && community.created_by === myAgentId;
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  let manageQuery = (supabase as any)
    .from('community_videos')
    .select(
      'id, cf_video_id, title, category, category_needs_review, status, visibility, created_at, uploaded_by, uploader:agents!community_videos_uploaded_by_fkey(slug, name)',
    )
    .eq('community_id', community.id);
  if (myAgentId != null) {
    manageQuery = ownsLegacy
      ? manageQuery.or(`uploaded_by.eq.${myAgentId},uploaded_by.is.null`)
      : manageQuery.eq('uploaded_by', myAgentId);
  } else {
    // Not an agent → no manage rows.
    manageQuery = manageQuery.eq('uploaded_by', '00000000-0000-0000-0000-000000000000');
  }
  const { data: videoRows } = (await manageQuery.order('created_at', {
    ascending: false,
  })) as {
    data:
      | (Omit<ManageVideoRow, 'uploaderSlug' | 'uploaderDisplayName'> & {
          uploader: { slug: string | null; name: string | null } | null;
        })[]
      | null;
  };
  const manageVideos: ManageVideoRow[] = (videoRows ?? []).map((row) => ({
    id: row.id,
    cf_video_id: row.cf_video_id,
    title: row.title,
    category: row.category,
    category_needs_review: row.category_needs_review,
    status: row.status,
    visibility: row.visibility,
    created_at: row.created_at,
    uploaded_by: row.uploaded_by ?? null,
    uploaderSlug: row.uploader?.slug ?? null,
    uploaderDisplayName: row.uploader?.name ?? null,
  }));
  // CoverPanel still wants the lighter shape (id, cf_video_id, title) for
  // ready videos only — not every uploaded video is cover-eligible.
  const coverVideos = manageVideos
    .filter((v) => v.status === 'ready' && v.visibility === 'public')
    .map((v) => ({ id: v.id, cf_video_id: v.cf_video_id, title: v.title }));

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4">
      <Link
        href="/dashboard/communities"
        className="inline-flex items-center gap-1 text-xs text-ink2 hover:text-ink"
      >
        ← Back to communities
      </Link>
      <header className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{community.name}</h1>
          <p className="mt-1 text-sm text-ink2">
            {community.city ? `${community.city}, ${community.state}` : community.state}
          </p>
          {/*
            Phase 36 follow-up: agents share buyer surfaces — link to the
            public community page so an agent can browse every video in
            this community (not just their own) the same way a buyer does.
          */}
          <Link
            href={`/c/${community.slug}`}
            className="mt-1 inline-flex items-center gap-1 text-xs text-ink2 hover:text-ink"
          >
            View public page →
          </Link>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            href={`/dashboard/communities/${community.id}/upload`}
            className="rounded bg-ink px-3 py-2 font-medium text-cream text-sm transition hover:opacity-90"
          >
            + Upload video
          </Link>
        </div>
      </header>

      {/* Phase 35.2: Videos first — that's why agents come here. Inline manage
       * list lets them re-categorize / hide / archive / delete without bouncing
       * to /upload. The metadata editor and cover picker drop below. */}
      <section className="rounded border border-line bg-surface p-4 sm:p-5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold">
            Your videos{' '}
            <span className="text-muted text-xs font-normal">({manageVideos.length})</span>
          </h2>
        </div>
        <CommunityVideoManageList
          communityId={community.id}
          videos={manageVideos}
          myAgentId={myAgentId}
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
       * the fold.
       *
       * Phase 36 follow-up (2026-06-18, Tianrou): community metadata is owned
       * by the creating agent. Other agents can upload videos to this
       * community but should not see — let alone interact with — name/city/
       * description fields. Hide the entire <details> block when
       * !canEditMetadata. (RLS already blocks writes; this is the UI-side
       * half of the same rule so non-owners don't see a misleading
       * read-only form. Same reason CommunityCoverPanel returns null for
       * non-owners.) */}
      {canEditMetadata && (
        <details className="rounded border border-line bg-surface">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-ink2 hover:text-ink sm:px-5">
            Community details{' '}
            <span className="ml-1 text-xs text-muted">(name, city, description)</span>
          </summary>
          <div className="border-t border-line p-4 sm:p-5">
            <CommunityEditor community={community} canEditMetadata={canEditMetadata} />
          </div>
        </details>
      )}
    </div>
  );
}
