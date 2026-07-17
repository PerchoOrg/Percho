/**
 * /admin/pipeline/tour-jobs/[id] — per-listing tour hub.
 *
 * Shows every photo + every listing_videos row (walkthrough + agent
 * uploads) for a single listing, plus a button to regenerate the Ken
 * Burns walkthrough. Admin-scoped — bypasses agent ownership.
 *
 * Phase 104 (2026-07-17).
 */

import { thumbnailUrl } from '@/lib/cloudflare/stream';
import { createServiceClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
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
      .select('id, storage_path, sort_order, width, height')
      .eq('listing_id', id)
      .order('sort_order', { ascending: true }) as unknown as Promise<{
      data: Array<{
        id: string;
        storage_path: string;
        sort_order: number;
        width: number | null;
        height: number | null;
      }> | null;
    }>,
    supabase
      .from('listing_videos')
      .select('id, cf_video_id, external_url, kind, status, title, sort_order, created_at')
      .eq('listing_id', id)
      .order('sort_order', { ascending: true }) as unknown as Promise<{
      data: Array<{
        id: string;
        cf_video_id: string | null;
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
      <div>
        <Link
          href="/admin/pipeline/tour-jobs"
          className="text-sm text-blue-500 hover:underline"
        >
          ← All listings
        </Link>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{listing.address}</h1>
          <p className="text-ink2 mt-1 text-sm">
            {listing.city}, {listing.state}
            {listing.zip ? ` ${listing.zip}` : ''} · {listing.status} ·{' '}
            {listing.agents?.name ?? 'unassigned'}
          </p>
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
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {videos.map((v) => {
              const cfThumb = v.cf_video_id
                ? (() => {
                    try {
                      return thumbnailUrl(v.cf_video_id);
                    } catch {
                      return null;
                    }
                  })()
                : null;
              return (
                <li
                  key={v.id}
                  className="overflow-hidden rounded-xl border border-line bg-surface"
                >
                  <div className="aspect-[9/16] w-full bg-black/40">
                    {cfThumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cfThumb}
                        alt={v.title ?? 'tour video'}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-ink2">
                        {v.status}
                      </div>
                    )}
                  </div>
                  <div className="p-2 text-xs">
                    <div className="font-medium">{v.title ?? v.kind}</div>
                    <div className="text-ink2">
                      {v.kind} ·{' '}
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
                    </div>
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
              <li
                key={p.id}
                className="overflow-hidden rounded-xl border border-line bg-surface"
              >
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
    </div>
  );
}
