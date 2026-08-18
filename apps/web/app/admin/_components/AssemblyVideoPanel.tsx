'use client';

import { streamIframeUrl } from '@/lib/cloudflare/stream';
/**
 * AssemblyVideoPanel — the community's final tour video (ffmpeg concat of the
 * Selected Photos clips, built by the Assemble step) shown at the TOP of the
 * Community Tour admin page.
 *
 * Owner 2026-08-17: "assembly的结果放到顶部 然后作为这个community 的视频
 * 应该挂载到ios上测试". This replaced the old "Generate AI Video" panel
 * (AiVideoSection) — the per-photo Seedance generation moved into the
 * PhotoTable's per-row Generate buttons; assemble is now the only "video
 * for this community" concept.
 *
 * Shows the latest ready assembly; pending/processing rows show status.
 */
import { useEffect, useState } from 'react';

interface AssemblyRow {
  id: string;
  status: string;
  cf_stream_uid: string | null;
  video_url: string | null;
  error: string | null;
  created_at: string;
}

const POLL_MS = 10_000;

export function AssemblyVideoPanel({ communityId }: { communityId: string }) {
  const [rows, setRows] = useState<AssemblyRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/admin/community-tour/${communityId}/assemblies`);
        if (!res.ok) return;
        const body = (await res.json()) as { assemblies: AssemblyRow[] };
        if (!cancelled) setRows(body.assemblies);
      } catch {
        /* transient — next poll retries */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    const t = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [communityId]);

  const latest = rows[0];
  if (!latest && !loading) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-4">
        <div className="text-sm font-semibold text-ink">Community Video</div>
        <div className="mt-1 text-xs text-ink2">
          No assembled video yet — run the pipeline steps and Assemble.
        </div>
      </div>
    );
  }

  const ready = latest?.status === 'ready';
  const iframeUrl = latest?.cf_stream_uid ? streamIframeUrl(latest.cf_stream_uid) : null;

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-ink">Community Video</div>
        {latest && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              ready ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
            }`}
          >
            {latest.status}
          </span>
        )}
      </div>
      {ready && iframeUrl ? (
        <div className="mt-3 flex justify-center overflow-hidden rounded-xl bg-black">
          <iframe
            title="Assembled tour video"
            src={iframeUrl}
            className="aspect-[9/16] h-[420px]"
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : latest ? (
        <div className="mt-2 text-xs text-ink2">
          {latest.status === 'pending' || latest.status === 'processing'
            ? 'Assembly is building… (see Video Jobs for the worker log)'
            : (latest.error ?? latest.status)}
        </div>
      ) : null}
    </div>
  );
}
