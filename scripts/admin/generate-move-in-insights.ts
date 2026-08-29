/**
 * Research one home (or a batch) with Codex and store its "After you move in"
 * cards.
 *
 * Runs with the service-role key. CLAUDE.md §3 permits that here: this file
 * lives in scripts/admin/ and is invoked by hand. Nothing reachable from a
 * browser writes `listing_insights`.
 *
 * Usage (env from the repo-root .env.local, or PERCHO_ENV_FILE), from apps/web:
 *   pnpm insights <listingIdOrSlug>              # DRY RUN: prints, stores nothing
 *   pnpm insights <listingIdOrSlug> --write      # stores as draft
 *   pnpm insights <listingIdOrSlug> --approve    # stores as approved (a person has read it)
 *   pnpm insights <listingIdOrSlug> --approve-drafts   # no research: flips drafts → approved
 *   pnpm insights --all --limit 10 --write       # active listings with no cards yet, newest first
 *   … --model gpt-5.6-sol --reasoning medium     # Codex knobs (these are the defaults)
 *
 * A re-run for a listing REPLACES its existing rows of the status being
 * written (draft or approved) — the job is the unit, not the card.
 *
 * One home takes ~3 minutes and ~130k Codex tokens; `--all` runs them one
 * after another and can be stopped and resumed (already-covered listings are
 * skipped).
 */

import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const argv = process.argv.slice(2);
function flag(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}
const VALUE_FLAGS = new Set(['--limit', '--model', '--reasoning']);
const target = argv.find((a, i) => !a.startsWith('--') && !VALUE_FLAGS.has(argv[i - 1] ?? ''));
const ALL = argv.includes('--all');
const WRITE = argv.includes('--write');
const APPROVE = argv.includes('--approve');
const APPROVE_DRAFTS = argv.includes('--approve-drafts');
const LIMIT = Number(flag('limit') ?? '5');
const MODEL = flag('model');
const REASONING = flag('reasoning') as 'low' | 'medium' | 'high' | undefined;
if (!target && !ALL) {
  console.error(
    'usage: generate-move-in-insights (<listingIdOrSlug> | --all [--limit N]) [--write | --approve | --approve-drafts] [--model M] [--reasoning low|medium|high]',
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

const isUuid = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

const LISTING_COLUMNS =
  'id, slug, address, city, state, zip, neighborhood, price, beds, baths, sqft, year_built, lot_size, hoa, description';

// biome-ignore lint/suspicious/noExplicitAny: an admin script, not app code.
type Listing = any;

async function main() {
  // biome-ignore lint/suspicious/noExplicitAny: an admin script, not app code.
  const sb: any = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { buildInsightsPrompt } = await import('../../apps/web/lib/insights/prompt.js');
  const { parseInsightBatch } = await import('../../apps/web/lib/insights/parse.js');
  const { runCodex, DEFAULT_CODEX_MODEL, DEFAULT_CODEX_REASONING } = await import(
    '../../apps/web/lib/insights/codex.js'
  );

  const listings: Listing[] = [];
  if (ALL) {
    const { data: rows, error } = await sb
      .from('listings')
      .select(LISTING_COLUMNS)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(400);
    if (error) throw new Error(error.message);
    const { data: covered } = await sb
      .from('listing_insights')
      .select('listing_id')
      .in('status', ['draft', 'approved']);
    const done = new Set((covered ?? []).map((r: { listing_id: string }) => r.listing_id));
    for (const r of rows ?? []) {
      if (!done.has(r.id)) listings.push(r);
      if (listings.length >= LIMIT) break;
    }
    console.log(`${listings.length} listing(s) without cards (limit ${LIMIT})\n`);
  } else {
    const { data, error } = await sb
      .from('listings')
      .select(LISTING_COLUMNS)
      .eq(isUuid(target as string) ? 'id' : 'slug', target)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      console.error(`no listing ${target}`);
      process.exit(1);
    }
    listings.push(data);
  }

  if (APPROVE_DRAFTS) {
    for (const l of listings) {
      const { data, error } = await sb
        .from('listing_insights')
        .update({ status: 'approved', reviewed_at: new Date().toISOString() })
        .eq('listing_id', l.id)
        .eq('status', 'draft')
        .select('id');
      if (error) throw new Error(error.message);
      console.log(`approved ${data?.length ?? 0} draft card(s) for ${l.address}`);
    }
    return;
  }

  const model = MODEL ?? DEFAULT_CODEX_MODEL;
  const reasoning = REASONING ?? DEFAULT_CODEX_REASONING;
  let stored = 0;
  for (const listing of listings) {
    console.log(`# ${listing.address}, ${listing.city} ${listing.state} — ${listing.id}`);
    const [{ data: photos }, { data: mls }] = await Promise.all([
      sb
        .from('listing_photos')
        .select('ai_tags')
        .eq('listing_id', listing.id)
        .eq('status', 'ready'),
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

    const prompt = buildInsightsPrompt({
      address: listing.address,
      city: listing.city,
      state: listing.state,
      ...(listing.zip ? { zip: listing.zip } : {}),
      ...(listing.neighborhood ? { neighborhood: listing.neighborhood } : {}),
      ...(listing.price ? { price: listing.price } : {}),
      ...(listing.beds != null ? { beds: Number(listing.beds) } : {}),
      ...(listing.baths != null ? { baths: Number(listing.baths) } : {}),
      ...(listing.sqft ? { sqft: listing.sqft } : {}),
      ...(listing.year_built ? { yearBuilt: listing.year_built } : {}),
      ...(listing.lot_size ? { lotSize: listing.lot_size } : {}),
      ...(listing.hoa ? { hoa: listing.hoa } : {}),
      ...(listing.description?.length ? { description: listing.description } : {}),
      ...(mls?.days_on_market != null ? { daysOnMarket: mls.days_on_market } : {}),
      ...(photoCaptions.length ? { photoCaptions } : {}),
    });

    let run: Awaited<ReturnType<typeof runCodex>>;
    try {
      run = await runCodex(prompt, { model, reasoning });
    } catch (err) {
      console.error(`  codex failed: ${err instanceof Error ? err.message : String(err)}\n`);
      continue;
    }
    const result = parseInsightBatch(run.text);
    console.log(
      `(${run.seconds}s · ${run.searches} searches · ${run.tokens?.toLocaleString('en-US') ?? '?'} tokens · ${run.model} ${run.reasoning})\n`,
    );
    for (const c of result.accepted) {
      console.log(`[${c.kind}] [${c.theme} ·${c.decisiveness}] ${c.headline}`);
      console.log(`    ${c.detail}`);
      if (c.verify) console.log(`    ▸ ${c.verify}`);
      console.log(`    ${c.basis.map((b) => `${b.note} <${b.url}>`).join(' · ')}`);
    }
    if (result.rejected.length) {
      console.log('rejected:');
      for (const r of result.rejected) console.log(`  - ${r.headline}: ${r.reason}`);
    }
    if (result.accepted.length === 0) {
      console.log('model reply (verbatim):');
      console.log(run.text.slice(0, 3000));
    }
    console.log(`accepted ${result.accepted.length} · rejected ${result.rejected.length}\n`);

    if (!WRITE && !APPROVE) continue;
    if (result.accepted.length === 0) continue;
    const status = APPROVE ? 'approved' : 'draft';
    const now = new Date().toISOString();
    const { error: delErr } = await sb
      .from('listing_insights')
      .delete()
      .eq('listing_id', listing.id)
      .eq('status', status);
    if (delErr) throw new Error(delErr.message);
    const { error: insErr } = await sb.from('listing_insights').insert(
      result.accepted.map((c) => ({
        listing_id: listing.id,
        headline: c.headline,
        detail: c.detail,
        kind: c.kind,
        theme: c.theme,
        verify: c.verify,
        basis: c.basis,
        decisiveness: c.decisiveness,
        status,
        model: `codex:${run.model}/${run.reasoning}`,
        generated_at: now,
        ...(APPROVE ? { reviewed_at: now } : {}),
      })),
    );
    if (insErr) throw new Error(insErr.message);
    stored += result.accepted.length;
    console.log(`stored ${result.accepted.length} card(s) as ${status}.\n`);
  }
  if (!WRITE && !APPROVE)
    console.log('DRY RUN — nothing stored. Re-run with --write (draft) or --approve.');
  else console.log(`done: ${stored} card(s) stored across ${listings.length} listing(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
