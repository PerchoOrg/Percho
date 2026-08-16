'use client';

/**
 * CommunityTourSection — page-level assembly for the Community Tour admin
 * (owner 2026-08-16: page order = video → 8 steps → big photo table →
 * collapsible extras).
 *
 * Holds the photo selection here so the Generate AI Video panel (top) and the
 * big PhotoTable (below the 8-step pipeline) share one selection set.
 * Everything else on the page (POI review, etc.) is rendered by the parent
 * inside <details>, below this section.
 */

import { useCallback, useState } from 'react';
import { AiVideoSection } from './AiVideoSection';
import type { PhotoRow } from './PhotoTable';
import { PhotoTable } from './PhotoTable';
import { TourPipeline } from './TourPipeline';

export function CommunityTourSection({
  communityId,
  communityName,
  city,
  state,
  storageBase,
  bucket,
  photos,
}: {
  communityId: string;
  communityName: string;
  city: string | null;
  state: string | null;
  storageBase: string;
  bucket: string;
  photos: PhotoRow[];
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleMany = useCallback((ids: string[], select: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (select) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  return (
    <div className="space-y-4">
      {/* 1 · Generated community tour AI video from the selected clips */}
      <AiVideoSection
        communityId={communityId}
        communityName={communityName}
        city={city}
        state={state}
        storageBase={storageBase}
        bucket={bucket}
        photos={photos}
        selected={selected}
        onClearSelection={() => setSelected(new Set())}
      />

      {/* 2 · The 8 pipeline steps, each with its own run button */}
      <TourPipeline
        communityId={communityId}
        communityName={communityName}
        city={city}
        state={state}
        storageBase={storageBase}
      />

      {/* 3 · Big table: every photo with all info + clip status */}
      <PhotoTable
        table="poi_photos"
        storageBase={storageBase}
        bucket={bucket}
        photos={photos}
        selection={{ selected, onToggle: toggle, onToggleMany: toggleMany }}
      />
    </div>
  );
}
