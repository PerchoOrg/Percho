/**
 * Re-assemble a community tour from the cut it already shipped.
 *
 * Written for phase174, where the render worker stopped burning the place-name
 * pill into the film (the phone draws it now). Every assembly rendered before
 * 2026-09-05 still has that pill IN its pixels, so those films would show two
 * labels — the video's and the app's — until they are put through ffmpeg again.
 *
 * This is the NARROW re-render, not `pnpm tour --steps assemble`:
 *
 *   · It copies `ordered_clips` verbatim from the community's latest READY
 *     assembly. The shot list is not re-planned, so the new film is the same
 *     cut, the same length and the same order as the one the owner reviewed.
 *   · It touches no clip. Ken Burns / DepthFlow / Seedance renders are read
 *     from storage exactly as they are — in particular NOTHING re-calls the
 *     paid Seedance engine, which is the standing rule for these tours.
 *   · `narration` and `bgm` ride along on the row, so the voice and the music
 *     are the ones written against that cut.
 *
 * The insert is all it does; the render worker picks the row up on its next
 * poll and the assembly appears as `ready` with a new `cf_stream_uid`. The feed
 * reads the LATEST ready assembly per community, so the new film replaces the
 * old one with no further step.
 *
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/reassemble-community-tours.ts --slug windward
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/reassemble-community-tours.ts --all [--dry-run]
 */
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY)
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');

const sb = createClient(URL, KEY);

/** Timestamped, like `rerun-home-tours.ts` — these lines are read against the
 *  render worker's own log, which is where the renders themselves report. */
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const ALL = argv.includes('--all');
const slugFlag = argv.indexOf('--slug');
const SLUG = slugFlag >= 0 ? argv[slugFlag + 1] : undefined;

if (!ALL && !SLUG) {
  console.error('Usage: --slug <community-slug> | --all [--dry-run]');
  process.exit(1);
}

interface AssemblyRow {
  id: string;
  community_id: string;
  run_id: string;
  created_at: string;
  ordered_clips: unknown;
  photos_dropped: unknown;
  narration: unknown;
  bgm: unknown;
}

async function main() {
  // Newest first, so the first row seen per community is the film that ships.
  const { data, error } = await sb
    .from('tour_assemblies')
    .select('id, community_id, run_id, created_at, ordered_clips, photos_dropped, narration, bgm')
    .eq('status', 'ready')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  const latest = new Map<string, AssemblyRow>();
  for (const row of (data ?? []) as AssemblyRow[]) {
    if (!latest.has(row.community_id)) latest.set(row.community_id, row);
  }

  const { data: communities, error: cErr } = await sb
    .from('communities')
    .select('id, name, slug')
    .in('id', [...latest.keys()]);
  if (cErr) throw new Error(cErr.message);
  const byId = new Map(
    ((communities ?? []) as Array<{ id: string; name: string; slug: string }>).map((c) => [
      c.id,
      c,
    ]),
  );

  const targets = [...latest.values()].filter((row) =>
    SLUG ? byId.get(row.community_id)?.slug === SLUG : true,
  );
  if (targets.length === 0) {
    console.error(SLUG ? `No ready assembly for slug "${SLUG}".` : 'No ready assemblies.');
    process.exit(1);
  }

  for (const row of targets) {
    const c = byId.get(row.community_id);
    const clips = Array.isArray(row.ordered_clips) ? row.ordered_clips.length : 0;
    const label = `${c?.name ?? row.community_id} (${c?.slug ?? '?'})`;
    if (DRY) {
      log(`would re-assemble ${label}: ${clips} clips, from ${row.created_at.slice(0, 10)}`);
      continue;
    }
    const { data: ins, error: insErr } = await sb
      .from('tour_assemblies')
      .insert({
        community_id: row.community_id,
        run_id: row.run_id,
        status: 'pending',
        ordered_clips: row.ordered_clips,
        photos_dropped: row.photos_dropped,
        narration: row.narration,
        bgm: row.bgm,
      })
      .select('id')
      .single();
    if (insErr) throw new Error(`${label}: ${insErr.message}`);
    log(`queued ${label}: ${clips} clips → assembly ${(ins as { id: string }).id}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
