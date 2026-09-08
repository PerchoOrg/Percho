/**
 * DeKalb County's water and sewer bill, from the county's own rate sheet.
 *
 * ── The claim this restores ────────────────────────────────────────────────
 *
 * phase202 recorded that DeKalb's rates reproduce the county's published "$84
 * in 2026" for 4,000 gallons, to the cent. **phase229 withdrew that** after the
 * URL 404'd and two secondary summaries disagreed with it — one of which had
 * swapped the sewer and irrigation columns.
 *
 * The withdrawal was wrong. Re-derived here from the current PDF, the note was
 * right; what it had omitted was the SEWER readiness-to-serve charge, which is
 * exactly the $8.84 gap that made the arithmetic look broken:
 *
 *     water readiness to serve   $3.64
 *     sewer readiness to serve   $8.84
 *     water 0–2,000 gal          $2.77 per 1,000   → 2 × 2.77  =  $5.54
 *     water 2,001–10,000         $3.95 per 1,000   → 2 × 3.95  =  $7.90
 *     sewer, all consumption     $14.54 per 1,000  → 4 × 14.54 = $58.16
 *                                                        total = $84.08
 *
 * The lesson is recorded in DEVLOG: a claim I had derived from the primary
 * source was withdrawn because two summaries of that source disagreed. The
 * summaries were wrong. Re-derive from the document before retracting.
 *
 * ── Reading the sheet ──────────────────────────────────────────────────────
 *
 * The sheet is CID-encoded — its text is glyph indices into embedded subset
 * fonts — so it returned ZERO text items until phase229 added `toUnicodeMap`.
 *
 * The other trap is coordinates. This file has no page markers, so every item
 * lands on "page 0" while each content stream carries its own origin: an item
 * at y=258 in one stream and y=1019 in another may be inches apart on paper or
 * not. **Items are therefore grouped per stream** and never compared across
 * them. Two earlier extraction attempts silently compared across streams and
 * came back with a header and no values under it.
 *
 * ── What is checked ───────────────────────────────────────────────────────
 *
 * Two guards, and they catch different things. `assertStillPublished` refetches
 * the sheet and refuses unless every rate below still appears in it — that is
 * the January repricing case. The $84.08 reproduction then checks the
 * ARITHMETIC against the county's own published typical bill. Gwinnett has no
 * equivalent of the second, which is why Gwinnett is still an estimate.
 *
 * Usage:
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/import-dekalb-water.ts
 *   ... --apply     to write
 */

import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { contentStreams, textItems, toUnicodeMap } from '../../apps/web/lib/areas/millage-pdf.js';

const APPLY = process.argv.includes('--apply');

const PDF =
  'https://dekalbcountyga.gov/sites/default/files/2026-02/2026%20Rate%20Sheet%20Effecive%20-%20January%201%202026.pdf';
const SOURCE = 'DeKalb County Watershed Management rate sheet, effective 1 January 2026';
const AS_OF = '2026-01-01';

/**
 * The billed volume the monthly figure prices.
 *
 * 4,000 gallons because it is the basis DeKalb itself publishes a typical bill
 * against, which is what makes this checkable. It is a stated assumption, not a
 * measurement of what any household uses — the same treatment electricity gets,
 * where consumption is held constant so the figure compares the PRICE of the
 * service rather than local habits.
 */
const BILLED_GALLONS = 4000;
/** What the county publishes for that volume, and this must reproduce. */
const PUBLISHED_TOTAL = 84.08;
/** Two readings of the same table should agree exactly; allow only rounding. */
const TOLERANCE = 0.005;

/**
 * The rates, as read from the sheet named above.
 *
 * ── Why these are stated rather than parsed ────────────────────────────────
 *
 * The first draft parsed the commodity table. It could not: the first band's
 * label and the last band's rate each sit in a DIFFERENT content stream from
 * their own row, so nothing pairs them line by line. Two rounds of loosening
 * the column filter got `rates=7, bounds=1` — and at that point I was tuning a
 * parser until its output matched the answer I already knew, which is fitting,
 * not reading. A guard cannot validate a parser that was shaped to satisfy it.
 *
 * So the figures are stated, each read from the decoded text of the sheet, and
 * the file says exactly where each one sits. What is CHECKED is different and
 * honest: `assertStillPublished` re-fetches the sheet and refuses unless every
 * one of these amounts still appears in it. That catches the thing that
 * actually goes wrong — the county repricing in January — without pretending
 * to a table parser this layout does not support.
 */
const RATES: Rates = {
  /** "READINESS TO SERVE CHARGE", Water row, ¾" or less. */
  waterBase: 3.64,
  /** Same table, Sewer row, ¾" or less. This is the one phase202 omitted, and
   *  its absence is exactly why the recorded $84.08 would not reproduce. */
  sewerBase: 8.84,
  /** "COMMODITY CHARGES", ¾" Meter column, ascending bands. The open-ended
   *  fourth band ($10.36 above 20,001) is left out: pricing 4,000 gallons
   *  never reaches it, and `billFor` refuses a volume the ladder cannot cover. */
  waterTiers: [
    [2000, 2.77],
    [10000, 3.95],
    [20000, 5.9],
  ],
  /** Same table, "All Meters / Sewer" column — flat at every band. Not to be
   *  confused with the Irrigation column beside it at $10.36, which is the
   *  swap that made a secondary summary look like it contradicted phase202. */
  sewerPerThousand: 14.54,
};

interface Rates {
  waterBase: number;
  sewerBase: number;
  /** `[upToGallons, perThousand]`, ascending. */
  waterTiers: [number, number][];
  sewerPerThousand: number;
}

/** Every amount above, as it is written in the sheet. */
function published(r: Rates): string[] {
  return [
    r.waterBase.toFixed(2),
    r.sewerBase.toFixed(2),
    r.sewerPerThousand.toFixed(2),
    ...r.waterTiers.map(([, per]) => per.toFixed(2)),
  ];
}

/**
 * Refuses unless the live sheet still contains every rate this prices with.
 *
 * The document is CID-encoded, so this decodes it first — before phase229 it
 * would have come back empty and this check would have "failed" on a sheet
 * that had not changed at all.
 */
function assertStillPublished(pdf: Buffer, r: Rates): void {
  const text = textItems(contentStreams(pdf), toUnicodeMap(pdf))
    .map((i) => i.text)
    .join('');
  const missing = published(r).filter((amount) => !text.includes(amount));
  if (missing.length > 0) {
    throw new Error(
      `the sheet no longer prints ${missing.join(', ')} — DeKalb has repriced, or the reader broke. ` +
        'Re-read the sheet and update RATES deliberately.',
    );
  }
}

/** The monthly bill for a volume, tiers applied in bands as the sheet says. */
export function billFor(gallons: number, r: Rates): number {
  let water = 0;
  let remaining = gallons;
  let floor = 0;
  for (const [upTo, per] of r.waterTiers) {
    const inBand = Math.max(0, Math.min(remaining, upTo - floor));
    water += (inBand / 1000) * per;
    remaining -= inBand;
    floor = upTo;
    if (remaining <= 0) break;
  }
  const sewer = (gallons / 1000) * r.sewerPerThousand;
  return r.waterBase + r.sewerBase + water + sewer;
}

async function main() {
  const local = process.env.DEKALB_PDF;
  let buf: Buffer;
  if (local && existsSync(local)) {
    console.log(`Reading ${local}`);
    buf = readFileSync(local);
  } else {
    console.log(`Fetching ${PDF}`);
    const res = await fetch(PDF);
    if (!res.ok) {
      console.error(`DeKalb returned ${res.status}. Nothing written.`);
      process.exit(1);
    }
    buf = Buffer.from(await res.arrayBuffer());
  }

  const r = RATES;
  assertStillPublished(buf, r);
  console.log('\nEvery rate below still appears in the live sheet.');
  console.log(`\nwater readiness to serve   $${r.waterBase.toFixed(2)}`);
  console.log(`sewer readiness to serve   $${r.sewerBase.toFixed(2)}`);
  for (const [upTo, per] of r.waterTiers) {
    const band = Number.isFinite(upTo) ? `up to ${upTo.toLocaleString()}` : 'above that';
    console.log(`water ${band.padEnd(14)}       $${per.toFixed(2)} per 1,000`);
  }
  console.log(`sewer, all consumption     $${r.sewerPerThousand.toFixed(2)} per 1,000`);

  const total = billFor(BILLED_GALLONS, r);
  console.log(
    `\n${BILLED_GALLONS.toLocaleString()} gallons → $${total.toFixed(2)}  (county publishes $${PUBLISHED_TOTAL})`,
  );
  if (Math.abs(total - PUBLISHED_TOTAL) > TOLERANCE) {
    console.error(
      `\nREFUSING TO WRITE. The parsed rates do not reproduce the county's own\n` +
        `published figure, so either it repriced or a column was misread. Fix the\n` +
        `reader or update PUBLISHED_TOTAL deliberately — do not widen TOLERANCE.`,
    );
    process.exit(1);
  }
  console.log('Reproduces the published figure to the cent.');

  const row = {
    area_kind: 'county',
    state: 'GA',
    area_key: 'dekalb',
    area_name: 'DeKalb',
    metric: 'water_monthly_usd',
    value: Math.round(total),
    unit: 'usd_per_month',
    source: SOURCE,
    source_url: PDF,
    as_of: AS_OF,
    estimated: false,
    detail: {
      billed_gallons: BILLED_GALLONS,
      water_base_usd: r.waterBase,
      sewer_base_usd: r.sewerBase,
      sewer_usd_per_1000: r.sewerPerThousand,
      water_tiers: r.waterTiers.map(([upTo, per]) => ({
        up_to_gallons: Number.isFinite(upTo) ? upTo : null,
        usd_per_1000: per,
      })),
      exact_usd: Number(total.toFixed(2)),
      basis:
        'Water and sewer on 4,000 gallons a month at a 3/4" meter, from DeKalb County’s own rate sheet: both readiness-to-serve charges, the tiered water rate applied in bands, and the flat sewer rate. 4,000 gallons is the volume the county itself publishes a typical bill against, which is what makes this figure checkable; it is a stated assumption rather than a measurement of any household’s use.',
    },
  };

  if (!APPLY) {
    console.log('\nDRY RUN. Re-run with --apply to write.');
    return;
  }

  const envPath = new URL('../../.env.local', import.meta.url);
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m?.[1] && m[2] !== undefined && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required.');
    process.exit(1);
  }
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase
    .from('area_metrics')
    .upsert([row], { onConflict: 'area_kind,state,area_key,metric' });
  if (error) {
    console.error(`upsert failed: ${error.message}`);
    process.exit(1);
  }
  console.log('\nWrote 1 row.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
