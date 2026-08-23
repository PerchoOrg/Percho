/**
 * `assemble` step — turn the planned shot list into a `listing_tour_assemblies`
 * row for the render worker to concat.
 *
 * One row per surface. iOS and web are the same cut on different canvases:
 * they render from different clips, finish at different times and fail
 * independently, so a single row with two uids would report one of them wrong.
 *
 * ── 2026-08-23: the plan picks the music ────────────────────────────────────
 *
 * Owner: "i feel some music are used much more than others". It was not a bias
 * — it was the absence of any rule. The "planner to decide" work of 2026-08-20
 * (`lib/bgm/select.ts`) was only ever wired into the COMMUNITY film; this step
 * inserted its row with no `bgm`, so `worker.py` fell through to `pick_bgm()`
 * and drew uniformly at random from the `acoustic` folder on every render.
 * `paletteForListing` — year built picks the palette, price percentile picks
 * the restraint — has existed since that day with no caller but its own test,
 * and the `piano` bucket was consequently unreachable for a home tour.
 *
 * `chooseListingBgm` below closes that. Returning null is still a real
 * outcome: an empty library or an unreachable bucket falls back to the
 * worker's own pick rather than shipping a silent film.
 */
import {
  type ListingRunRow,
  type Surface,
  type TourDb,
  asJson,
  plannedShots,
  saveListingStep,
  setListingRunStatus,
} from './shared';

/** What `chooseListingBgm` writes onto the assembly row. */
interface PlannedBgm {
  path: string;
  title: string | null;
  vibe: string;
  energy: string;
  role: 'lead';
}

/**
 * The track this home tour will play, or null to leave the choice to the
 * worker.
 *
 * Mirrors the community film's `chooseBgm` (`tour-steps/photos.ts`) — same
 * library, same review sidecar, same incumbency rule — and differs in the two
 * places the films differ:
 *
 *   · ROLE is `lead`, not `bed`. A bed exists to sit under a voice, and a home
 *     tour has none; `storage.ts` states the contract as a question about the
 *     FILM rather than the product, so the day listings gain narration this
 *     becomes `bed` and nothing else changes. No track is tagged `lead` today,
 *     and `selectBgm` falls back to the whole pool rather than to nothing, so
 *     in practice this widens the choice rather than narrowing it.
 *   · The palette comes from `paletteForListing` — the building's age and the
 *     price percentile — instead of from what surrounds a community.
 */
async function chooseListingBgm(sb: TourDb, run: ListingRunRow): Promise<PlannedBgm | null> {
  try {
    const [{ selectBgm, paletteForListing, pricePercentile }, { readBgmState }, storage] =
      await Promise.all([
        import('@/lib/bgm/select'),
        import('@/lib/bgm/state-store'),
        import('@/lib/bgm/storage'),
      ]);
    type Candidate = Parameters<typeof selectBgm>[0]['candidates'][number];
    const state = await readBgmState();
    const blocked = new Set([...state.rejected, ...(state.pending ?? [])]);

    const candidates: Candidate[] = [];
    for (const vibe of storage.BGM_VIBES) {
      const { data } = await sb.storage.from(storage.BGM_BUCKET).list(vibe, { limit: 1000 });
      for (const obj of data ?? []) {
        if (!/\.mp3$/i.test(obj.name)) continue;
        const path = `${vibe}/${obj.name}`;
        if (blocked.has(path)) continue;
        candidates.push({ path, meta: state.meta?.[path] });
      }
    }
    if (candidates.length === 0) return null;

    const { data: listing } = await sb
      .from('listings')
      .select('price, year_built, city, state')
      .eq('id', run.listing_id)
      .maybeSingle();

    // Percentile within the listing's own market, widening to the state when
    // its city has too few active listings to say anything. Null means the
    // middle — `paletteForListing` defaults there rather than guessing.
    let percentile: number | null = null;
    if (listing?.price != null) {
      for (const scope of ['city', 'state'] as const) {
        let q = sb.from('listings').select('price').eq('status', 'active').not('price', 'is', null);
        q =
          scope === 'city'
            ? q.eq('city', listing.city).eq('state', listing.state)
            : q.eq('state', listing.state);
        const { data: peers } = await q;
        percentile = pricePercentile(
          listing.price,
          (peers ?? []).map((r) => r.price as number),
        );
        if (percentile != null) break;
      }
    }

    const { vibe, energy } = paletteForListing({
      yearBuilt: listing?.year_built,
      pricePercentile: percentile,
    });

    // What this listing last shipped with. The seed only picks an INDEX, so a
    // growing library moves every index and a re-render would come back with
    // different music for no reason — the same trap the community film hit.
    const { data: shipped } = await sb
      .from('listing_tour_assemblies')
      .select('bgm')
      .eq('listing_id', run.listing_id)
      .not('bgm', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1);
    const incumbent = (shipped?.[0]?.bgm as { path?: string } | null)?.path ?? null;

    const picked = selectBgm({
      candidates,
      vibe,
      role: 'lead',
      energy,
      seed: run.listing_id,
      incumbent,
    });
    if (!picked) return null;
    return { path: picked.path, title: picked.meta?.title ?? null, vibe, energy, role: 'lead' };
  } catch {
    return null;
  }
}

interface ClipState {
  listing_photo_id: string;
  engine: string;
  status: string;
}

/** A shot the film will be missing, and why. */
export interface MissingShot {
  photo_id: string;
  sort_order: number;
  room_type: string | null;
  /**
   * `rendering` and `none` need different advice, which is the whole point of
   * separating them: telling someone to run Render while Render is mid-way
   * through that exact clip is worse than saying nothing.
   */
  state: 'rendering' | 'failed' | 'none';
}

export async function runAssemble(
  sb: TourDb,
  run: ListingRunRow,
  _photoIds?: string[],
  _engine?: string,
  approve?: boolean,
  surface: Surface = 'ios',
) {
  const shots = plannedShots(run);
  if (shots.length === 0) {
    return { error: 'no_shots', message: 'No shot list yet — run Plan first.' };
  }

  // How many planned shots will be MISSING from the film.
  //
  // A shot is missing only when its photo has no ready clip on this surface AT
  // ALL — not when the planned engine specifically is unrendered. The worker
  // falls back to whatever ready clip the photo has, so a shot planned for
  // DepthFlow still renders from an existing Ken Burns clip. Counting exact
  // engine matches would warn about shots that render perfectly well.
  //
  // The warning still matters: the worker SKIPS a photo with nothing ready and
  // says so only in its own log.
  const photoIds = [...new Set(shots.map((s) => s.photo_id))];
  // Every status, not just ready: a shot with a clip mid-render is not the
  // same problem as a shot with no clip at all, and the operator cannot act on
  // the difference unless it is carried here.
  const { data: clipRows } = (await sb
    .from('listing_photo_clips')
    .select('listing_photo_id, engine, status')
    .in('listing_photo_id', photoIds)
    .eq('surface', surface)) as { data: ClipState[] | null };

  const byPhoto = new Map<string, ClipState[]>();
  for (const c of clipRows ?? []) {
    byPhoto.set(c.listing_photo_id, [...(byPhoto.get(c.listing_photo_id) ?? []), c]);
  }
  const haveSomething = new Set(
    (clipRows ?? []).filter((c) => c.status === 'ready').map((c) => c.listing_photo_id),
  );

  const missing: MissingShot[] = shots
    .filter((sh) => !haveSomething.has(sh.photo_id))
    .map((sh) => {
      const rows = byPhoto.get(sh.photo_id) ?? [];
      const state: MissingShot['state'] = rows.some(
        (r) => r.status === 'pending' || r.status === 'processing',
      )
        ? 'rendering'
        : rows.some((r) => r.status === 'failed')
          ? 'failed'
          : 'none';
      return {
        photo_id: sh.photo_id,
        sort_order: sh.sort_order,
        room_type: sh.room_type,
        state,
      };
    });
  const notReady = missing.length;

  // A surface with NOTHING rendered is not a film with gaps — it is a film
  // that does not exist. Staging it anyway queues a worker job that can only
  // raise "need >=2 ready clips, got 0", which is what happened the first time
  // Assemble ran for both canvases over an iOS-only clip library (owner
  // 2026-08-21). Refuse here, where the message can name the surface and say
  // what to do, instead of failing the run from inside the worker.
  if (haveSomething.size === 0) {
    return {
      error: 'nothing_rendered',
      surface,
      message: `No ${surface} clips are rendered yet — run Render, which does both canvases.`,
    };
  }

  const ordered = shots.map((s) => ({
    photo_id: s.photo_id,
    sort_order: s.sort_order,
    duration_s: s.duration_s,
    engine: s.surfaces[surface]?.engine ?? 'kenburns',
  }));

  if (!approve) {
    await saveListingStep(sb, run, 'assemble', {
      approved: false,
      surface,
      ordered,
      notReady,
      missing,
    });
    return { approved: false, surface, ordered, notReady, missing };
  }

  // Chosen once per surface, but deterministic on the listing id and pinned by
  // incumbency — so iOS and web are the same film with the same music, which
  // is what they are supposed to be.
  const bgm = await chooseListingBgm(sb, run);

  const { error: insErr } = await sb.from('listing_tour_assemblies').insert({
    listing_id: run.listing_id,
    run_id: run.id,
    surface,
    status: 'pending',
    ordered_clips: asJson(ordered),
    ...(bgm ? { bgm: asJson(bgm) } : {}),
    photos_dropped: asJson(
      (run.step_results.plan as { dropped?: unknown[] } | undefined)?.dropped ?? [],
    ),
  });
  if (insErr) {
    return { error: 'insert_failed', message: (insErr as { message: string }).message };
  }

  await setListingRunStatus(sb, run.id, 'assembling');
  await saveListingStep(sb, run, 'assemble', {
    approved: true,
    surface,
    ordered,
    notReady,
    missing,
    bgm,
  });
  return { approved: true, surface, ordered, notReady, missing, bgm };
}

/**
 * Stage or approve an assembly for BOTH surfaces.
 *
 * Each is its own row and its own worker job — they finish at different times
 * and fail independently — but one click asks for the film, not for a cut.
 */
export async function runAssembleAllSurfaces(sb: TourDb, run: ListingRunRow, approve?: boolean) {
  const surfaces: Record<string, unknown> = {};
  let notReady = 0;
  for (const surface of ['ios', 'web'] as const) {
    const r = (await runAssemble(sb, run, undefined, undefined, approve, surface)) as {
      error?: string;
      message?: string;
      notReady?: number;
      missing?: MissingShot[];
    };
    if (r.error) return r;
    surfaces[surface] = r;
    notReady += r.notReady ?? 0;
  }
  return { surfaces, notReady, approved: !!approve };
}
