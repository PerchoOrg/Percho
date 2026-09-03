/**
 * Generate background music into the library, in bulk.
 *
 * `/api/admin/bgm/generate` already does this — but it is cookie-gated, caps a
 * request at 4 tracks and at Vercel's 300s, and this run needs 38. Same
 * library, same prompts, same review gate; a script because it is a long
 * sequential job that belongs off the request path.
 *
 * WHY 38 (owner 2026-09-03, "补曲"): phase158 measured the library and found
 * two different problems.
 *   · `piano` (3 tracks) and `electronic` (3) are simply thin, and a palette is
 *     never widened by the selector — every home built 2015+ draws from those
 *     three piano tracks and nothing else ever will.
 *   · `acoustic` has 28 tracks but only 3 tagged `moving` and 0 `still`, so
 *     phase158's MIN_ENERGY_SHARE floor throws the energy preference away and
 *     a top-decile home gets the same music as an entry-level one.
 * The plan below fixes both: it brings every vibe to a state where each energy
 * clears a quarter of its own palette, which is exactly what the floor asks
 * for.
 *
 * REVIEW IS NOT OPTIONAL and this script does not grant it. Every track lands
 * in `state.pending`, which `pull-bgm.sh` skips, so nothing here can reach a
 * film until the owner approves it in /admin/pipeline/bgm.
 *
 * ORDER MATTERS, and not for a cosmetic reason: `pull-bgm.sh` skips what the
 * sidecar lists as pending or rejected, so an object in Storage that the
 * sidecar has never heard of is treated as APPROVED. The sidecar entry is
 * therefore written BEFORE the upload — a pending entry with no object behind
 * it is inert, an object with no entry is unreviewed music in a film.
 *
 * Usage (repo-root .env.local: NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY):
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/generate-bgm.ts --plan <plan>
 *   …                                                                     --plan <plan> --apply
 *
 * `--plan` is `vibe:energy:count` items, comma separated:
 *   acoustic:moving:10,acoustic:still:13,piano:gentle:3,…
 *
 * DRY RUN BY DEFAULT. Nothing is generated or written without --apply, and a
 * dry run costs nothing — it prints the plan, the money and one sample prompt.
 *
 * Partial success is normal, not an error: Lyria's safety filter blocks the odd
 * prompt for an unspecified reason and is not reproducible about it. The script
 * reports what landed per bucket so the shortfall can be topped up by running
 * it again with a smaller plan.
 */

import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const planArg = args[args.indexOf('--plan') + 1];
const SECONDS = args.includes('--seconds') ? Number(args[args.indexOf('--seconds') + 1]) : 90;
if (!args.includes('--plan') || !planArg || planArg.startsWith('--')) {
  console.error(
    'usage: generate-bgm --plan <vibe:energy:count,…> [--apply] [--seconds 90]\n' +
      '  e.g. --plan acoustic:moving:10,piano:still:3',
  );
  process.exit(1);
}

const VIBES = ['acoustic', 'piano', 'electronic'] as const;
const ENERGIES = ['still', 'gentle', 'moving'] as const;
type Vibe = (typeof VIBES)[number];
type Energy = (typeof ENERGIES)[number];

interface PlanItem {
  vibe: Vibe;
  energy: Energy;
  count: number;
}

const plan: PlanItem[] = planArg.split(',').map((raw) => {
  const [vibe, energy, count] = raw.split(':');
  if (!VIBES.includes(vibe as Vibe)) throw new Error(`unknown vibe in plan: ${raw}`);
  if (!ENERGIES.includes(energy as Energy)) throw new Error(`unknown energy in plan: ${raw}`);
  const n = Number(count);
  if (!Number.isInteger(n) || n < 1 || n > 40) throw new Error(`bad count in plan: ${raw}`);
  return { vibe: vibe as Vibe, energy: energy as Energy, count: n };
});

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
      return [
        l.slice(0, i).trim(),
        l
          .slice(i + 1)
          .trim()
          .replace(/^["']|["']$/g, ''),
      ];
    }),
);
// `lyria.ts` reads both of these out of the environment; the script has no
// Next runtime to have loaded them.
process.env.GEMINI_API_KEY = env.GEMINI_API_KEY;
if (env.GEMINI_MUSIC_MODEL) process.env.GEMINI_MUSIC_MODEL = env.GEMINI_MUSIC_MODEL;

// biome-ignore lint/suspicious/noExplicitAny: an admin script, not app code.
const sb: any = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);
const BUCKET = 'bgm';
const STATE_PATH = '_state/state.json';

interface TrackMeta {
  title: string;
  vibe: Vibe;
  role: 'bed';
  energy: Energy;
  tags: string[];
  source: 'lyria';
  created_at: string;
}
interface State {
  schema_version: number;
  rejected: string[];
  pending: string[];
  meta: Record<string, TrackMeta>;
  updated_at: string;
}

/**
 * Read the sidecar, add one track, write it back.
 *
 * Read-modify-write per track rather than once at the end: this run takes
 * twenty minutes, and a crash at minute fifteen must not leave fifteen
 * unlisted objects behind (see the header — unlisted means approved).
 */
async function reserve(path: string, meta: TrackMeta): Promise<void> {
  const { data } = await sb.storage.from(BUCKET).download(STATE_PATH);
  const state: State = data
    ? JSON.parse(await data.text())
    : { schema_version: 1, rejected: [], pending: [], meta: {}, updated_at: '' };
  const next: State = {
    ...state,
    pending: Array.from(new Set([...(state.pending ?? []), path])).sort(),
    meta: { ...(state.meta ?? {}), [path]: meta },
    updated_at: new Date().toISOString(),
  };
  const { error } = await sb.storage
    .from(BUCKET)
    .upload(STATE_PATH, new Blob([JSON.stringify(next, null, 2)], { type: 'application/json' }), {
      contentType: 'application/json',
      upsert: true,
    });
  if (error) throw new Error(`sidecar write failed: ${error.message}`);
}

async function main() {
  const lyria = await import('../../apps/web/lib/bgm/lyria.js');
  const total = plan.reduce((n, p) => n + p.count, 0);

  console.log(`${total} tracks, $${(total * lyria.LYRIA_COST_USD).toFixed(2)}, ~${SECONDS}s each`);
  for (const p of plan) console.log(`  ${p.vibe}/${p.energy} × ${p.count}`);

  if (!APPLY) {
    const first = plan[0]!;
    console.log('\n--- dry run, nothing generated ---\nsample prompt:\n');
    console.log(lyria.buildLyriaPrompt(first.vibe, SECONDS, first.energy));
    return;
  }

  const landed: Record<string, number> = {};
  const failed: string[] = [];
  let n = 0;
  for (const item of plan) {
    const prompt = lyria.buildLyriaPrompt(item.vibe, SECONDS, item.energy);
    for (let i = 0; i < item.count; i++) {
      n++;
      const label = `${n}/${total} ${item.vibe}/${item.energy}`;
      try {
        const track = await lyria.generateLyriaTrack(prompt);
        // Named per track, not per batch: tracks off one prompt are different
        // pieces of music and should not share a name.
        const described = await lyria.describeTrack(item.vibe, item.energy);
        const title = described?.title ?? `${item.vibe} ${i + 1}`;
        const file = described
          ? lyria.namedLyriaFilename(item.vibe, title)
          : lyria.lyriaFilename(item.vibe);
        const path = `${item.vibe}/${file}`;

        await reserve(path, {
          title,
          vibe: item.vibe,
          // The fixed half of the prompt forbids swells precisely so the
          // result can sit under narration.
          role: 'bed',
          energy: item.energy,
          tags: described?.tags ?? [],
          source: 'lyria',
          created_at: new Date().toISOString(),
        });

        const { error } = await sb.storage
          .from(BUCKET)
          .upload(path, track.bytes, { contentType: 'audio/mpeg', upsert: false });
        if (error) throw new Error(error.message);

        landed[`${item.vibe}/${item.energy}`] = (landed[`${item.vibe}/${item.energy}`] ?? 0) + 1;
        console.log(`  ${label} — "${title}" ${path} (${track.bytes.length} bytes)`);
      } catch (err) {
        const why = err instanceof Error ? err.message : String(err);
        failed.push(`${item.vibe}/${item.energy}: ${why}`);
        console.warn(`  ${label} — FAILED: ${why}`);
      }
    }
  }

  const got = Object.values(landed).reduce((a, b) => a + b, 0);
  console.log(`\n${got}/${total} landed, $${(got * lyria.LYRIA_COST_USD).toFixed(2)} spent`);
  for (const [k, v] of Object.entries(landed)) console.log(`  ${k}: ${v}`);
  if (failed.length > 0) {
    console.log(`\n${failed.length} failed:`);
    for (const f of failed) console.log(`  ${f}`);
  }
  console.log('\nAll of it is PENDING — review at /admin/pipeline/bgm before any film uses it.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
