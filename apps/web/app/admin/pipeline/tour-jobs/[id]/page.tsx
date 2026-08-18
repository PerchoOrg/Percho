import { createServiceClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { PhotoTable } from '../../../_components/PhotoTable';
import { SurfacePreview } from '../../../_components/SurfacePreview';
import { AdminGenerateTourButton } from './AdminGenerateTourButton';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

interface Params {
  id: string;
}

export default async function AdminTourJobsDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: listing } = (await supabase
    .from('listings')
    .select('id, address, city, state, zip, status, agents(name, slug)')
    .eq('id', id)
    .maybeSingle()) as {
    data: {
      id: string;
      address: string;
      city: string;
      state: string;
      zip: string | null;
      status: string;
      agents: { name: string; slug: string } | null;
    } | null;
  };

  if (!listing) notFound();

  const [photoRes, videoRes] = await Promise.all([
    supabase
      .from('listing_photos')
      .select(
        'id, storage_path, sort_order, width, height, ai_tags, ai_score, tagged_at, used_in_video_at, used_clip_index, enhanced_path, enhanced_status, enhanced_preset, enhanced_error',
      )
      .eq('listing_id', id)
      .order('sort_order', { ascending: true }) as unknown as Promise<{
      data: Array<{
        id: string;
        storage_path: string;
        sort_order: number;
        width: number | null;
        height: number | null;
        ai_tags: Record<string, unknown> | null;
        ai_score: number | null;
        tagged_at: string | null;
        used_in_video_at: string | null;
        used_clip_index: number | null;
        enhanced_path: string | null;
        enhanced_status: string;
        enhanced_preset: string | null;
        enhanced_error: string | null;
      }> | null;
    }>,
    supabase
      .from('listing_videos')
      .select(
        'id, cf_video_id, cf_video_id_landscape, cf_video_id_square, external_url, kind, status, title, sort_order, created_at',
      )
      .eq('listing_id', id)
      .order('sort_order', { ascending: true }) as unknown as Promise<{
      data: Array<{
        id: string;
        cf_video_id: string | null;
        cf_video_id_landscape: string | null;
        cf_video_id_square: string | null;
        external_url: string | null;
        kind: string;
        status: string;
        title: string | null;
        sort_order: number;
        created_at: string;
      }> | null;
    }>,
  ]);

  const photos = photoRes.data ?? [];
  const videos = videoRes.data ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{listing.address}</h1>
        </div>
        <AdminGenerateTourButton listingId={listing.id} photoCount={photos.length} />
      </header>

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Videos <span className="text-ink2 text-sm font-normal">({videos.length})</span>
        </h2>
        {videos.length === 0 ? (
          <p className="text-ink2 rounded-2xl border border-line bg-surface p-6 text-sm">
            No videos yet. Use the Generate buttons above to render from the photos.
          </p>
        ) : (
          <ul className="space-y-4">
            {videos.map((v) => {
              // Each surface previewed SEPARATELY at its own aspect — a 1:1 asset
              // squeezed into one shared 9:16 tile told you nothing about what the
              // buyer actually sees (owner, 2026-08-03).
              const iosUid = v.cf_video_id_square;
              // Web plays landscape; portrait is the legacy column, and square is
              // the last-resort fallback webVideoUid() applies for old rows.
              const webUid = v.cf_video_id_landscape ?? v.cf_video_id;
              return (
                <li key={v.id} className="rounded-2xl border border-line bg-surface p-4">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <SurfacePreview surface="ios" uid={iosUid} status={v.status} />
                    <SurfacePreview surface="web" uid={webUid} status={v.status} />
                  </div>
                  <div className="mt-3 text-xs">
                    {/* Title, kind and status line removed 2026-08-03: a render
                        goes live the moment it finishes, so the only thing worth
                        surfacing is a MISSING surface or an outright failure. */}
                    {v.status === 'failed' ? (
                      <span className="text-red-500">Render failed.</span>
                    ) : v.status !== 'ready' ? (
                      <span className="text-amber-500">{v.status}…</span>
                    ) : !iosUid || !webUid ? (
                      <span className="text-amber-600">
                        {!iosUid && !webUid
                          ? 'Neither surface rendered yet.'
                          : !iosUid
                            ? 'No iOS render — click Generate iOS video.'
                            : 'No web render — click Generate web video.'}
                      </span>
                    ) : (
                      <span className="text-emerald-600">Live on iOS and web.</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <PhotoTable
        table="listing_photos"
        storageBase={SUPABASE_URL}
        bucket="listing-photos"
        photos={photos}
      />
    </div>
  );
}
