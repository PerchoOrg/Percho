/**
 * `plan` step — the shot list, the narration and the music, all decided after
 * the owner's photo review.
 *
 * Split out of `tour-steps/photos.ts` on 2026-09-06: the two steps shared a
 * file and nothing else. `photos.ts` still owns the fetch and the enhance
 * queue; this step writes its result back under that step's `photos` key,
 * because the whole admin surface reads the shot list from there.
 */
import type { PlaceFact } from '../tour-orchestrator/insights';
import { tourPoiSet } from '../tour-poi-set';
import { SURROUNDING_POI_BUDGET, selectSurroundingPois } from './photos';
import { type RunRow, type TourDb, mustWrite, saveStep, setRunStatus } from './shared';
import { computeFinalShots } from './shots';

/**
 * `plan` step — the shot list, run AFTER the owner's photo review.
 *
 * Split out of `photos` on 2026-08-19 so the review gate above has something to
 * gate. Selection lives here rather than in `assemble` (owner 2026-08-17);
 * assemble only enqueues what this produced.
 */
export async function runPlan(sb: TourDb, run: RunRow) {
  const photosStep = (run.step_results.photos ?? {}) as {
    results?: Record<string, unknown>;
    auto_tag?: unknown;
  };

  // The candidate set is the TOUR's POI set — what `resolve` picked for this
  // run, plus the links a person approved (the amenity ingest and the admin
  // panel both stamp 'approved'). NOT every non-rejected row in
  // `community_pois`.
  //
  // That table is two sets wearing one name: the Nearby button writes a
  // `candidate` row for 20 places per included type, so a single click leaves a
  // few hundred behind. Reading all of them put TEN POIs into Apremont -
  // Highcroft's fifteen-place cut that the photos step had never fetched,
  // enhanced, tagged or judged for — nine of the twenty-nine shots landed on
  // photos with no ai_tags and no ai_score at all, ordered by `created_at`
  // alone. One was Cornerstone Christian Academy, whose only TAGGED photo the
  // fair-housing filter had just dropped; three untagged ones took the slots it
  // vacated, and nothing had ever looked at them. Owner 2026-08-23: "the scope
  // of plan is only for photos from previous step, which is resolved photos and
  // manual fetched ones."
  //
  // `tourPoiIds` is that definition, already shared by the photos step, the tag
  // step and the review page — this was the last caller reading the raw table,
  // so all four now work on the same places. It is re-derived from
  // `resolve.resolved` on every call rather than replayed from a list an
  // earlier plan froze, which is what once left hand-approved photos
  // unreachable (owner 2026-08-20: "i ran 3 time, cost a lot for this test").
  //
  // Render and assembly need no equivalent change: both read the shot list this
  // step writes, so the scope reaches them through it.
  const resolveStep = run.step_results.resolve as
    | { resolved?: Array<{ place_id: string; score?: number }> }
    | undefined;
  const { ids: scopePoiIds, scoreByPoiId } = await tourPoiSet(
    sb,
    run.community_id,
    resolveStep?.resolved,
  );

  const { data: allLinks } = (await sb
    .from('community_pois')
    .select('poi_id, intent_bucket')
    .eq('community_id', run.community_id)
    .neq('status', 'rejected')) as {
    data: Array<{ poi_id: string; intent_bucket: string | null }> | null;
  };

  // Every photo behind every link, once. Three questions need it: which POIs in
  // scope actually have a photo to offer, which POIs the owner has ruled on by
  // hand, and which `approved` rows this plan has to stand down at the end.
  //
  // Chunked, because one `.in()` over every link is a URL a few hundred uuids
  // long and PostgREST sits behind an 8 KB header limit — the 1,000-uuid
  // `.in()` that forced the tour-index rewrite was 37 KB (2026-08-22).
  const linkPoiIds = [...new Set((allLinks ?? []).map((l) => l.poi_id))];
  type LinkedPhoto = {
    id: string;
    poi_id: string;
    status: string | null;
    reviewed_by: string | null;
  };
  const linkedPhotos: LinkedPhoto[] = [];
  for (let i = 0; i < linkPoiIds.length; i += 100) {
    const { data: photoRows } = (await sb
      .from('poi_photos')
      .select('id, poi_id, status, reviewed_by')
      .in('poi_id', linkPoiIds.slice(i, i + 100))) as { data: LinkedPhoto[] | null };
    linkedPhotos.push(...(photoRows ?? []));
  }

  // A POI the owner ruled on by hand is in scope whatever resolve says. The
  // review page shows him those rows deliberately (`keepPhotoForTour`), and a
  // photo he can approve but the plan cannot reach is exactly the complaint of
  // 2026-08-20: "the photos i manually approved are not in the plan".
  for (const p of linkedPhotos) {
    if (p.reviewed_by) scopePoiIds.add(p.poi_id);
  }

  // ...and only the POIs with a photo to offer. A place with none contributes
  // no shots, so leaving it in spends one of the fifteen surrounding slots on
  // nothing.
  const hasPhotos = new Set(
    linkedPhotos.filter((p) => p.status !== 'rejected').map((p) => p.poi_id),
  );
  const links = (allLinks ?? []).filter(
    (l) => scopePoiIds.has(l.poi_id) && hasPhotos.has(l.poi_id),
  );
  const resolvedPoiIds = [...new Set(links.map((l) => l.poi_id))];
  if (resolvedPoiIds.length === 0) {
    throw new Error(
      'no resolved or hand-picked POI has photos yet — run research, resolve and Fetch & Tag first',
    );
  }
  const bucketByPoiId = new Map<string, string>(
    links.map((l) => [l.poi_id, l.intent_bucket ?? 'other']),
  );

  // THE BUDGET, applied HERE so the owner's review counts toward it. Amenities
  // are the community's own and never compete; the surrounding places do.
  const amenityIds = resolvedPoiIds.filter((id) => bucketByPoiId.get(id) === 'amenities');
  const surrounding = resolvedPoiIds.filter((id) => bucketByPoiId.get(id) !== 'amenities');
  let cutPoiIds = resolvedPoiIds;
  if (surrounding.length > SURROUNDING_POI_BUDGET) {
    const { data: approvedPhotos } = (await sb
      .from('poi_photos')
      .select('poi_id, reviewed_by')
      .in('poi_id', surrounding)
      .eq('status', 'approved')) as {
      data: Array<{ poi_id: string; reviewed_by: string | null }> | null;
    };
    // `resolve`'s own score, not `community_pois.ai_score` — nothing has ever
    // written that column, so this ranking was comparing nulls and the winner
    // was row order. See `tourPoiSet`.
    cutPoiIds = [
      ...amenityIds,
      ...selectSurroundingPois({
        surrounding,
        bucketOf: (id) => bucketByPoiId.get(id) ?? 'other',
        scoreOf: (id) => scoreByPoiId.get(id) ?? 0,
        incumbents: new Set((approvedPhotos ?? []).map((r) => r.poi_id)),
        handPicked: new Set(
          (approvedPhotos ?? []).filter((r) => r.reviewed_by).map((r) => r.poi_id),
        ),
      }),
    ];
  }

  const { shots, dropped, plan } = await computeFinalShots(sb, cutPoiIds, bucketByPoiId);

  // NARRATION — written here, because the cut only exists here.
  //
  // It used to be written against the film's total runtime, which meant
  // nothing tied a sentence to a shot and the error compounded: on the last
  // Aberdeen cut the narration named Halcyon 4.6s early and was 28.7s ahead by
  // the closing Publix shot, talking about groceries over a park. Anchored to
  // the shot list instead, each line is spoken over the clips it describes.
  //
  // Text only. Synthesis and placement belong to the worker, which is the only
  // place the real timeline is known — see `NarrationSection.startClip`.
  const narration = await writeNarration(sb, run, shots);

  // THE MUSIC, chosen here rather than rolled by the worker.
  //
  // `pick_bgm()` took a uniform random pick from a folder, which is how the
  // loudest and most dynamic track in the library ended up under the first
  // narrated cut (owner: "the background music is too big"). Deciding in the
  // plan puts it beside every other decision about the film and makes it
  // reviewable before anything renders — owner 2026-08-20: "planner to
  // decide".
  const bgm = await chooseBgm(sb, run, shots);

  // NO reframing is queued here. Owner 2026-09-03, after Windward's plan queued
  // 16 outpaints in a single step: "never reframe automatically" — the function
  // stays, the automatic trigger does not. A reframe is now only ever started by
  // the Reframe button in the admin photo table (`requeueOutpaint`).
  //
  // Two behaviours went with it, deliberately. A badly framed photo in the cut
  // is centre-cropped again, as it was before phase71. And an undersized photo
  // is no longer rescued into eligibility — it stays out of the cut until
  // someone reframes it by hand, which is the loop phase73.23 automated away.

  // `approved` = in the cut. Stamped HERE, because this is where the cut is
  // decided — owner 2026-08-19: "approved can not be 82!!… they should already
  // be approved" of the photos in the video. Anything previously approved that
  // this plan did not pick goes back to 'pending': still usable, no longer in
  // the film. Rejected rows are never touched; that verdict is the review's.
  const chosen = new Set(
    (shots as Array<{ photo_id?: string }>).map((sh) => sh.photo_id).filter(Boolean) as string[],
  );
  //
  // Read across EVERY link, not only the POIs in this cut. Narrowing the cut to
  // the tour's own POI set (see the top of this step) strands rows an earlier,
  // wider plan stamped 'approved' — nine of them on Apremont - Highcroft — and
  // a photo claiming to be in the cut of a film that has never heard of its POI
  // is the very lie this stamp exists to prevent.
  const promote = linkedPhotos
    .filter((r) => chosen.has(r.id) && r.status !== 'approved')
    .map((r) => r.id);
  const demote = linkedPhotos
    .filter((r) => !chosen.has(r.id) && r.status === 'approved')
    .map((r) => r.id);
  // Chunked for the same 8 KB header limit as the read above: `demote` is now
  // community-wide, so it is no longer bounded by one cut's worth of photos.
  for (let i = 0; i < promote.length; i += 100) {
    const batch = promote.slice(i, i + 100);
    await mustWrite(
      `approve ${batch.length} photo(s) in the cut`,
      sb.from('poi_photos').update({ status: 'approved' }).in('id', batch),
    );
  }
  for (let i = 0; i < demote.length; i += 100) {
    const batch = demote.slice(i, i + 100);
    await mustWrite(
      `un-approve ${batch.length} photo(s) no longer in the cut`,
      sb.from('poi_photos').update({ status: 'pending' }).in('id', batch),
    );
  }

  await saveStep(sb, run, 'photos', {
    ...photosStep,
    phase: 'done',
    cut_poi_ids: cutPoiIds,
    shots,
    dropped,
    plan,
    narration,
    bgm,
  });
  await setRunStatus(sb, run.id, 'tagging');
  return {
    ok: true,
    shots: shots.length,
    dropped: dropped.length,
    approved: promote.length,
    unapproved: demote.length,
    plan,
    narration: { lines: narration.segments.length, voice: narration.voice, error: narration.error },
    bgm,
  };
}

/**
 * The track this film will play, or null to leave the choice to the worker.
 *
 * Reads the library straight from Storage and its review state from the
 * sidecar, so only tracks a human approved are candidates — the same rule the
 * worker's sync applies, checked here because this is where the decision now
 * happens. Returning null is a real outcome, not a failure: an empty library
 * or an unreachable bucket should fall back to the worker's own pick rather
 * than produce a silent film.
 */
async function chooseBgm(sb: TourDb, run: RunRow, shots: unknown[]) {
  try {
    const [{ selectBgm, paletteForCommunity }, { readBgmState }, { BGM_BUCKET, BGM_VIBES }] =
      await Promise.all([
        import('@/lib/bgm/select'),
        import('@/lib/bgm/state-store'),
        import('@/lib/bgm/storage'),
      ]);
    type Candidate = Parameters<typeof selectBgm>[0]['candidates'][number];
    const state = await readBgmState();
    const blocked = new Set([...state.rejected, ...(state.pending ?? [])]);

    const candidates: Candidate[] = [];
    for (const vibe of BGM_VIBES) {
      const { data } = await sb.storage.from(BGM_BUCKET).list(vibe, { limit: 1000 });
      for (const obj of data ?? []) {
        if (!/\.mp3$/i.test(obj.name)) continue;
        const path = `${vibe}/${obj.name}`;
        if (blocked.has(path)) continue;
        candidates.push({ path, meta: state.meta?.[path] });
      }
    }
    if (candidates.length === 0) return null;

    // Counts and distance, not a set of names: the pipeline forces bucket
    // variety, so which buckets EXIST says almost nothing.
    const bucketCounts: Record<string, number> = {};
    for (const sh of shots as Array<{ bucket?: string | null }>) {
      const b = sh.bucket ?? 'other';
      bucketCounts[b] = (bucketCounts[b] ?? 0) + 1;
    }
    const { data: links } = await sb
      .from('community_pois')
      .select('distance_m')
      .eq('community_id', run.community_id)
      .not('distance_m', 'is', null);
    const miles = (links ?? []).map((l) => (l.distance_m as number) / 1609).sort((a, b) => a - b);
    const medianMiles = miles.length > 0 ? (miles[Math.floor(miles.length / 2)] ?? null) : null;
    const vibe = paletteForCommunity({ bucketCounts, medianMiles });

    // What this community last shipped with. Keeping it is what actually makes
    // the choice stable: the seed only picks an index, so growing the library
    // moves every index and a re-render would come back with music nobody
    // reviewed. Assemblies are the record of what really went out.
    //
    // The same rows also give the usage counts that spread the choice across
    // the library (2026-09-03) — one per COMMUNITY, since a community that was
    // re-rendered six times is still one film.
    const { data: shipped } = await sb
      .from('tour_assemblies')
      .select('community_id, bgm')
      .not('bgm', 'is', null)
      .order('created_at', { ascending: false });
    const usage: Record<string, number> = {};
    const counted = new Set<string>();
    let incumbent: string | null = null;
    for (const row of shipped ?? []) {
      const path = (row.bgm as { path?: string } | null)?.path;
      if (!path) continue;
      if (row.community_id === run.community_id) incumbent ??= path;
      const key = `${row.community_id} ${path}`;
      if (counted.has(key)) continue;
      counted.add(key);
      usage[path] = (usage[path] ?? 0) + 1;
    }

    // 'bed' always: this film is narrated, and a track that surges fights the
    // voice however well it suits the place.
    const picked = selectBgm({
      candidates,
      vibe,
      role: 'bed',
      seed: run.community_id,
      incumbent,
      usage,
    });
    if (!picked) return null;
    return { path: picked.path, title: picked.meta?.title ?? null, vibe, role: 'bed' as const };
  } catch {
    return null;
  }
}

/**
 * The narration for this cut, or an empty script if the call fails.
 *
 * Never throws: the tour shipped with music alone until this week, so losing
 * narration is a downgrade, while a plan step that dies on a text-generation
 * call after paying for Curator is a regression. The reason is kept on the
 * step result so the admin table can say why the column is empty.
 */
async function writeNarration(sb: TourDb, run: RunRow, shots: unknown[]) {
  const { runNarration } = await import('../tour-orchestrator/narration');
  const { data: community } = await sb
    .from('communities')
    .select('name, city, state, narration_voice')
    .eq('id', run.community_id)
    .maybeSingle();

  // `narrative_angle` is the research step's one-line read on the place. It has
  // been written on every run since research shipped and consumed by nothing;
  // it is what stops every community opening the same way.
  const agents = (
    run.step_results.agent_research as { agents?: Record<string, unknown> } | undefined
  )?.agents;
  const narrativeAngle =
    Object.values((agents ?? {}) as Record<string, { parsed?: { narrative_angle?: unknown } }>)
      .map((a) => a?.parsed?.narrative_angle)
      .find((v): v is string => typeof v === 'string' && v.length > 0) ?? null;

  // What we know about each place beyond its name. Without this the model can
  // only caption the picture, which is exactly what it did (owner 2026-08-21:
  // "the narrative is just talking about the pics").
  const poiIds = [
    ...new Set(
      (shots as Array<{ poi_id?: string }>).map((sh) => sh.poi_id).filter(Boolean) as string[],
    ),
  ];
  const facts: Record<string, PlaceFact> = {};
  if (poiIds.length > 0) {
    const { data: links } = await sb
      .from('community_pois')
      .select(
        'poi_id, distance_m, intent_bucket, poi:pois(display_name, rating, user_ratings_total)',
      )
      .eq('community_id', run.community_id)
      .in('poi_id', poiIds);
    for (const l of links ?? []) {
      const poi = l.poi as unknown as {
        display_name?: string;
        rating?: number | null;
        user_ratings_total?: number | null;
      } | null;
      facts[l.poi_id as string] = {
        name: poi?.display_name ?? '',
        bucket: (l.intent_bucket as string) ?? 'other',
        miles: l.distance_m == null ? null : (l.distance_m as number) / 1609,
        rating: poi?.rating ?? null,
        reviews: poi?.user_ratings_total ?? null,
      };
    }
  }

  const fresh = await runNarration(
    shots as Array<{
      bucket?: string | null;
      poi_name?: string | null;
      poi_id?: string | null;
      duration_s: number;
    }>,
    {
      communityName: community?.name ?? 'this community',
      city: community?.city ?? null,
      state: community?.state ?? null,
      narrativeAngle,
      seed: run.community_id,
      voiceOverride: community?.narration_voice ?? null,
      facts,
    },
  );

  // A FAILED RUN MUST NOT ERASE A GOOD SCRIPT.
  //
  // The generator retries, but it can still come back empty, and this used to
  // save whatever it returned — so one bad reply replaced a working narration
  // with nothing, and the next assembly shipped a silent film without anything
  // going red. Keep the old script and carry the error alongside it, so the
  // admin says what happened and the film still speaks.
  const previous = (run.step_results.photos as { narration?: { segments?: unknown[] } } | undefined)
    ?.narration;
  if (!fresh.ok && (previous?.segments?.length ?? 0) > 0) {
    return { ...previous, error: fresh.error, stale: true } as typeof fresh & { stale: true };
  }
  return fresh;
}

// ─── step: tag ──────────────────────────────────────────────────────────────
