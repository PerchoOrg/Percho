/**
 * /dashboard/communities/[id]/upload — combined video + photo upload.
 *
 * Phase 23 (2026-06-14): collapses the previous /videos and /photos
 * subpages into one screen.
 * Phase 25 (2026-06-14): unified the two separate category pickers (one
 * per panel) into a single shared dropdown at the top of the page via
 * CommunityUploadShell. Same category drives both the video upload and
 * the photo batch — drop a video, drop a stack of photos, both get tagged
 * the same way without re-picking.
 */

import type { CommunityPhotoRow } from '@/app/dashboard/communities/[id]/CommunityPhotoPanel';
import { signCommunityPhotoUrls } from '@/app/dashboard/communities/[id]/photo-actions';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CommunityUploadShell } from '../CommunityUploadShell';
import type { CommunityVideoRow } from '../CommunityVideoPanel';

interface CommunityRow {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state: string;
}

interface CommunityPhotoDbRow {
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
}

export default async function CommunityUploadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=%2Fdashboard%2Fcommunities%2F${id}%2Fupload`);

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: community } = (await (supabase as any)
    .from('communities')
    .select('id, name, slug, city, state')
    .eq('id', id)
    .maybeSingle()) as { data: CommunityRow | null };

  if (!community) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center">
        <p className="text-sm text-cream/60">Community not found.</p>
      </div>
    );
  }

  const [{ data: videosRaw }, { data: photosRaw }] = await Promise.all([
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    (supabase as any)
      .from('community_videos')
      .select(
        'id, cf_video_id, kind, category, category_needs_review, school_id, poi_id, title, status, created_at',
      )
      .eq('community_id', id)
      .order('created_at', { ascending: false }) as Promise<{
      data: CommunityVideoRow[] | null;
    }>,
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    (supabase as any)
      .from('community_photos')
      .select(
        'id, storage_path, kind, category, school_id, poi_id, alt_text, width, height, sort_order',
      )
      .eq('community_id', id)
      .order('sort_order', { ascending: true }) as Promise<{
      data: CommunityPhotoDbRow[] | null;
    }>,
  ]);

  const dbPhotos = photosRaw ?? [];
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

  return (
    <div className="mx-auto max-w-3xl space-y-4 py-4">
      <header className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{community.name}</h1>
          <p className="mt-1 text-sm text-cream/60">
            {community.city ? `${community.city}, ${community.state}` : community.state} ·{' '}
            <Link
              href={`/dashboard/communities/${community.id}`}
              className="text-cream/70 underline-offset-2 hover:text-gold hover:underline"
            >
              edit details
            </Link>
          </p>
        </div>
        <Link
          href="/dashboard/communities"
          className="shrink-0 text-xs text-cream/60 hover:text-cream"
        >
          ← all communities
        </Link>
      </header>

      <CommunityUploadShell
        communityId={community.id}
        initialVideos={videosRaw ?? []}
        initialPhotos={initialPhotos}
      />
    </div>
  );
}
