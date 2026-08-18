/**
 * The shot list: what the `photos` step plans and the `assemble` step renders.
 *
 * Lives apart from either step because both need it — photos computes and
 * persists it, assemble reads it back.
 */
import type { TourPlanPhoto } from '@/lib/poi/tour-orchestrator/plan';
import type { PhotoAnnotation } from '@/lib/poi/tour-orchestrator/types';
import { type RunRow, type TourDb, mustWrite } from './shared';

/** One planned clip as the photos step persisted it. */
export interface PlannedShot {
  photo_id: string;
  poi_id: string;
  poi_name: string;
  engine: string;
  move: string | null;
  duration_s: number;
  prompt: string | null;
  ai_generated: boolean;
}

/** The shot list the photos step planned, or [] if it has not run. */
export function plannedShots(run: RunRow): PlannedShot[] {
  const photos = run.step_results.photos as { shots?: PlannedShot[] } | undefined;
  return Array.isArray(photos?.shots) ? photos.shots : [];
}

/** Shared: build the final shot list for a set of POIs. Photos step computes
 *  and persists this; assemble consumes it. Per-POI cap 2 (owner 2026-08-17). */
export async function computeFinalShots(
  sb: TourDb,
  poiIds: string[],
  buckets?: Map<string, string>,
): Promise<{ shots: unknown[]; dropped: unknown[]; plan: unknown }> {
  const { data: photosRaw } = (await sb
    .from('poi_photos')
    .select(
      'id, poi_id, status, ai_tags, ai_score, storage_path, enhanced_path, enhanced_status, created_at, width_px, height_px, curator_tags, curator_version',
    )
    .in('poi_id', poiIds)
    .order('created_at', { ascending: false, nullsFirst: false })) as {
    data: Array<{
      id: string;
      poi_id: string;
      status: string | null;
      ai_tags: Record<string, unknown> | null;
      ai_score: number | null;
      storage_path: string | null;
      enhanced_path: string | null;
      enhanced_status: string | null;
      created_at: string | null;
      width_px: number | null;
      height_px: number | null;
      curator_tags: Record<string, unknown> | null;
      curator_version: number | null;
    }> | null;
  };

  // Owner 2026-08-17: "同一个poi最多2张照片" + "从取到的3张里选取两张质量好的
  // 更适合的" — per POI pick the 2 BEST by quality, not newest-first. Quality =
  // usable (tagger verdict) first, then ai_score desc, then newest as tiebreak.
  const POI_PHOTO_CAP = 2;
  const photos: NonNullable<typeof photosRaw> = [];
  const dropped: Array<{ photo_id: string; poi_id: string; reason: string }> = [];

  // Resolution gate, BEFORE the per-POI cap so a POI with a sharper alternate
  // uses it instead of spending its slot on a soft frame. Owner 2026-08-17, on
  // a 680x497 storefront that needed 4.25x to fill a 1080x1920 frame: the
  // duration rule shortens a soft clip, it cannot rescue one.
  const { upscaleFactor, isTooLowRes } = await import('@/lib/poi/tour-orchestrator/scheduler');
  const byPoi = new Map<string, NonNullable<typeof photosRaw>>();
  for (const p of photosRaw ?? []) {
    if (p.width_px && p.height_px && isTooLowRes(p.width_px, p.height_px)) {
      dropped.push({
        photo_id: p.id,
        poi_id: p.poi_id,
        reason: `too low resolution — ${p.width_px}x${p.height_px} needs ${upscaleFactor(p.width_px, p.height_px).toFixed(1)}x upscale for 1080x1920`,
      });
      continue;
    }
    const arr = byPoi.get(p.poi_id) ?? [];
    arr.push(p);
    byPoi.set(p.poi_id, arr);
  }
  for (const arr of byPoi.values()) {
    const ranked = [...arr].sort((a, b) => {
      const aTags = (a.ai_tags ?? {}) as { usable?: boolean };
      const bTags = (b.ai_tags ?? {}) as { usable?: boolean };
      // User-rejected photos rank last (they still appear in dropped).
      const aRej = a.status === 'rejected' ? 0 : 1;
      const bRej = b.status === 'rejected' ? 0 : 1;
      if (aRej !== bRej) return bRej - aRej;
      const aUsable = aTags.usable === false ? 0 : 1;
      const bUsable = bTags.usable === false ? 0 : 1;
      if (aUsable !== bUsable) return bUsable - aUsable;
      const score = (b.ai_score ?? 0) - (a.ai_score ?? 0);
      if (score !== 0) return score;
      return (b.created_at ?? '').localeCompare(a.created_at ?? '');
    });
    const kept = ranked.slice(0, POI_PHOTO_CAP);
    const keptIds = new Set(kept.map((r) => r.id));
    photos.push(...kept);
    // Owner 2026-08-17: "另外一张放到drop table里并说明原因" — every photo
    // beyond the 2/POI cap lands in dropped with the reason it lost.
    for (const row of ranked.slice(POI_PHOTO_CAP)) {
      if (keptIds.has(row.id)) continue;
      const tags = (row.ai_tags ?? {}) as { usable?: boolean };
      const reason =
        row.status === 'rejected'
          ? 'rejected in Review'
          : tags.usable === false
            ? 'tagger-unusable'
            : 'not in top 2 by quality score';
      dropped.push({ photo_id: row.id, poi_id: row.poi_id, reason });
    }
  }

  const { data: poiRows } = (await sb
    .from('pois')
    .select('id, display_name, primary_type')
    .in('id', poiIds)) as {
    data: Array<{ id: string; display_name: string | null; primary_type: string | null }> | null;
  };
  const poiName = new Map((poiRows ?? []).map((p) => [p.id, p.display_name ?? '']));
  const { PLACES_TYPE_TO_BUCKET } = await import('@/lib/poi/google-places');
  const poiBucket = new Map(
    (poiRows ?? []).map((p) => [
      p.id,
      // The resolve step's bucket is the accurate one; primary_type is the
      // fallback for POIs the agent upserted with nothing but a place_id.
      buckets?.get(p.id) ??
        (p.primary_type ? (PLACES_TYPE_TO_BUCKET[p.primary_type] ?? 'other') : 'other'),
    ]),
  );

  // Photos the tagger or the reviewer already rejected never reach the Curator
  // — no point paying to annotate a frame that cannot be used.
  const usable: typeof photos = [];
  for (const p of photos ?? []) {
    const tags = (p.ai_tags ?? {}) as { usable?: boolean };
    const rejectedByUser = p.status === 'rejected';
    const rejectedByTagger = tags.usable === false;
    if (rejectedByUser || rejectedByTagger) {
      dropped.push({
        photo_id: p.id,
        poi_id: p.poi_id,
        reason: rejectedByUser ? 'rejected in Review' : 'tagger-unusable',
      });
      continue;
    }
    usable.push(p);
  }

  // Orchestration layer (2026-08-17): the engine/move/order/duration used to be
  // a category lookup here. It is now Curator → Scheduler → Guard → VO Pass,
  // which is the only place those decisions live. See
  // lib/poi/tour-orchestrator/. The ORIGINAL file is sent for annotation, not
  // the enhanced one: enhancement changes the light, and time_of_day is judged
  // from the light.
  const { buildTourPlan } = await import('@/lib/poi/tour-orchestrator/plan');
  const { CURATOR_VERSION } = await import('@/lib/poi/tour-orchestrator/curator');
  const { annotationSchema } = await import('@/lib/poi/tour-orchestrator/types');
  const planPhotos: TourPlanPhoto[] = [];
  // photo_id → annotation already stored at the current CURATOR_VERSION.
  const cached = new Map<string, PhotoAnnotation>();
  for (const p of usable) {
    const widthPx = p.width_px ?? 0;
    const heightPx = p.height_px ?? 0;
    if (!p.storage_path || widthPx <= 0 || heightPx <= 0) {
      dropped.push({
        photo_id: p.id,
        poi_id: p.poi_id,
        reason: 'no stored file or no pixel dimensions',
      });
      continue;
    }
    // A photo whose annotation is already cached at the current version never
    // has to be downloaded, let alone uploaded to the model.
    const cachedAnnotation =
      p.curator_version === CURATOR_VERSION && p.curator_tags
        ? annotationSchema.safeParse(p.curator_tags)
        : null;
    let bytes = new Uint8Array();
    if (!cachedAnnotation?.success) {
      const { data: blob, error: dlErr } = await sb.storage
        .from('listing-photos')
        .download(p.storage_path);
      if (dlErr || !blob) {
        dropped.push({ photo_id: p.id, poi_id: p.poi_id, reason: 'storage download failed' });
        continue;
      }
      bytes = new Uint8Array(await blob.arrayBuffer());
    } else {
      cached.set(p.id, cachedAnnotation.data);
    }
    const tags = (p.ai_tags ?? {}) as { description?: string };
    planPhotos.push({
      photo_id: p.id,
      poi_id: p.poi_id,
      poi_name: poiName.get(p.poi_id) ?? '',
      bucket: poiBucket.get(p.poi_id) ?? 'other',
      width_px: widthPx,
      height_px: heightPx,
      description: tags.description ?? '',
      bytes,
      mime_type: 'image/jpeg',
    });
  }

  if (planPhotos.length === 0) return { shots: [], dropped, plan: null };

  const plan = await buildTourPlan(planPhotos, cached);

  // Persist what was freshly annotated, so the next run of this step reuses it
  // instead of paying again (owner 2026-08-17: "every time rerun would make llm
  // call that is expensive").
  for (const a of plan.curator.fresh) {
    // Losing this silently means paying the Curator again on every future run.
    await mustWrite(
      `cache curator_tags(${a.photo_id})`,
      sb
        .from('poi_photos')
        .update({
          curator_tags: a,
          curator_version: CURATOR_VERSION,
          curated_at: new Date().toISOString(),
        })
        .eq('id', a.photo_id),
    );
  }
  for (const id of plan.curator.missing) {
    const photo = planPhotos.find((p) => p.photo_id === id);
    dropped.push({
      photo_id: id,
      poi_id: photo?.poi_id ?? '',
      reason: 'curator returned no annotation',
    });
  }
  for (const ex of plan.excluded) {
    const photo = planPhotos.find((p) => p.photo_id === ex.photo_id);
    dropped.push({ photo_id: ex.photo_id, poi_id: photo?.poi_id ?? '', reason: ex.reason });
  }

  return {
    shots: plan.shots,
    dropped,
    // Everything review needs to judge the plan, persisted next to it.
    plan: {
      warnings: plan.warnings,
      violations: plan.violations,
      narration: plan.narration,
      curator: plan.curator,
      vo: plan.vo,
    },
  };
}
