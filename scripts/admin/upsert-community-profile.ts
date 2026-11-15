/**
 * Write a community's profile — what its explore page says — to
 * `communities.profile`.
 *
 * The profile is a researched document (verdict, rankings, home value, what
 * the dues cover, residents' words, events, links — every figure with its
 * source), kept as JSON under `scripts/admin/community-profiles/<slug>.json`
 * so a change to what a community page claims is a reviewable diff. This
 * script is the only writer: it refuses anything
 * `lib/zod/community-profile.ts` does not accept, so the page can trust what
 * it reads.
 *
 * Runs with the service role. CLAUDE.md §3 permits that here: this file lives
 * in scripts/admin/ and is invoked by hand.
 *
 * Usage, from apps/web (source .env.local first):
 *   pnpm community:profile windward             # reads community-profiles/windward.json
 *   pnpm community:profile windward --check     # validate only, write nothing
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { communityProfileSchema } from '../../apps/web/lib/zod/community-profile.js';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}. Source .env.local first.`);
  return v;
}

async function main() {
  const argv = process.argv.slice(2);
  const slug = argv.find((a) => !a.startsWith('--'));
  const checkOnly = argv.includes('--check');
  if (!slug) {
    console.error('Usage: pnpm community:profile <community-slug> [--check]');
    process.exit(1);
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const file = join(here, 'community-profiles', `${slug}.json`);
  const parsed = communityProfileSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
  if (!parsed.success) {
    console.error(`${file} does not fit the profile schema:`);
    for (const issue of parsed.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  const profile = parsed.data;
  const blocks = (['ranks', 'homeValue', 'dues', 'words', 'events', 'links'] as const).filter(
    (k) => profile[k],
  );
  console.log(`${slug}: verdict + ${blocks.join(', ')} (as of ${profile.asOf})`);
  if (checkOnly) return;

  const sb = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  );
  const { data, error } = await sb
    .from('communities')
    .update({ profile, updated_at: new Date().toISOString() })
    .eq('slug', slug)
    .select('id, name');
  if (error) throw new Error(`update failed: ${error.message}`);
  if (!data?.length) throw new Error(`No community with slug "${slug}"`);
  console.log(`wrote the profile of ${data[0]?.name}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
