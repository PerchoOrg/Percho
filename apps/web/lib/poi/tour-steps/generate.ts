/**
 * `generate` and `regenerate-all` steps — enqueue photo->clip jobs in
 * `photo_clips`; the Seedance / Ken Burns workers pick them up.
 */
import { CANVAS_H, CANVAS_W } from '@/lib/poi/tour-orchestrator/scheduler';
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

/** What a clip's pixels depend on. Change any of these and the file is wrong. */
export interface RenderInputs {
  engine: string;
  move: string | null;
  duration_s: number;
  /** Newest of the photo's reframe/enhance stamps; '' when it has neither. */
  photoVersion: string;
}

/**
 * A clip's render inputs as one comparable string.
 *
 * Canvas is in it because the canvas is not a property of the clip row and has
 * changed under a whole library once already (1080x1920 -> 1080x1576).
 *
 * Rounded duration, because it is a float from the scheduler and a 0.0001
 * difference is not a reason to re-render.
 */
export function renderKey(i: RenderInputs): string {
  return [
    `c=${CANVAS_W}x${CANVAS_H}`,
    `e=${i.engine}`,
    `m=${i.move ?? '-'}`,
    `d=${i.duration_s.toFixed(2)}`,
    `p=${i.photoVersion || '-'}`,
  ].join('|');
}

/**
 * The clips whose rendered file no longer matches the plan.
 *
 * `photo_id:engine` keys, matching the map `enqueueClips` builds.
 *
 * This REPLACED a timestamp comparison — clip.updated_at against the photo's
 * outpainted_at/enhanced_at — which could only ever see edits to the PHOTO. A
 * clip is a function of far more than that, and on 2026-08-19 three plan-only
 * changes each shipped undetected: the canvas changing shape, the render
 * read-path switching from reframes back to originals, and the camera moves
 * shifting toward orbit. Every time, `generate` printed "0 requeued", the film
 * came out unchanged, and the clips had to be requeued by hand. Comparing a
 * fingerprint of ALL the inputs is what makes that class of bug impossible
 * rather than one bug fixed three times.
 *
 * A row with no stored key (every row predating the column) counts as stale, so
 * the library re-renders once and is self-consistent afterwards.
 *
 * NEVER stales a Seedance clip. Owner 2026-08-19, emphatic: "for photos with
 * seedance clips, never call it again!!!! always re-use, unless I clicked
 * regenerate manually". Seedance is the only paid engine, so the exemption
 * lives here rather than in the callers — `requeueReady` (the per-row
 * Regenerate button) stays the one and only way to re-run it. Note this matters
 * MORE with a fingerprint than it did with timestamps: a canvas change now
 * marks every clip stale, and without the exemption that would be a bulk
 * re-bill of the whole paid library.
 */
export async function plannedRenderKeys(
  sb: TourDb,
  shots: Array<{ photo_id: string; engine: string; move?: string | null; duration_s: number }>,
): Promise<Map<string, string>> {
  const photoIds = [...new Set(shots.map((s) => s.photo_id))];
  const out = new Map<string, string>();
  if (photoIds.length === 0) return out;

  const { data: photos } = (await sb
    .from('poi_photos')
    .select('id, outpainted_at, outpaint_status, enhanced_at, enhanced_status')
    .in('id', photoIds)) as {
    data: Array<{
      id: string;
      outpainted_at: string | null;
      outpaint_status: string | null;
      enhanced_at: string | null;
      enhanced_status: string | null;
    }> | null;
  };

  // A photo's "version" is the newest derived-file stamp it carries. Only a
  // READY reframe and an APPROVED enhancement count — an in-flight or rejected
  // one is not what the render will read.
  const version = new Map<string, string>();
  for (const p of photos ?? []) {
    const stamps: string[] = [];
    if (p.outpaint_status === 'ready' && p.outpainted_at) stamps.push(p.outpainted_at);
    if (p.enhanced_status === 'approved' && p.enhanced_at) stamps.push(p.enhanced_at);
    if (stamps.length > 0) version.set(p.id, stamps.sort().at(-1) as string);
  }

  for (const s of shots) {
    out.set(
      `${s.photo_id}:${s.engine}`,
      renderKey({
        engine: s.engine,
        move: s.move ?? null,
        duration_s: s.duration_s,
        photoVersion: version.get(s.photo_id) ?? '',
      }),
    );
  }
  return out;
}

/** Which existing rows no longer match the plan. Pure — see the doc above. */
export function staleClipKeys(
  clips: Array<{ photo_id: string; engine: string; render_key?: string | null }>,
  wanted: Map<string, string>,
): Set<string> {
  const stale = new Set<string>();
  for (const c of clips) {
    if (c.engine === 'seedance') continue; // paid — manual Regenerate only
    const key = `${c.photo_id}:${c.engine}`;
    const want = wanted.get(key);
    if (want === undefined) continue; // not in this cut; leave it alone
    if (c.render_key !== want) stale.add(key);
  }
  return stale;
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
  const photoIdsInPlay = shotsWithEngine.map((s) => s.photo_id);
  const existing = await sb
    .from('photo_clips')
    .select('photo_id, engine, status, render_key')
    .in('photo_id', photoIdsInPlay);
  const have = new Map(
    (existing.data ?? []).map((r: { photo_id: string; engine: string; status: string }) => [
      `${r.photo_id}:${r.engine}`,
      r.status,
    ]),
  );

  // A clip's file is a function of the canvas, the engine, the move, the
  // duration AND the photo version. Anything in that set changing leaves the
  // rendered file wrong, and for a long time only the photo half was checked —
  // so a canvas change, a read-path change and a move change each shipped with
  // `generate` reporting "0 requeued" and the film coming out unchanged
  // (2026-08-19, three times in one session). `render_key` is the whole set.
  const wanted = await plannedRenderKeys(sb, shotsWithEngine);
  const stale = staleClipKeys(existing.data ?? [], wanted);
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
          render_key: wanted.get(`${s.photo_id}:${s.engine}`) ?? null,
        })),
      ),
    );
  }
  // Rows that already exist keep their id but must follow the current plan —
  // a re-plan that changed the move or the prompt has to reach the worker.
  let requeued = 0;
  for (const s of shotsWithEngine) {
    const key = `${s.photo_id}:${s.engine}`;
    const status = have.get(key);
    if (status === undefined) continue;
    if (status === 'processing') continue;
    // Re-render on an explicit per-row click, or when the render inputs moved
    // out from under the clip.
    const rerender = status === 'ready' && (requeueReady || stale.has(key));
    if (rerender) requeued += 1;
    // `render_key` describes the file this row is FOR, so it advances only
    // alongside a re-render. Writing it on a row we are not requeueing would
    // declare a stale file current and permanently suppress the very check
    // that caught the change.
    await mustWrite(
      `apply plan to clip(${s.photo_id}:${s.engine})`,
      sb
        .from('photo_clips')
        .update({
          duration_s: s.duration_s,
          move: s.move ?? null,
          prompt: s.prompt ?? null,
          ai_generated: s.ai_generated ?? false,
          ...(rerender
            ? { status: 'pending', error: null, render_key: wanted.get(key) ?? null }
            : {}),
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
