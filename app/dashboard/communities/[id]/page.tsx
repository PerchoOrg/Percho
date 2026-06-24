/**
 * /dashboard/communities/[id] — community detail (Phase 50 rebuild,
 * 2026-06-22).
 *
 * Mirrors the listing edit hub's 4-icon-tab structure so the agent's
 * dashboard reads identically across listings and communities:
 *
 *   Details · Media · Marketing · Analytics
 *
 *   - Details   : metadata edit (CommunityEditor) + buyer link.
 *   - Media     : Videos + Photos in one card. Cover selection is inline
 *                 per row/photo (Phase 50.9, 2026-06-23) — no separate
 *                 cover panel.
 *   - Marketing : owner-only language-only marketing copy generator
 *                 (CommunityMarketingPanel — the community sibling of
 *                 the listing SocialCopyPanel).
 *   - Analytics : owner-only generic AnalyticsPanel (entityKind=community).
 *
 * Non-owner contributors still see Details + Media so they can manage
 * their own video/photo contributions; Marketing and Analytics are
 * hidden because they are not theirs to act on.
 *
 * Hero: HeroHeader (matches listing hub) — chromeless top-right control
 * row with a Preview link + InstantStatusToggle, title/subtitle bottom-left.
 */

import { thumbnailUrl } from '@/lib/cloudflare/stream';
import { resolveCommunityCoverWithCfIds } from '@/lib/community/cover';
import { demoCoverFor } from '@/lib/demo-media';
import { createClient } from '@/lib/supabase/server';
import { FileText, ImageIcon, LineChart, Megaphone } from 'lucide-react';
import { redirect } from 'next/navigation';

import { AnalyticsPanel } from '@/app/dashboard/_components/AnalyticsPanel';
import { HeroControl } from '@/app/dashboard/_components/HeroControl';
import { HeroHeader } from '@/app/dashboard/_components/HeroHeader';
import { HubTabs } from '@/app/dashboard/_components/HubTabs';
import { InstantStatusToggle } from '@/app/dashboard/_components/InstantStatusToggle';

import { CommunityDangerZone, CommunityEditor } from './CommunityEditor';
import { CommunityMarketingPanel } from './CommunityMarketingPanel';
import { CommunityMediaPanel } from './CommunityMediaPanel';
import type { CommunityPhotoRow } from './CommunityPhotoPanel';
import type { ManageVideoRow } from './CommunityVideoManageList';
import { signCommunityPhotoUrls } from './photo-actions';

interface CommunityRow {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state: string;
  description: string | null;
  status: string;
  created_by: string | null;
  cover_video_id: string | null;
  cover_storage_path: string | null;
  // Phase 50.4 — expanded metadata.
  zip: string | null;
  county: string | null;
  hoa_fee_monthly: number | null;
  year_built: number | null;
  year_built_end: number | null;
  price_min: number | null;
  price_max: number | null;
  property_types: string[] | null;
  highlights: string[] | null;
  builder: string | null;
  website: string | null;
}

// Re-exported for downstream consumers (e.g. upload subpage).
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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=%2Fdashboard%2Fcommunities%2F${id}`);

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: community } = (await (supabase as any)
    .from('communities')
    .select(
      'id, name, slug, city, state, description, status, created_by, cover_video_id, cover_storage_path, zip, county, hoa_fee_monthly, year_built, year_built_end, price_min, price_max, property_types, highlights, builder, website',
    )
    .eq('id', id)
    .maybeSingle()) as { data: CommunityRow | null };

  if (!community) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center sm:px-6">
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
  const isOwner = community.created_by != null && community.created_by === myAgentId;
  const canEditMetadata = community.created_by == null || isOwner;

  // Manage list — only own videos (legacy NULL uploaded_by visible to creator).
  const ownsLegacy = community.created_by != null && community.created_by === myAgentId;
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  let manageQuery = (supabase as any)
    .from('community_videos')
    .select(
      'id, cf_video_id, title, description, category, category_needs_review, status, visibility, created_at, uploaded_by, uploader:agents!community_videos_uploaded_by_fkey(slug, name)',
    )
    .eq('community_id', community.id);
  if (myAgentId != null) {
    manageQuery = ownsLegacy
      ? manageQuery.or(`uploaded_by.eq.${myAgentId},uploaded_by.is.null`)
      : manageQuery.eq('uploaded_by', myAgentId);
  } else {
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
    description: row.description ?? null,
    category: row.category,
    category_needs_review: row.category_needs_review,
    status: row.status,
    visibility: row.visibility,
    created_at: row.created_at,
    uploaded_by: row.uploaded_by ?? null,
    uploaderSlug: row.uploader?.slug ?? null,
    uploaderDisplayName: row.uploader?.name ?? null,
  }));
  // Phase 50.9 (2026-06-23): cover selection moved inline into the
  // Media tab (Set as cover button per video row, ⭐ per photo). No
  // separate `coverVideos` derivation needed — CommunityVideoManageList
  // gates "Set as cover" on `status === 'ready'` itself.

  // Photos for the Media tab.
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: photoRows } = (await (supabase as any)
    .from('community_photos')
    .select(
      'id, storage_path, kind, category, school_id, poi_id, alt_text, width, height, sort_order',
    )
    .eq('community_id', community.id)
    .order('sort_order', { ascending: true })) as {
    data: Array<{
      id: string;
      storage_path: string;
      kind: string;
      category: string | null;
      school_id: string | null;
      poi_id: string | null;
      alt_text: string | null;
      width: number | null;
      height: number | null;
      sort_order: number;
    }> | null;
  };
  const dbPhotos = photoRows ?? [];
  const signed = await signCommunityPhotoUrls(dbPhotos.map((p) => p.storage_path));
  const urlByPath = new Map(signed.map((s) => [s.path, s.url]));
  const initialPhotos: CommunityPhotoRow[] = dbPhotos.map((p) => ({
    id: p.id,
    storage_path: p.storage_path,
    signed_url: urlByPath.get(p.storage_path) ?? null,
    kind: p.kind,
    category: p.category,
    school_id: p.school_id,
    poi_id: p.poi_id,
    alt_text: p.alt_text,
    width: p.width,
    height: p.height,
    sort_order: p.sort_order,
  }));

  // Hero cover resolution — same path the buyer-facing public page uses.
  const firstReadyVideo = manageVideos.find(
    (v) => v.status === 'ready' && v.visibility === 'public',
  );
  const coverVideoCfId = community.cover_video_id
    ? (manageVideos.find((v) => v.id === community.cover_video_id)?.cf_video_id ?? null)
    : null;
  const heroCover = resolveCommunityCoverWithCfIds({
    cover_video_id: community.cover_video_id,
    cover_video_cf_id: coverVideoCfId,
    cover_storage_path: community.cover_storage_path,
    fallback_video_cf_id: firstReadyVideo?.cf_video_id ?? null,
  });
  void thumbnailUrl;
  const heroCoverUrl = heroCover
    ? (demoCoverFor(community.slug, heroCover.url) ?? heroCover.url)
    : null;

  const subtitle = community.city ? `${community.city}, ${community.state}` : community.state;

  // Tabs — Details + Media always; Marketing + Analytics owner-only.
  const tabs = [
    {
      id: 'details',
      label: 'Details',
      icon: <FileText className="h-5 w-5" strokeWidth={1.6} />,
    },
    {
      id: 'media',
      label: 'Media',
      icon: <ImageIcon className="h-5 w-5" strokeWidth={1.6} />,
    },
    ...(canEditMetadata
      ? [
          {
            id: 'marketing',
            label: 'Marketing',
            icon: <Megaphone className="h-5 w-5" strokeWidth={1.6} />,
          },
          {
            id: 'analytics',
            label: 'Analytics',
            icon: <LineChart className="h-5 w-5" strokeWidth={1.6} />,
          },
        ]
      : []),
  ];

  return (
    <>
      <HeroHeader
        coverUrl={heroCoverUrl}
        title={community.name}
        subtitle={subtitle}
        controls={
          <>
            <HeroControl href={`/c/${community.slug}`}>
              <span aria-hidden>↗</span>
              <span>Preview</span>
            </HeroControl>
            {canEditMetadata && (
              <InstantStatusToggle kind="community" id={community.id} status={community.status} />
            )}
          </>
        }
      />

      <HubTabs
        tabs={tabs}
        defaultTab="details"
        eagerMount
        panels={{
          details: (
            <div className="space-y-6">
              <section className="rounded-2xl border border-line bg-surface p-4 sm:p-6">
                {!canEditMetadata && (
                  <p className="mb-4 rounded border border-line bg-bg px-3 py-2 text-xs text-ink2">
                    Only the agent who created this community can edit metadata. You can still
                    upload videos and photos.
                  </p>
                )}
                <CommunityEditor community={community} canEditMetadata={canEditMetadata} />
              </section>
              {canEditMetadata && <CommunityDangerZone communityId={community.id} />}
            </div>
          ),
          media: (
            <div className="space-y-4">
              <CommunityMediaPanel
                communityId={community.id}
                videos={manageVideos}
                myAgentId={myAgentId}
                photos={initialPhotos}
                coverVideoId={community.cover_video_id}
                coverStoragePath={community.cover_storage_path}
                canSetCover={canEditMetadata}
              />
            </div>
          ),
          ...(canEditMetadata
            ? {
                marketing: <CommunityMarketingPanel communityId={community.id} />,
                analytics: <AnalyticsPanel entityKind="community" entityId={community.id} />,
              }
            : {}),
        }}
      />
    </>
  );
}
