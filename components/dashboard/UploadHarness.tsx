'use client';

import { type UploadedVideo, VideoUploader } from '@/components/dashboard/VideoUploader';
import { createClient as createBrowserClient } from '@/lib/supabase/client';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * UploadHarness — Client Component that owns the video list state for the
 * /dashboard/upload-test page.
 *
 * Layered freshness strategy (most reliable wins):
 *   1. Optimistic insert: when the uploader signals success, we add a
 *      'processing' row immediately. Solves "no row appears after upload".
 *   2. Polling: while any row is in 'processing', GET /api/video/list every
 *      5s and merge results. Solves "status never flips to ready". This is
 *      the reliability guarantee — works regardless of Realtime.
 *   3. Realtime (bonus): subscribe to listing_videos changes. If it works,
 *      transitions are instant; if it doesn't, polling backstops within 5s.
 */

export interface VideoRow {
  id: string;
  cf_video_id: string;
  kind: string;
  title: string | null;
  status: string;
  created_at: string;
}

interface Props {
  listingId: string;
  initialVideos: VideoRow[];
}

const POLL_INTERVAL_MS = 5000;
// Polling fallback — kept as code path but disabled now that Realtime is verified
// working in production (replica identity full + JWT setAuth landed in 0ce24b3).
// Flip back to true if Realtime regresses (e.g. publication / RLS schema change).
const POLLING_ENABLED = false;

export function UploadHarness({ listingId, initialVideos }: Props) {
  const [videos, setVideos] = useState<VideoRow[]>(initialVideos);
  const videosRef = useRef(videos);
  videosRef.current = videos;

  // Merge a list of fresh rows into current state, keyed by id.
  // New rows go to top, existing rows update in place, removed rows drop.
  const mergeRows = useCallback((fresh: VideoRow[]) => {
    setVideos((prev) => {
      const byId = new Map(prev.map((r) => [r.id, r]));
      for (const r of fresh) byId.set(r.id, r);
      // Drop rows the server no longer reports (deleted)
      const freshIds = new Set(fresh.map((r) => r.id));
      // Keep optimistic rows that the server hasn't seen yet (race window)
      const merged: VideoRow[] = [];
      for (const r of byId.values()) {
        if (freshIds.has(r.id) || !prev.find((p) => p.id === r.id)) {
          merged.push(r);
        } else if (
          // Optimistic row not yet on server — keep if recently added
          Date.now() - new Date(r.created_at).getTime() <
          30_000
        ) {
          merged.push(r);
        }
      }
      merged.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      return merged;
    });
  }, []);

  // --- Polling (fallback, gated by POLLING_ENABLED) ---
  useEffect(() => {
    if (!POLLING_ENABLED) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      const hasProcessing = videosRef.current.some((v) => v.status === 'processing');
      if (!hasProcessing) {
        timer = setTimeout(poll, POLL_INTERVAL_MS);
        return;
      }
      try {
        const res = await fetch(`/api/video/list?listing_id=${listingId}`, {
          cache: 'no-store',
        });
        if (res.ok) {
          const json = (await res.json()) as { videos: VideoRow[] };
          if (!cancelled) mergeRows(json.videos);
        }
      } catch {
        // network blip — try again next tick
      }
      if (!cancelled) timer = setTimeout(poll, POLL_INTERVAL_MS);
    }

    timer = setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [listingId, mergeRows]);

  // --- Realtime (best-effort bonus) ---
  const [rtStatus, setRtStatus] = useState<string>('init');
  useEffect(() => {
    const supabase = createBrowserClient();
    let cancelled = false;

    (async () => {
      // Explicitly forward user JWT to Realtime so RLS evaluates correctly.
      // Without this, the channel connects as anon and RLS blocks all rows.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      console.log('[Realtime] session present:', !!session, 'user:', session?.user?.id);
      if (session) supabase.realtime.setAuth(session.access_token);
      if (cancelled) return;

      const channel = supabase
        .channel(`listing_videos:${listingId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'listing_videos',
            filter: `listing_id=eq.${listingId}`,
          },
          (payload) => {
            console.log('[Realtime] payload:', payload.eventType, payload);
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              const row = payload.new as VideoRow;
              mergeRows([row]);
            } else if (payload.eventType === 'DELETE') {
              const old = payload.old as { id: string };
              setVideos((prev) => prev.filter((v) => v.id !== old.id));
            }
          },
        )
        .subscribe((status, err) => {
          console.log('[Realtime] channel status:', status, err ?? '');
          setRtStatus(status);
        });

      return () => {
        void supabase.removeChannel(channel);
      };
    })();

    return () => {
      cancelled = true;
    };
  }, [listingId, mergeRows]);

  const handleUploaded = useCallback((v: UploadedVideo) => {
    const optimistic: VideoRow = {
      id: v.rowId,
      cf_video_id: v.videoId,
      kind: v.kind,
      title: v.title,
      status: 'processing',
      created_at: new Date().toISOString(),
    };
    setVideos((prev) => {
      if (prev.some((p) => p.id === optimistic.id)) return prev;
      return [optimistic, ...prev];
    });
  }, []);

  return (
    <>
      <div className="text-xs" style={{ color: 'var(--muted)' }}>
        Realtime: <span style={{ color: 'var(--brand)' }}>{rtStatus}</span>
        {POLLING_ENABLED ? ' · polling 5s' : ' · polling off'}
      </div>
      <VideoUploader target={{ scope: 'listing', listingId }} onUploaded={handleUploaded} />
      <VideosTable videos={videos} />
    </>
  );
}

function VideosTable({ videos }: { videos: VideoRow[] }) {
  if (videos.length === 0) {
    return (
      <div
        className="rounded-2xl border p-6 text-center text-sm"
        style={{
          background: 'var(--card)',
          borderColor: 'var(--border)',
          color: 'var(--muted)',
        }}
      >
        No videos yet. Upload one above to test the pipeline.
      </div>
    );
  }
  return (
    <div
      className="overflow-hidden rounded-2xl border"
      style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
    >
      <table className="w-full text-sm">
        <thead>
          <tr style={{ color: 'var(--muted)' }}>
            <th className="px-4 py-3 text-left font-medium">Title</th>
            <th className="px-4 py-3 text-left font-medium">Kind</th>
            <th className="px-4 py-3 text-left font-medium">Status</th>
            <th className="px-4 py-3 text-left font-medium">Created</th>
          </tr>
        </thead>
        <tbody>
          {videos.map((v) => (
            <tr key={v.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
              <td className="px-4 py-3 truncate max-w-xs">{v.title ?? '—'}</td>
              <td className="px-4 py-3">{v.kind}</td>
              <td className="px-4 py-3">
                <StatusPill status={v.status} />
              </td>
              <td className="px-4 py-3" style={{ color: 'var(--muted)' }}>
                {new Date(v.created_at).toLocaleTimeString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, { bg: string; fg: string }> = {
    processing: { bg: 'rgba(201, 162, 39, 0.15)', fg: 'var(--brand)' },
    ready: { bg: 'rgba(34, 197, 94, 0.15)', fg: '#22c55e' },
    error: { bg: 'rgba(248, 113, 113, 0.15)', fg: '#f87171' },
  };
  const s = styles[status] ?? { bg: 'var(--border)', fg: 'var(--muted)' };
  return (
    <span
      className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ background: s.bg, color: s.fg }}
    >
      {status}
    </span>
  );
}
