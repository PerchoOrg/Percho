/**
 * /admin/pipeline/tour-jobs/[id] — per-listing tour hub.
 *
 * Shows every photo + every listing_videos row (walkthrough + agent
 * uploads) for a single listing, plus a button to regenerate the Ken
 * Burns walkthrough. Admin-scoped — bypasses agent ownership.
 *
 * .
 */

import { streamIframeUrl, thumbnailUrl } from '@/lib/cloudflare/stream';
import { webVideoUid } from '@/lib/feed/video-uid';
import { createServiceClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { EnhancePanel } from '../../../_components/EnhancePanel';
import { SurfacePreview } from '../../../_components/SurfacePreview';
import { VideoApproveButton } from '../../../_components/VideoApproveButton';
import { AdminGenerateTourButton } from './AdminGenerateTourButton';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

function photoPublicUrl(storagePath: string) {
  return `${SUPABASE_URL}/storage/v1/object/public/listing-photos/${storagePath}`;
}

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
        'id, storage_path, sort_order, width, height, enhanced_path, enhanced_status, enhanced_preset, enhanced_error',
      )
      .eq('listing_id', id)
      .order('sort_order', { ascending: true }) as unknown as Promise<{
      data: Array<{
        id: string;
        storage_path: string;
        sort_order: number;
        width: number | null;
        height: number | null;
        enhanced_path: string | null;
        enhanced_status: string;
        enhanced_preset: string | null;
        enhanced_error: string | null;
      }> | null;
    }>,
    supabase
      .from('listing_videos')
      .select(
        'id, cf_video_id, cf_video_id_landscape, cf_video_id_square, external_url, kind, status, title, sort_order, created_at, approved_at',
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
        approved_at: string | null;
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
            No videos yet. Click <em>Generate new tour video</em> to render one from the photos.
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
                  <div className="mt-3 space-y-2 text-xs">
                    <div className="font-medium">{v.title ?? v.kind}</div>
                    <div className="text-ink2">
                      {v.kind}
                      {' · '}
                      <span
                        className={
                          v.status === 'ready' || v.status === 'approved'
                            ? 'text-emerald-500'
                            : v.status === 'failed'
                              ? 'text-red-500'
                              : 'text-amber-500'
                        }
                      >
                        {v.status}
                      </span>
                      {v.status === 'ready' && !v.approved_at && (
                        <span className="text-amber-600"> · not in app yet</span>
                      )}
                      {v.status === 'ready' && !iosUid && (
                        <span className="text-amber-600"> · no iOS render</span>
                      )}
                      {v.status === 'ready' && !webUid && (
                        <span className="text-amber-600"> · no web render</span>
                      )}
                    </div>
                    {v.status === 'ready' && (
                      <div className="max-w-xs">
                        <VideoApproveButton
                          table="listing_videos"
                          videoId={v.id}
                          approved={!!v.approved_at}
                        />
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Photos <span className="text-ink2 text-sm font-normal">({photos.length})</span>
        </h2>
        {photos.length === 0 ? (
          <p className="text-ink2 rounded-2xl border border-line bg-surface p-6 text-sm">
            No photos uploaded yet.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {photos.map((p) => (
              <li key={p.id} className="overflow-hidden rounded-xl border border-line bg-surface">
                <a
                  href={photoPublicUrl(p.storage_path)}
                  target="_blank"
                  rel="noreferrer"
                  className="block"
                >
                  <div className="aspect-square w-full bg-black/20">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photoPublicUrl(p.storage_path)}
                      alt={`photo ${p.sort_order}`}
                      className="h-full w-full object-cover"
                    />
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <EnhancePanel
        table="listing_photos"
        storageBase={SUPABASE_URL}
        bucket="listing-photos"
        photos={photos}
      />
    </div>
  );
}
