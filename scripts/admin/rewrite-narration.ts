/**
 * Rewrite a community's narration against the shot list it already has.
 *
 * `plan` is the only thing that writes narration, and it also runs the Curator
 * (a batch vision call over every photo in the cut), picks the music and
 * queues reframes. So tuning the narration PROMPT meant paying for all of that
 * to change some sentences — and the shot list, which is the expensive half,
 * does not change at all when the prompt does.
 *
 * This runs the narration generator alone, against the stored shots, and
 * patches `step_results.photos.narration` in place. Everything else about the
 * run — the cut, the clips, the music — is untouched, and the worker
 * synthesises the voice at assemble time, so the next Assemble speaks the new
 * script.
 *
 * Costs one Gemini text call. Renders nothing, and re-runs no vision model.
 *
 * Usage (env from the repo-root .env.local, or PERCHO_ENV_FILE):
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/rewrite-narration.ts <communityId>
 *   …                                                                <communityId> --apply
 *
 * DRY RUN BY DEFAULT: prints the script it would write and changes nothing.
 */

import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const [communityId, ...flags] = process.argv.slice(2);
const APPLY = flags.includes('--apply');
if (!communityId) {
  console.error('usage: rewrite-narration <communityId> [--apply]');
  process.exit(1);
}

function envPath(): string {
  const explicit = process.env.PERCHO_ENV_FILE;
  if (explicit) return explicit;
  for (const c of [
    new URL('../../.env.local', import.meta.url).pathname,
    `${process.env.HOME}/Workspace/Percho/.env.local`,
  ]) {
    if (existsSync(c)) return c;
  }
  throw new Error('no .env.local found; set PERCHO_ENV_FILE');
}

const env = Object.fromEntries(
  readFileSync(envPath(), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }),
);
// The generator reads these from the environment, exactly as it does on Vercel.
for (const k of ['GEMINI_API_KEY', 'GEMINI_VO_MODEL']) if (env[k]) process.env[k] = env[k];

async function main() {
  const { mentionsDistance, runNarration } = await import(
    '../../apps/web/lib/poi/tour-orchestrator/narration.js'
  );
  // biome-ignore lint/suspicious/noExplicitAny: an admin script, not app code.
  const sb: any = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: community } = await sb
    .from('communities')
    .select('name, city, state, narration_voice')
    .eq('id', communityId)
    .maybeSingle();
  if (!community) {
    console.error(`no community ${communityId}`);
    process.exit(1);
  }

  const { data: run } = await sb
    .from('community_tour_runs')
    .select('id, step_results')
    .eq('community_id', communityId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const photos = run?.step_results?.photos;
  const shots = photos?.shots ?? [];
  if (!run || shots.length === 0) {
    console.error('no planned shots on the newest run — run Plan first');
    process.exit(1);
  }

  // The same facts `runPlan` assembles. Rebuilt here rather than reused,
  // because the run stores the SCRIPT and not the input that produced it.
  const poiIds: string[] = [
    ...new Set(shots.map((s: { poi_id?: string }) => s.poi_id).filter(Boolean)),
  ] as string[];
  const { data: links } = await sb
    .from('community_pois')
    .select('poi_id, distance_m, intent_bucket')
    .in('poi_id', poiIds);
  const { data: pois } = await sb
    .from('pois')
    .select('id, display_name, rating, user_ratings_total')
    .in('id', poiIds);
  const poiById = new Map(
    ((pois ?? []) as Array<{ id: string }>).map((p) => [p.id, p as Record<string, unknown>]),
  );
  const facts: Record<string, unknown> = {};
  for (const l of (links ?? []) as Array<{
    poi_id: string;
    distance_m: number | null;
    intent_bucket: string | null;
  }>) {
    const p = poiById.get(l.poi_id);
    facts[l.poi_id] = {
      name: p?.display_name ?? '',
      bucket: l.intent_bucket ?? 'other',
      miles: l.distance_m != null ? l.distance_m / 1609.34 : null,
      rating: p?.rating ?? null,
      reviews: p?.user_ratings_total ?? null,
    };
  }

  const agents = run.step_results?.agent_research?.agents ?? {};
  const narrativeAngle =
    Object.values(agents as Record<string, { parsed?: { narrative_angle?: unknown } }>)
      .map((a) => a?.parsed?.narrative_angle)
      .find((v): v is string => typeof v === 'string' && v.length > 0) ?? null;

  console.log(`${community.name} — ${shots.length} shots, ${poiIds.length} POIs`);
  const before = photos?.narration?.segments ?? [];
  if (before.length > 0) {
    const hit = before.filter((s: { text: string }) => mentionsDistance(s.text)).length;
    console.log(`current script: ${before.length} lines, ${hit} carrying a distance\n`);
  }

  const fresh = await runNarration(shots, {
    communityName: community.name,
    city: community.city,
    state: community.state,
    narrativeAngle,
    seed: communityId,
    voiceOverride: community.narration_voice ?? null,
    // biome-ignore lint/suspicious/noExplicitAny: rebuilt from the DB above.
    facts: facts as any,
  });

  if (!fresh.ok || fresh.segments.length === 0) {
    // Never overwrite a working script with nothing — the same rule
    // `writeNarration` follows.
    console.error(`generation failed: ${fresh.error ?? 'no lines'} — nothing written`);
    process.exit(1);
  }

  let hit = 0;
  for (const s of fresh.segments) {
    const d = mentionsDistance(s.text);
    if (d) hit++;
    console.log(`${d ? '📏' : '  '} ${s.text}`);
  }
  console.log(`\nvoice ${fresh.voice} · ${hit}/${fresh.segments.length} lines carry a distance`);
  console.log(`warnings: ${JSON.stringify(fresh.warnings)}`);

  if (!APPLY) {
    console.log('\nDRY RUN — re-run with --apply to write it into the run.');
    return;
  }

  // Re-read: this script has been talking to a model for a while and something
  // else may have written to the run in the meantime.
  const { data: current } = await sb
    .from('community_tour_runs')
    .select('step_results')
    .eq('id', run.id)
    .maybeSingle();
  const results = current?.step_results ?? run.step_results;
  const { error } = await sb
    .from('community_tour_runs')
    .update({
      step_results: {
        ...results,
        photos: { ...results.photos, narration: { ...fresh, ran_at: new Date().toISOString() } },
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', run.id);
  if (error) throw new Error(`write failed: ${error.message}`);
  console.log(`\nwritten to run ${run.id}. Re-run Assemble to hear it.`);
}

main().catch((err) => {
  console.error('[rewrite-narration] failed:', err);
  process.exit(1);
});
