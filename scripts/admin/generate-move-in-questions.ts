/**
 * Answer the move-in question bank for one listing and (optionally) store it.
 *
 * `docs/design/move-in-questions.md` §6: generation is an offline job, never a
 * request path — one search-grounded Gemini call takes tens of seconds. This
 * is that job, run by hand, one listing per invocation.
 *
 * Runs with the service-role key. CLAUDE.md §3 permits that here: this file
 * lives in scripts/admin/ and is invoked by hand. Nothing reachable from a
 * browser writes `listing_questions`.
 *
 * Usage (env from the repo-root .env.local, or PERCHO_ENV_FILE), from apps/web:
 *   pnpm questions <listingIdOrSlug>             # DRY RUN: prints, stores nothing
 *   pnpm questions <listingIdOrSlug> --write     # stores as draft
 *   pnpm questions <listingIdOrSlug> --approve   # stores as approved (owner has read it)
 *   pnpm questions <listingIdOrSlug> --approve-drafts   # no model call: flips drafts → approved
 *   … --model gemini-2.5-pro                     # override GEMINI_MODEL for this job
 *   … --raw                                      # also print the model's reply verbatim
 *
 * `--write` / `--approve` UPSERT on (listing, question): re-running replaces
 * the previous answer for each question the model answered this time and
 * leaves the others alone.
 */

import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const argv = process.argv.slice(2);
const target = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--model');
const WRITE = argv.includes('--write');
const APPROVE = argv.includes('--approve');
const APPROVE_DRAFTS = argv.includes('--approve-drafts');
const RAW = argv.includes('--raw');
const MODEL = (() => {
  const i = argv.indexOf('--model');
  return i >= 0 ? argv[i + 1] : undefined;
})();
if (!target) {
  console.error(
    'usage: generate-move-in-questions <listingIdOrSlug> [--write | --approve | --approve-drafts]',
  );
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
      return [
        l.slice(0, i).trim(),
        l
          .slice(i + 1)
          .trim()
          .replace(/^["']|["']$/g, ''),
      ];
    }),
);
// The generator reads these from the environment, exactly as it does on Vercel.
for (const k of ['GEMINI_API_KEY', 'GEMINI_MODEL']) if (env[k]) process.env[k] = env[k];

const isUuid = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

async function main() {
  // biome-ignore lint/suspicious/noExplicitAny: an admin script, not app code.
  const sb: any = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: listing, error } = await sb
    .from('listings')
    .select(
      'id, slug, address, city, state, zip, neighborhood, price, beds, baths, sqft, year_built, lot_size, hoa, description',
    )
    .eq(isUuid(target as string) ? 'id' : 'slug', target)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!listing) {
    console.error(`no listing ${target}`);
    process.exit(1);
  }

  if (APPROVE_DRAFTS) {
    const { data, error: e } = await sb
      .from('listing_questions')
      .update({ status: 'approved', reviewed_at: new Date().toISOString() })
      .eq('listing_id', listing.id)
      .eq('status', 'draft')
      .select('question_id');
    if (e) throw new Error(e.message);
    console.log(`approved ${data?.length ?? 0} draft answer(s) for ${listing.address}`);
    return;
  }

  const [{ data: photos }, { data: mls }] = await Promise.all([
    sb.from('listing_photos').select('ai_tags').eq('listing_id', listing.id).eq('status', 'ready'),
    sb
      .from('mls_listings')
      .select('days_on_market')
      .eq('our_listing_id', listing.id)
      .limit(1)
      .maybeSingle(),
  ]);
  const photoCaptions = (photos ?? [])
    .map((p: { ai_tags?: { caption?: string | null; usable?: boolean | null } | null }) =>
      p.ai_tags?.usable === false ? null : p.ai_tags?.caption,
    )
    .filter((c: unknown): c is string => typeof c === 'string' && c.length > 0);

  const { generateListingQuestions } = await import('../../apps/web/lib/questions/generate.js');
  const facts = {
    address: listing.address,
    city: listing.city,
    state: listing.state,
    ...(listing.zip ? { zip: listing.zip } : {}),
    ...(listing.neighborhood ? { neighborhood: listing.neighborhood } : {}),
    ...(listing.price ? { price: listing.price } : {}),
    ...(listing.beds ? { beds: listing.beds } : {}),
    ...(listing.baths ? { baths: listing.baths } : {}),
    ...(listing.sqft ? { sqft: listing.sqft } : {}),
    ...(listing.year_built ? { yearBuilt: listing.year_built } : {}),
    ...(listing.lot_size ? { lotSize: listing.lot_size } : {}),
    ...(listing.hoa ? { hoa: listing.hoa } : {}),
    ...(listing.description?.length ? { description: listing.description } : {}),
    ...(mls?.days_on_market != null ? { daysOnMarket: mls.days_on_market } : {}),
    ...(photoCaptions.length ? { photoCaptions } : {}),
  };

  console.log(`# ${listing.address}, ${listing.city} ${listing.state} — ${listing.id}\n`);
  const started = Date.now();
  const modelName = MODEL ?? process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
  const result = await generateListingQuestions(facts, MODEL ? { model: MODEL } : {});
  console.log(`(${Math.round((Date.now() - started) / 1000)}s, model ${modelName})\n`);
  if (RAW || result.accepted.length === 0) {
    // A reply that produced nothing storable is only debuggable from its text.
    console.log('## model reply (verbatim)');
    console.log(result.rawText.slice(0, 4000));
    console.log();
  }

  for (const a of result.accepted) {
    console.log(`## ${a.question_id}  [${a.form} · decisiveness ${a.decisiveness}]`);
    console.log(a.answer);
    console.log(
      `  Based on: ${a.basis.map((b) => `${b.type}: ${b.note}${b.url ? ` <${b.url}>` : ''}`).join(' · ')}`,
    );
    if (a.verify) console.log(`  ▸ ${a.verify}`);
    console.log();
  }
  if (result.rejected.length) {
    console.log('## rejected');
    for (const r of result.rejected) console.log(`- ${r.id}: ${r.reason}`);
    console.log();
  }
  if (result.sources.length) {
    console.log('## pages the model read');
    for (const s of result.sources) console.log(`- ${s.title ?? ''} ${s.url}`);
    console.log();
  }
  console.log(`accepted ${result.accepted.length} · rejected ${result.rejected.length}`);

  if (!WRITE && !APPROVE) {
    console.log('\nDRY RUN — nothing stored. Re-run with --write (draft) or --approve.');
    return;
  }
  if (result.accepted.length === 0) {
    console.log('\nnothing to store.');
    return;
  }
  const status = APPROVE ? 'approved' : 'draft';
  const rows = result.accepted.map((a) => ({
    listing_id: listing.id,
    question_id: a.question_id,
    answer: a.answer,
    basis: a.basis,
    verify: a.verify,
    form: a.form,
    decisiveness: a.decisiveness,
    scope: a.scope,
    status,
    model: modelName,
    generated_at: new Date().toISOString(),
    ...(APPROVE ? { reviewed_at: new Date().toISOString() } : {}),
  }));
  const { error: upErr } = await sb
    .from('listing_questions')
    .upsert(rows, { onConflict: 'listing_id,question_id' });
  if (upErr) throw new Error(upErr.message);
  console.log(`\nstored ${rows.length} answer(s) as ${status}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
