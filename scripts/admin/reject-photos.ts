/**
 * Reject photos by editorial judgement, marked as such.
 *
 * Since 2026-11-15 the agent makes the editorial pass on a film and the owner
 * scans the result. Those rejections used to be raw REST writes with a free
 * reason and no mark of who made them, so the admin table could not tell an
 * agent's judgement from the pipeline's own filter (phase366.6). This writes
 * `rejection_reason = "editorial: <reason>"` so it can.
 *
 * `poi_photos.status` is global for community films (per-scope review exists
 * for cities only — phase343). Use this for what is wrong anywhere: a logo, a
 * watermark, a duplicate, a dog on a path, a photo of the wrong place.
 *
 * Runs with the service role. CLAUDE.md §3 permits that here: this file lives
 * in scripts/admin/ and is invoked by hand.
 *
 * Usage, from apps/web (source .env.local first):
 *   pnpm exec tsx ../../scripts/admin/reject-photos.ts "<reason>" <photo-id> [<photo-id> …]
 */
import { createClient } from '@supabase/supabase-js';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}. Source .env.local first.`);
  return v;
}

async function main() {
  const [reason, ...ids] = process.argv.slice(2);
  if (!reason || ids.length === 0) {
    console.error('Usage: reject-photos.ts "<reason>" <photo-id> [<photo-id> …]');
    process.exit(1);
  }
  const sb = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  );
  const { data, error } = await sb
    .from('poi_photos')
    .update({
      status: 'rejected',
      rejection_reason: `editorial: ${reason}`,
      reviewed_at: new Date().toISOString(),
    })
    .in('id', ids)
    .select('id');
  if (error) throw new Error(error.message);
  const found = new Set((data ?? []).map((r) => r.id as string));
  for (const id of ids) console.log(`${found.has(id) ? 'rejected' : 'NOT FOUND'} ${id}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
