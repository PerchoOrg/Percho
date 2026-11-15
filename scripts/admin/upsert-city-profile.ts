/**
 * Write a city's profile — its fundamentals and its film script — to
 * `cities.profile`.
 *
 * The profile is a researched document (rankings, census figures, history,
 * schools, getting around, planning — every figure with its source), kept as
 * JSON under `scripts/admin/city-profiles/<slug>.json` so a change to what a
 * city page claims is a reviewable diff. This script is the only writer: it
 * refuses anything `lib/zod/city-profile.ts` does not accept, so the city page
 * and the film planner can trust what they read.
 *
 * Runs with the service role. CLAUDE.md §3 permits that here: this file lives
 * in scripts/admin/ and is invoked by hand.
 *
 * Usage, from apps/web (source .env.local first):
 *   pnpm city:profile suwanee-ga                  # reads city-profiles/suwanee-ga.json
 *   pnpm city:profile suwanee-ga --check          # validate only, write nothing
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { cityProfileSchema } from '../../apps/web/lib/zod/city-profile.js';

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
    console.error('Usage: pnpm city:profile <city-slug> [--check]');
    process.exit(1);
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const file = join(here, 'city-profiles', `${slug}.json`);
  const parsed = cityProfileSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
  if (!parsed.success) {
    console.error(`${file} does not fit the profile schema:`);
    for (const issue of parsed.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  const profile = parsed.data;
  const words = (s: string) => s.trim().split(/\s+/).length;
  console.log(
    `${slug}: ${profile.film.frames.length} frames (${profile.film.frames.reduce((a, f) => a + words(f.say), 0)} words), ` +
      `${profile.film.places.length} place lines (${profile.film.places.reduce((a, p) => a + words(p.say), 0)} words)`,
  );
  if (checkOnly) return;

  const sb = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  );
  const { data, error } = await sb
    .from('cities')
    .update({ profile, description: profile.summary, updated_at: new Date().toISOString() })
    .eq('slug', slug)
    .select('id, name');
  if (error) throw new Error(`update failed: ${error.message}`);
  if (!data?.length) throw new Error(`No city with slug "${slug}"`);
  console.log(`wrote the profile of ${data[0]?.name}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
