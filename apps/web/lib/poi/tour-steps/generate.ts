/**
 * `generate` and `regenerate-all` steps — enqueue photo->clip jobs in
 * `photo_clips`; the Seedance / Ken Burns workers pick them up.
 */
import { type RunRow, type TourDb, mustWrite, saveStep, setRunStatus } from './shared';
import { type PlannedShot, plannedShots } from './shots';

export async function runGenerate(sb: TourDb, run: RunRow, photoIds?: string[], engine?: string) {
  const resolve = run.step_results.resolve as
    | { resolved?: Array<{ place_id: string; bucket: string; name: string }> }
    | undefined;

  // Single-photo generate (row button): build the shot directly from the
  // requested photo_id — it may belong to a POI that was never resolved in
  // this run (the fetch-photo panel shows ALL community POIs, resolve only
  // covers the ~13 recommended). Falling through to the resolve-only path
  // silently did nothing for those photos (owner 2026-08-17: click no-op).
  if (photoIds && photoIds.length > 0) {
    // Each column's button names its own engine: the Clip column means "make a
    // Seedance clip", the DA+KB column means the local one. Without that the
    // Seedance column would silently enqueue Ken Burns for any photo the plan
    // assigned locally, which is not what the column says.
    const forceEngine =
      engine === 'depthflow' || engine === 'kenburns' || engine === 'seedance' ? engine : null;
    const planned = plannedShots(run);
    const plannedById = new Map(planned.map((s) => [s.photo_id, s]));

    // A photo the plan covers renders exactly as planned. A photo outside the
    // plan can still be generated (the fetch-photo panel lists every community
    // POI, the plan only covers the resolved ones) — but with no annotation
    // there is no Seedance prompt, so it falls back to the worker's own
    // conservative default.
    const { data: photos } = await sb
      .from('poi_photos')
      .select('id, poi_id, ai_tags, poi:pois!inner(display_name)')
      .in('id', photoIds);
    const selected = (photos ?? [])
      .filter((p) => ((p.ai_tags ?? {}) as { usable?: boolean }).usable !== false)
      .map((p): PlannedShot => {
        const shot = plannedById.get(p.id);
        if (shot) {
          if (!forceEngine || forceEngine === shot.engine) return shot;
          // Off-plan override: the plan's move and prompt belong to the engine
          // it chose, so neither survives the switch. A forced Seedance clip
          // therefore has no Guard-built prompt and gets the worker's
          // conservative default.
          return {
            ...shot,
            engine: forceEngine,
            move: null,
            prompt: null,
            ai_generated: forceEngine === 'seedance',
          };
        }
        return {
          photo_id: p.id,
          poi_id: p.poi_id,
          poi_name: p.poi?.display_name ?? '',
          engine: forceEngine ?? 'seedance',
          move: null,
          duration_s: forceEngine && forceEngine !== 'seedance' ? 3.0 : 4.0,
          prompt: null,
          ai_generated: (forceEngine ?? 'seedance') === 'seedance',
        };
      });
    // Per-row click: re-render even a clip that is already ready.
    return enqueueClips(sb, run, selected, forceEngine, true);
  }

  if (!resolve?.resolved?.length)
    return { error: 'no_resolved', message: 'Run the resolve step first.' };

  // The plan is the shot list (orchestration layer, 2026-08-17). Generate no
  // longer re-derives engines from categories — it enqueues what the photos
  // step planned, so what renders is what review approved.
  const planned = plannedShots(run);
  if (planned.length === 0) {
    return {
      error: 'no_plan',
      message: 'No planned shots — run the photos step first (it builds the shot list).',
    };
  }
  // Deliberately narrower than the per-row path: a bulk override to seedance
  // would bill a generation for every photo in the run.
  const forceEngine = engine === 'depthflow' || engine === 'kenburns' ? engine : null;
  const shotsWithEngine = forceEngine
    ? planned.map((s) => ({
        ...s,
        engine: forceEngine,
        prompt: null,
        ai_generated: false,
        move: null,
      }))
    : planned;

  // Enqueue missing photo_clips — but a FAILED row is dead (expired TTL,
  // provider rejection); reset it to pending so the worker picks it up again
  // instead of silently skipping (owner 2026-08-17: generate after expired
  // showed no status change because the failed row blocked a re-create).
  // Keyed by (photo_id, engine): a photo can have both a seedance and a
  // depthflow/kenburns clip.
  return enqueueClips(sb, run, shotsWithEngine, forceEngine);
}

async function enqueueClips(
  sb: TourDb,
  run: RunRow,
  shotsWithEngine: Array<{
    photo_id: string;
    engine: string;
    duration_s: number;
    move?: string | null;
    prompt?: string | null;
    ai_generated?: boolean;
  }>,
  forceEngine?: string | null,
  /**
   * A per-row click means "render this again", so a clip that is already
   * ready has to go back to pending — otherwise the button updates the row's
   * prompt and nothing ever re-renders (owner 2026-08-17, on the Regenerate
   * button). Bulk enqueues leave ready clips alone: re-rendering a whole tour
   * on every Generate would burn Seedance spend nobody asked for.
   */
  requeueReady = false,
) {
  const existing = await sb
    .from('photo_clips')
    .select('photo_id, engine, status')
    .in(
      'photo_id',
      shotsWithEngine.map((s) => s.photo_id),
    );
  const have = new Map(
    (existing.data ?? []).map((r: { photo_id: string; engine: string; status: string }) => [
      `${r.photo_id}:${r.engine}`,
      r.status,
    ]),
  );
  const toCreate = shotsWithEngine.filter((s) => !have.has(`${s.photo_id}:${s.engine}`));
  if (toCreate.length > 0) {
    await mustWrite(
      `enqueue ${toCreate.length} clip(s)`,
      sb.from('photo_clips').insert(
        toCreate.map((s) => ({
          photo_id: s.photo_id,
          engine: s.engine,
          duration_s: s.duration_s,
          // The plan's decisions travel with the row: the render worker takes
          // the move and the seedance worker takes the prompt instead of each
          // improvising one (migration 20260817210000).
          move: s.move ?? null,
          prompt: s.prompt ?? null,
          ai_generated: s.ai_generated ?? false,
          status: 'pending',
        })),
      ),
    );
  }
  // Rows that already exist keep their id but must follow the current plan —
  // a re-plan that changed the move or the prompt has to reach the worker.
  let requeued = 0;
  for (const s of shotsWithEngine) {
    const status = have.get(`${s.photo_id}:${s.engine}`);
    if (status === undefined) continue;
    if (status === 'processing') continue;
    const rerender = requeueReady && status === 'ready';
    if (rerender) requeued += 1;
    await mustWrite(
      `apply plan to clip(${s.photo_id}:${s.engine})`,
      sb
        .from('photo_clips')
        .update({
          duration_s: s.duration_s,
          move: s.move ?? null,
          prompt: s.prompt ?? null,
          ai_generated: s.ai_generated ?? false,
          ...(rerender ? { status: 'pending', error: null } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('photo_id', s.photo_id)
        .eq('engine', s.engine),
    );
  }
  // Failed rows: reset to pending (re-generate). Leave ready/processing alone.
  const failedIds = shotsWithEngine
    .map((s) => s.photo_id)
    .filter((id) => have.get(`${id}:${forceEngine ?? 'seedance'}`) === 'failed');
  if (failedIds.length > 0) {
    await mustWrite(
      `requeue ${failedIds.length} failed clip(s)`,
      sb
        .from('photo_clips')
        .update({ status: 'pending', error: null, updated_at: new Date().toISOString() })
        .in('photo_id', failedIds)
        .eq('engine', forceEngine ?? 'seedance'),
    );
  }

  await saveStep(sb, run, 'generate', {
    shots: shotsWithEngine,
    created: toCreate.length,
    requeued,
    reused: shotsWithEngine.length - toCreate.length - requeued,
  });
  await setRunStatus(sb, run.id, 'generating');
  return { shots: shotsWithEngine.length, created: toCreate.length, requeued };
}

// ─── step: regenerate-all — "Generate all clips" (owner 2026-08-17) ───────
// Drives entirely off the plan, and covers every engine in it. The plan
// already encodes the selection (2 per POI, watermark and resolution drops),
// so there is nothing to re-derive here.
//
// The two halves are treated differently on purpose, because one costs money:
//   depthflow / kenburns — re-rendered whether or not a clip is ready. Local
//     render time is free, and this is the button that redoes the whole tour
//     after a plan or renderer change.
//   seedance — created when missing, requeued when failed, and LEFT ALONE when
//     ready. Each generation bills ~$0.05, so a second click must not re-bill
//     four clips. The per-row Regenerate is the deliberate way to redo one.

export async function runRegenerateAll(sb: TourDb, run: RunRow) {
  const planned = plannedShots(run);
  if (planned.length === 0) {
    return {
      error: 'no_plan',
      message: 'No planned shots — run the photos step first (it builds the shot list).',
    };
  }

  const { data: existingRows } = await sb
    .from('photo_clips')
    .select('photo_id, engine, status')
    .in(
      'photo_id',
      planned.map((s) => s.photo_id),
    );
  const statusOf = new Map<string, string>(
    (existingRows ?? []).map((r: { photo_id: string; engine: string; status: string }) => [
      `${r.photo_id}:${r.engine}`,
      r.status,
    ]),
  );

  const toCreate: PlannedShot[] = [];
  const toRerender: PlannedShot[] = [];
  let paidSkipped = 0;

  for (const shot of planned) {
    const status = statusOf.get(`${shot.photo_id}:${shot.engine}`);
    if (status === undefined) {
      toCreate.push(shot);
      continue;
    }
    if (status === 'processing') continue; // in flight, leave it
    if (shot.engine === 'seedance' && status === 'ready') {
      paidSkipped += 1; // already generated and paid for
      continue;
    }
    toRerender.push(shot);
  }

  if (toCreate.length > 0) {
    await mustWrite(
      `enqueue ${toCreate.length} clip(s)`,
      sb.from('photo_clips').insert(
        toCreate.map((s) => ({
          photo_id: s.photo_id,
          engine: s.engine,
          duration_s: s.duration_s,
          move: s.move ?? null,
          prompt: s.prompt ?? null,
          ai_generated: s.ai_generated ?? false,
          status: 'pending',
        })),
      ),
    );
  }

  for (const s of toRerender) {
    await mustWrite(
      `re-render clip(${s.photo_id}:${s.engine})`,
      sb
        .from('photo_clips')
        .update({
          status: 'pending',
          error: null,
          duration_s: s.duration_s,
          move: s.move ?? null,
          prompt: s.prompt ?? null,
          ai_generated: s.ai_generated ?? false,
          updated_at: new Date().toISOString(),
        })
        .eq('photo_id', s.photo_id)
        .eq('engine', s.engine),
    );
  }

  const paidCreated = toCreate.filter((s) => s.engine === 'seedance').length;
  const result = {
    planned: planned.length,
    created: toCreate.length,
    rerendered: toRerender.length,
    paid_created: paidCreated,
    paid_skipped: paidSkipped,
  };
  await saveStep(sb, run, 'regenerate_all', result);
  await setRunStatus(sb, run.id, 'generating');
  return result;
}

// ─── step: assemble ─────────────────────────────────────────────────────────
// Owner 2026-08-17: "筛选去重确实上一步做了,但 2 张上限 + engine/category 映射
// 还是要在这里 - no 这一步也应该在上一步做" — the photos step computes the
// FINAL shot list (2 per POI + engine/category/duration) and persists it as
// step_results.photos.shots. Assemble is now a pure job enqueue: it reads the
// saved shots and inserts a pending tour_assemblies row. No re-selection.
