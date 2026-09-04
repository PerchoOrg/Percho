/**
 * Drive a community tour end to end from the command line.
 *
 * The admin page runs these steps one button at a time, which is right for
 * reviewing but slow for iterating on the pipeline itself — and the photos
 * step could not be scripted at all until `PoiActor` existed, because its
 * Places fetch went through a session check that a script has no session for.
 *
 * Runs as `actor: 'service'`. CLAUDE.md §3 permits that here: this file lives
 * in scripts/admin/ and is invoked by hand. Nothing reachable from a browser
 * may pass 'service'.
 *
 * Usage, from apps/web:
 *   pnpm tour <community-slug>            # research -> resolve -> photos, then STOPS
 *   pnpm tour aberdeen-2 --steps plan,generate,assemble   # after the manual review
 *
 * Steps run in the order given and stop at the first failure. `assemble`
 * enqueues the job; the render worker finishes it out of band.
 */
import { createClient } from '@supabase/supabase-js';

const ALL_STEPS = [
  'research',
  'resolve',
  'photos',
  // `tag` was reachable only from the admin chip until 2026-09-03, which
  // made it unrunnable for photos that arrive outside the pipeline —
  // `ingest-community-photos.ts` creates amenity POIs after `photos` has
  // already run, and its own header tells you to tag them afterwards.
  'tag',
  'plan',
  'generate',
  'assemble',
] as const;
type Step = (typeof ALL_STEPS)[number];

/**
 * What a bare `pnpm tour <slug>` runs — the automated first half only.
 *
 * It stops at the review gate rather than driving through to a film. The owner
 * reviews the approved AND rejected photos by hand between `photos` and `plan`
 * (2026-08-19); resume with `--steps plan,generate,assemble`.
 */
const DEFAULT_STEPS: readonly Step[] = ['research', 'resolve', 'photos'];

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}. Source .env.local first.`);
  return v;
}

function flagValue(argv: string[], name: string): string | undefined {
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.split('=').slice(1).join('=');
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

function parseArgs(): { slug: string; steps: Step[]; runId?: string } {
  const argv = process.argv.slice(2);
  const slug = argv.find(
    (a) =>
      !a.startsWith('--') &&
      argv[argv.indexOf(a) - 1] !== '--steps' &&
      argv[argv.indexOf(a) - 1] !== '--run',
  );
  if (!slug) {
    console.error('Usage: pnpm tour <community-slug> [--steps a,b,c] [--run <run-id>]');
    process.exit(1);
  }
  const raw = flagValue(argv, 'steps');
  const steps = raw ? (raw.split(',').map((s) => s.trim()) as Step[]) : [...DEFAULT_STEPS];
  const bad = steps.filter((s) => !ALL_STEPS.includes(s));
  if (bad.length) {
    console.error(`Unknown step(s): ${bad.join(', ')}. Known: ${ALL_STEPS.join(', ')}`);
    process.exit(1);
  }
  // Newest-run is the wrong default once a community has several part-finished
  // runs — the newest may be the one that only got as far as research.
  return { slug, steps, runId: flagValue(argv, 'run') };
}

async function main() {
  const { slug, steps, runId: explicitRun } = parseArgs();
  // biome-ignore lint/suspicious/noExplicitAny: the step modules take TourDb
  const sb: any = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  );

  const { data: community } = await sb
    .from('communities')
    .select('id, name, city, state')
    .eq('slug', slug)
    .maybeSingle();
  if (!community) throw new Error(`No community with slug "${slug}"`);
  console.log(`${community.name} (${community.city}, ${community.state})\n`);

  // Reuse the newest run so a partial pipeline can be continued; `research`
  // makes a fresh one, matching what the Run button does on the page.
  let runId: string | undefined = explicitRun;
  if (!runId && !steps.includes('research')) {
    const { data: latest } = await sb
      .from('community_tour_runs')
      .select('id')
      .eq('community_id', community.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    runId = latest?.id;
  }
  if (!runId) {
    const { data: created, error } = await sb
      .from('community_tour_runs')
      .insert({ community_id: community.id, step_results: {} })
      .select('id')
      .single();
    if (error || !created) throw new Error(`Could not create run: ${error?.message}`);
    runId = created.id;
  }
  console.log(`run ${runId}\n`);

  const { runResearch } = await import('../../apps/web/lib/poi/tour-steps/research.js');
  const { runResolve } = await import('../../apps/web/lib/poi/tour-steps/resolve.js');
  const { runPhotos, runPlan } = await import('../../apps/web/lib/poi/tour-steps/photos.js');
  const { runTag } = await import('../../apps/web/lib/poi/tour-steps/tag.js');
  const { runGenerate } = await import('../../apps/web/lib/poi/tour-steps/generate.js');
  const { runAssemble } = await import('../../apps/web/lib/poi/tour-steps/assemble.js');

  for (const step of steps) {
    // Re-read: every step reads what the previous one persisted.
    const { data: run } = await sb.from('community_tour_runs').select('*').eq('id', runId).single();

    const startedAt = Date.now();
    process.stdout.write(`${step} … `);
    let result: unknown;
    switch (step) {
      case 'research':
        result = await runResearch(sb, run);
        break;
      case 'resolve':
        result = await runResolve(sb, run);
        break;
      case 'photos':
        result = await runPhotos(sb, run, 'service');
        // The step queues enhancement and returns; the render worker does the
        // work out of band. Until an enhanced file is APPROVED, shots.ts still
        // measures the original — and a fresh Places photo is 1024-1300px,
        // which needs 2.4-2.8x for the 9:16 canvas and gets dropped. That is
        // why an unattended run produced 30 photos and zero shots.
        //
        // The photo table auto-approves 'ready' rows when an admin opens it,
        // so this is the same policy, not a new one.
        result = await settleEnhancements(sb, community.id, runId, result);
        break;
      case 'tag':
        // Tags every untagged photo the tour can see and then filters them,
        // which is what fills the statuses the review gate is about. Bounded
        // internally at 220s, so a large pile needs the step run twice.
        result = await runTag(sb, run);
        break;
      case 'plan':
        result = await runPlan(sb, run);
        break;
      case 'generate':
        result = await runGenerate(sb, run);
        // Wait for the worker before moving on. `generate` only enqueues, so
        // `--steps generate,assemble` used to assemble while clips were still
        // rendering: the assembly skips a shot whose clip is not ready, and
        // the film comes up short with no error anywhere.
        await waitForClips(sb, runId);
        break;
      case 'assemble':
        result = await runAssemble(sb, run, undefined, undefined, true);
        break;
    }
    const secs = ((Date.now() - startedAt) / 1000).toFixed(0);
    const summary = summarise(step, result);
    console.log(`${summary}  (${secs}s)`);
    if (typeof result === 'object' && result && 'error' in result) {
      console.error(`\nstopped: ${JSON.stringify(result)}`);
      process.exit(1);
    }
  }
}

/** Block until no clip is pending or processing. */
async function waitForClips(
  // biome-ignore lint/suspicious/noExplicitAny: service client
  sb: any,
  runId: string,
): Promise<void> {
  const deadline = Date.now() + 40 * 60_000;
  for (;;) {
    const { data: pending } = await sb
      .from('photo_clips')
      .select('id')
      .in('status', ['pending', 'processing']);
    if (!pending?.length) break;
    if (Date.now() > deadline) {
      console.log(`\n  (${pending.length} clip(s) still rendering after 40 min — continuing)`);
      break;
    }
    process.stdout.write(`\r  rendering ${pending.length} clip(s)…      `);
    await new Promise((r) => setTimeout(r, 15_000));
  }
  void runId;
}

/**
 * Wait for the render worker to finish enhancing, approve what it produced,
 * then recompute the shot list.
 *
 * Enhancement is the one asynchronous hop inside an otherwise synchronous
 * step, and the shot list computed at the end of `runPhotos` cannot see its
 * results — they land minutes later. Recomputing here is what makes the
 * script's answer the same as the page's.
 */
async function settleEnhancements(
  // biome-ignore lint/suspicious/noExplicitAny: service client, dynamic tables
  sb: any,
  communityId: string,
  runId: string,
  photosResult: unknown,
): Promise<unknown> {
  // Use the POI set runPhotos settled on, NOT every link on the community:
  // runPhotos trims the surrounding places to a budget, and re-reading the
  // table here would quietly undo that and put all 22 back in the film.
  const { data: runRow } = await sb
    .from('community_tour_runs')
    .select('step_results')
    .eq('id', runId)
    .single();
  const budgeted: string[] =
    (runRow?.step_results as Record<string, { resolved_poi_ids?: string[] }> | undefined)?.photos
      ?.resolved_poi_ids ?? [];

  const { data: links } = await sb
    .from('community_pois')
    .select('poi_id, intent_bucket')
    .eq('community_id', communityId)
    .neq('status', 'rejected');
  const inFilm = new Set(budgeted);
  const scoped = (links ?? []).filter((l: { poi_id: string }) =>
    inFilm.size ? inFilm.has(l.poi_id) : true,
  );
  const poiIds: string[] = scoped.map((l: { poi_id: string }) => l.poi_id);
  if (poiIds.length === 0) return photosResult;

  const deadline = Date.now() + 20 * 60_000;
  for (;;) {
    const { data: pending } = await sb
      .from('poi_photos')
      .select('id')
      .in('poi_id', poiIds)
      .in('enhanced_status', ['queued', 'processing']);
    if (!pending?.length) break;
    if (Date.now() > deadline) {
      console.log(`\n  (still enhancing ${pending.length} photo(s) after 20 min — continuing)`);
      break;
    }
    process.stdout.write(`\r  enhancing ${pending.length} photo(s)…      `);
    await new Promise((r) => setTimeout(r, 15_000));
  }

  const { data: approved } = await sb
    .from('poi_photos')
    .update({ enhanced_status: 'approved' })
    .in('poi_id', poiIds)
    .eq('enhanced_status', 'ready')
    .select('id');
  if (approved?.length) process.stdout.write(`\r  approved ${approved.length} enhanced file(s)   `);

  const buckets = new Map<string, string>(
    scoped.map((l: { poi_id: string; intent_bucket: string }) => [l.poi_id, l.intent_bucket]),
  );
  const { computeFinalShots } = await import('../../apps/web/lib/poi/tour-steps/shots.js');
  const recomputed = await computeFinalShots(sb, poiIds, buckets);

  // Persist, or generate and assemble would read the empty list runPhotos
  // wrote before the enhancements landed.
  const { data: run } = await sb
    .from('community_tour_runs')
    .select('step_results')
    .eq('id', runId)
    .single();
  const sr = (run?.step_results ?? {}) as Record<string, unknown>;
  sr.photos = {
    ...((sr.photos as Record<string, unknown>) ?? {}),
    ...recomputed,
    resolved_poi_ids: poiIds,
    ran_at: new Date().toISOString(),
  };
  await sb.from('community_tour_runs').update({ step_results: sr }).eq('id', runId);
  return recomputed;
}

/** One line per step — the full payloads are megabytes of shot lists. */
function summarise(step: Step, result: unknown): string {
  const r = (result ?? {}) as Record<string, unknown>;
  if (r.error) return `FAILED ${String(r.message ?? r.error)}`;
  switch (step) {
    case 'research':
      return r.started ? 'done' : 'reused previous result';
    case 'resolve':
      return `${r.resolved} resolved, ${r.dropped} dropped`;
    case 'photos':
      return `${(r.shots as unknown[] | undefined)?.length ?? 0} shots, ${(r.dropped as unknown[] | undefined)?.length ?? 0} dropped`;
    case 'tag':
      return `${r.tagged}/${r.total} tagged${
        r.unreached ? `, ${r.unreached} not reached — run tag again` : ''
      }${r.failed ? `, ${r.failed} failed` : ''}`;
    case 'generate':
      return `${r.created} clips queued, ${r.requeued} requeued`;
    case 'assemble':
      return r.approved
        ? `enqueued ${(r.ordered as unknown[] | undefined)?.length ?? 0} clips — worker renders it`
        : 'not approved';
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
