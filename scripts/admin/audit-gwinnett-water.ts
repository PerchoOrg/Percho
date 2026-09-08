/**
 * How far the Gwinnett water rate schedule can actually be read — and where it
 * still stops short.
 *
 * Read-only. Writes nothing. Run it to re-derive the state below rather than
 * trusting this comment.
 *
 * ── Why Gwinnett ───────────────────────────────────────────────────────────
 *
 * Water is the last cost line that is still an unsourced estimate. DeKalb's
 * method is validated — its tiers reproduce the county's own published "$84 in
 * 2026" for 4,000 gallons to the cent — so the blocker was never the maths, it
 * was reading other counties' rate sheets. Gwinnett is the highest-value single
 * county left: about a million people and, per the USGS figures imported in
 * phase220, **100% of them on public supply**, so a water bill there applies to
 * essentially every household.
 *
 * ── What changed since the first attempt ───────────────────────────────────
 *
 * phase202 recorded: "our reader parses it, but it is an 11-section
 * multi-column fee schedule — row clustering interleaves the water tiers with
 * meter fees, TV inspection charges and system development fees. I could not
 * say which is the 3/4" water base and which the sewer volumetric."
 *
 * The reader has since been fixed three times (phase212: embedded fonts
 * accepted as content streams, catastrophic backtracking in the TJ pattern, and
 * an early `continue` that skipped the loop's own advance). It now yields 2,305
 * text items in 155 clustered rows, and the numbers can be placed by x.
 *
 * ── What is now readable, and the argument for it ──────────────────────────
 *
 * Two rate tables sit SIDE BY SIDE at overlapping y, which is what defeated
 * row clustering. They separate cleanly by x:
 *
 *   header y≈373   Base Water Charge (x≈117)   Base Sewer Charge (x≈219)
 *   header y≈405   Tier 1 (x≈353)   Tier 2 (x≈467)   Tier 3 (x≈571)
 *   bands          (0–8,000)        (8,001–12,000)   (12,001+) gallons
 *
 * The table aligned to that three-tier header runs 3/4" to 2", and every row in
 * it carries the SAME tier rates and the same base sewer charge — only the base
 * WATER charge scales with meter size:
 *
 *   3/4"   $7.50      1"   $16.50      1 1/2"   $27.00      2"   $52.50
 *
 * The other table, at x≈381/521, has only two tier columns and different tier
 * values ($5.78 / $9.43).
 *
 * ── How confident this is, honestly ────────────────────────────────────────
 *
 * My first draft of this comment claimed the three-tier table "contains only
 * the 3/4" and 1" meter rows — the two sizes houses use", and offered that as
 * the argument for it being residential. **Running the script disproved it**:
 * the table runs to 2". The claim was written from a partial dump before the
 * extraction existed, which is exactly the kind of thing this script is for.
 *
 * What is left is weaker and worth stating as such: a three-tier escalating
 * structure starting at the smallest meter size is how residential schedules
 * read, and 1.5×/2.0× steps are a residential conservation ladder rather than a
 * commercial one. That is suggestive. It is not proof, and it is not the basis
 * on which a number should be published.
 *
 * That gives, for a 3/4" meter in the three-tier table:
 *
 *   base water charge      $7.50 / month
 *   base sewer charge      $7.50 / month
 *   water, tier 1          $5.78 per 1,000 gal   (0–8,000)
 *   water, tier 2          $8.67 per 1,000 gal   (8,001–12,000)   = 1.5 × tier 1
 *   water, tier 3          $11.56 per 1,000 gal  (12,001+)        = 2.0 × tier 1
 *
 * The exact 1.5× and 2.0× steps corroborate that those three are one escalating
 * series rather than three numbers that happen to be adjacent.
 *
 * ── UPDATE, phase238: the reading above is CONTRADICTED ────────────────────
 *
 * Two things changed after this file was written.
 *
 * **Gwinnett is no longer blocked.** phase232 imported the UNC EFC / GEFA
 * statewide survey, which prices Gwinnett at **$68.18** for 4,000 gallons in
 * January 2022 — so the county already carries a real published figure, and
 * reading its 2026 sheet is now an upgrade in currency, not a fix for a gap.
 *
 * **And that survey figure is the anchor this file said did not exist — which
 * the reading above fails.** Escalating $68.18 at the ~6% a year that DeKalb's
 * own 2022→2026 figures show gives roughly $86 for 2026. The tiers read above
 * give:
 *
 *     base water $7.50 + base sewer $7.50 + 4,000 gal at $5.78  =  $38.12
 *
 * A factor of two apart. So the identification is wrong somewhere, and the
 * missing sewer volumetric is not the whole of it.
 *
 * **The sewer volumetric is not in the document.** Searched every content
 * stream for a line mentioning "Sewer" alongside a per-1,000-style amount: the
 * only hits in all eleven pages are TV-inspection fees, $1.00 and $0.46 per
 * linear foot. The residential table's header is exactly `Meter Size | Base
 * Water Charge | Base Sewer Charge | Tier 1 | Tier 2 | Tier 3`, all three tiers
 * labelled "Cost per 1,000 Gallons" — no sewer volumetric column, unlike the
 * commercial table beside it which has "Cost per 1,000 Gallons of Water"
 * ($5.78) and "Sewer Charge per 1,000" ($9.43) as separate columns.
 *
 * Reading the residential tiers as a COMBINED water-and-sewer charge would
 * explain the missing column, and is what produces the $38.12 that the anchor
 * rejects. So that reading is out too.
 *
 * ── What this means for anyone continuing ──────────────────────────────────
 *
 * **Do not trust the table identification above.** It was the best available
 * when nothing could check it; now something can, and it disagrees. Start by
 * questioning which table is residential rather than by hunting for the
 * missing column — the column may not be missing so much as looked for in the
 * wrong table.
 *
 * The value at stake is currency, not coverage: Gwinnett has a real 2022 bill
 * either way. That is a much smaller prize than when this file was written, and
 * worth weighing before spending more on it.
 *
 * Usage:
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/audit-gwinnett-water.ts
 */

import { contentStreams, textItems } from '../../apps/web/lib/areas/millage-pdf.js';

const PDF = 'https://www.gwinnettcounty.com/documents/d/gwinnett-county/dwr-rates-fee-schedule-2026';

/** Column centres of the three-tier table, from the headers above it. */
const COLUMNS = [
  { label: 'base water charge', x: 147 },
  { label: 'base sewer charge', x: 250 },
  { label: 'water tier 1 (0–8,000 gal)', x: 353 },
  { label: 'water tier 2 (8,001–12,000)', x: 467 },
  { label: 'water tier 3 (12,001+)', x: 569 },
];
/** How far off a column centre a cell may sit and still belong to it. */
const COLUMN_TOLERANCE = 12;
/** Rows of the same table share a y within this many points. */
const ROW_TOLERANCE = 4;
/** The band the three-tier table occupies. Other tables sit beside it at
 *  overlapping y, which is why the columns above do the separating. */
const BLOCK = { minY: 180, maxY: 450 };

async function main() {
  console.log(`Fetching ${PDF}`);
  const res = await fetch(PDF);
  if (!res.ok) {
    console.error(`Gwinnett returned ${res.status}. Nothing to report.`);
    process.exit(1);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const items = textItems(contentStreams(buf));
  console.log(`${items.length} text items.\n`);

  // The three-tier header is the anchor. If it moves, the schedule was
  // redesigned and every column centre below is meaningless.
  const anchors = ['Tier 1', 'Tier 2', 'Tier 3'].map((t) =>
    items.find((i) => i.text.trim() === t),
  );
  if (anchors.some((a) => a === undefined)) {
    console.error('The Tier 1/2/3 header is gone — the schedule changed shape. Stop and re-map.');
    process.exit(1);
  }
  console.log('tier header found at x =', anchors.map((a) => a?.x.toFixed(0)).join(', '));

  const cells = items.filter(
    (i) => i.y > BLOCK.minY && i.y < BLOCK.maxY && /^\$?[\d,]+\.?\d*$/.test(i.text.trim()),
  );
  const byRow = new Map<number, typeof cells>();
  for (const c of cells) {
    const key = [...byRow.keys()].find((k) => Math.abs(k - c.y) < ROW_TOLERANCE) ?? c.y;
    byRow.set(key, [...(byRow.get(key) ?? []), c]);
  }

  console.log(`\n${'meter'.padEnd(7)}${COLUMNS.map((c) => c.label.padStart(30)).join('')}`);
  for (const [y, row] of [...byRow].sort((a, b) => b[0] - a[0])) {
    const size = items.find(
      (i) => Math.abs(i.y - y) < ROW_TOLERANCE && i.x < 100 && /"/.test(i.text),
    );
    const picked = COLUMNS.map((col) => {
      const hit = row.find((c) => Math.abs(c.x - col.x) < COLUMN_TOLERANCE);
      return (hit?.text.trim() ?? '—').padStart(30);
    });
    // A row that fills every column is a rate row; a partial one is a stray
    // from one of the tables printed beside this one.
    if (picked.filter((p) => p.trim() !== '—').length < COLUMNS.length) continue;
    console.log(`${(size?.text.trim() ?? '?').padEnd(7)}${picked.join('')}`);
  }

  console.log(
    '\nREAD, AND CONTRADICTED. Priced at 4,000 gallons these tiers give $38.12,\n' +
      'against roughly $86 implied by the 2022 survey figure of $68.18 escalated at\n' +
      'the rate DeKalb’s own sheets show. A factor of two apart, so the table\n' +
      'identification above is wrong somewhere. Gwinnett already carries the survey\n' +
      'figure in production; reading this sheet would buy currency, not coverage.\n' +
      'See this file’s header before spending more on it.',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
