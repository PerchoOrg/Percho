'use client';

/**
 * CommunityTourSection — page-level assembly for the Community Tour admin
 * (owner 2026-08-16: page order = video → 8 steps → big photo table →
 * collapsible extras).
 *
 * The top panel is the community's final assembled video (AssemblyVideoPanel —
 * replaced the old Generate AI Video panel; per-photo Seedance generation now
 * lives in the PhotoTable row Generate buttons). Also fetches per-photo clip
 * status (+ agent-recommended flag) from the clips route and merges it into
 * the table rows, so the table shows clip state and a per-row Generate button.
 */

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AssemblyVideoPanel } from './AssemblyVideoPanel';
import type { PhotoRow } from './PhotoTable';
import { PhotoTable } from './PhotoTable';
import { TourPipeline } from './TourPipeline';

interface ClipRow {
  photo_id: string;
  poi_id: string;
  photo_url: string;
  ai_tags: unknown;
  recommended: boolean;
  clip: {
    engine: string;
    duration_s: number | null;
    status: string;
    video_url: string | null;
    cost_usd: number | null;
    error: string | null;
  } | null;
  dakb_clip: {
    engine: string;
    duration_s: number | null;
    status: string;
    video_url: string | null;
    cost_usd: number | null;
    error: string | null;
  } | null;
}

export function CommunityTourSection({
  communityId,
  communityName,
  city,
  state,
  lat,
  lng,
  storageBase,
  bucket,
  photos,
}: {
  communityId: string;
  communityName: string;
  city: string | null;
  state: string | null;
  lat: number | null;
  lng: number | null;
  storageBase: string;
  bucket: string;
  photos: PhotoRow[];
}) {
  const [clipRows, setClipRows] = useState<ClipRow[]>([]);
  const inFlight = useRef(false);
  const _router = useRouter();

  const loadClips = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch(`/api/admin/community-tour/${communityId}/clips`);
      if (!res.ok) return;
      const body = (await res.json()) as { clips: ClipRow[] };
      setClipRows(body.clips);
    } catch {
      /* transient — next tick retries */
    } finally {
      inFlight.current = false;
    }
  }, [communityId]);

  useEffect(() => {
    void loadClips();
  }, [loadClips]);

  // Merge clip status into photo rows (keyed by photo id).
  const clipById = new Map(clipRows.map((c) => [c.photo_id, c]));
  const enriched = photos.map((p) => {
    const c = clipById.get(p.id);
    if (!c) return p;
    return { ...p, recommended: c.recommended, clip: c.clip, dakb_clip: c.dakb_clip };
  });

  async function generateClip(
    photoId: string,
    engine?: string,
  ): Promise<{ ok: boolean; message?: string }> {
    // Reuse the latest run (or create one) and run the generate step for one
    // photo. The step route creates a photo_clips row (engine/duration from
    // the shot list); the seedance worker picks it up.
    const runsRes = await fetch(`/api/admin/community-tour/${communityId}/runs`);
    if (!runsRes.ok) return { ok: false, message: 'Could not load runs' };
    const runsBody = (await runsRes.json()) as {
      runs: Array<{ id: string; step_results: Record<string, unknown> }>;
    };
    let runId = runsBody.runs[0]?.id;
    if (!runId) {
      const createRes = await fetch(`/api/admin/community-tour/${communityId}/runs`, {
        method: 'POST',
      });
      if (!createRes.ok) return { ok: false, message: 'Could not create run' };
      const createBody = (await createRes.json()) as { run: { id: string } };
      runId = createBody.run.id;
    }
    const res = await fetch(`/api/admin/community-tour/${communityId}/runs/${runId}/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: 'generate', photoIds: [photoId], engine }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      return { ok: false, message: body.message ?? body.error ?? `HTTP ${res.status}` };
    }
    await loadClips();
    return { ok: true };
  }

  return (
    <div className="space-y-4">
      {/* 1 · The community's final assembled video (owner 2026-08-17:
          assembly results at the top — the community's video). */}
      <AssemblyVideoPanel communityId={communityId} />

      {/* 2 · The 8 pipeline steps, each with its own run button */}
      <TourPipeline
        communityId={communityId}
        communityName={communityName}
        city={city}
        state={state}
        lat={lat}
        lng={lng}
        storageBase={storageBase}
        bucket={bucket}
        photos={photos}
      />

      {/* 3 · Big table: every photo with all info + clip status + generate.
           Collapsible — too long to keep open (owner 2026-08-17). */}
      <details className="rounded-2xl border border-line bg-surface">
        <summary className="cursor-pointer p-4 text-sm font-semibold text-ink">
          All Fetched Photos ({enriched.length})
        </summary>
        <div className="px-4 pb-4">
          <PhotoTable
            table="poi_photos"
            storageBase={storageBase}
            bucket={bucket}
            photos={enriched}
            onGenerateClip={generateClip}
          />
        </div>
      </details>
    </div>
  );
}
