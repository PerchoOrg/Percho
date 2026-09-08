/**
 * What the published county tax rate leaves out — a report, not a fix.
 *
 * `import-ga-millage.ts` totals three rows per county: `COUNTY
 * UNINCORPORATED`, `SCHOOL` and `STATE`. That was believed to be the whole
 * county-wide levy and it is not. Georgia counties also levy fire, EMS,
 * police, recreation, sanitation and ambulance as separate districts, and an
 * unincorporated homeowner pays them. The omission is not small: Gwinnett
 * levies COUNTY FIRE AND EMS 3.200, COUNTY POLICE 2.900 and COUNTY WIDE
 * RECREATION 1.000 alongside the 6.950 this code counts. Only the recreation
 * levy is unambiguously county-wide from its name, so the understatement there
 * is somewhere between 0.040 and 0.284 percentage points against a published
 * figure of 1.104% — and the top of that range is a quarter of the figure.
 *
 * ── Why this reports instead of correcting ─────────────────────────────────
 *
 * Because "which of these does a given home pay" is a different question in
 * almost every county, and getting it wrong moves a number a buyer is using to
 * budget:
 *
 *   countywide      `COUNTY FIRE DIST - COUNTYWIDE`, `COUNTY WIDE AMBULANCE`,
 *                   `COUNTY POLICE` — everyone in the county pays.
 *   unincorporated  `COUNTY UNINC FIRE DISTRICT`, `COUNTY FIRE - UNINC` —
 *                   only outside city limits.
 *   sub-district    Jackson levies ELEVEN separate fire districts, 0.700 to
 *                   3.390 mills. A home pays exactly one of them and the
 *                   report does not say which covers where. There is no single
 *                   right number for Jackson; there is a range.
 *   city-specific   `COUNTY INC - TYRONE` — a county levy for one city's
 *                   residents.
 *   ambiguous       `COUNTY FIRE DISTRICT` alone, with no unincorporated or
 *                   city counterpart to disambiguate it. DeKalb's is
 *                   answerable — its `COUNTY SSD - <city>` rows carry the same
 *                   2.837 mills, so the fire district is plainly the
 *                   unincorporated half of one county-wide service. Meriwether
 *                   has no such tell.
 *
 * Publishing a figure that is silently 0.28 points low is bad. Replacing it
 * with one that is confidently wrong in a different direction is worse. So
 * this prints the evidence, one county per line, for a human to rule on.
 *
 * Usage:
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/audit-millage-districts.ts
 *
 * Reads only. Writes nothing, ever.
 */

import { existsSync, readFileSync } from 'node:fs';
import {
  type Bucket,
  classify,
  millsToPoints as pct,
  omissionFor,
} from '../../apps/web/lib/areas/district-millage.js';
import {
  type DistrictRate,
  contentStreams,
  parseRow,
  rows,
  textItems,
} from '../../apps/web/lib/areas/millage-pdf.js';

const SOURCE_URL =
  'https://dor.georgia.gov/document/document/2023-georgia-county-ad-valorem-tax-digest-millage-rates/download';

const METRO_COUNTIES = [
  'BARROW',
  'BARTOW',
  'CARROLL',
  'CHEROKEE',
  'CLAYTON',
  'COBB',
  'COWETA',
  'DAWSON',
  'DEKALB',
  'DOUGLAS',
  'FAYETTE',
  'FORSYTH',
  'FULTON',
  'GWINNETT',
  'HALL',
  'HARALSON',
  'HEARD',
  'HENRY',
  'JACKSON',
  'LAMAR',
  'MERIWETHER',
  'MORGAN',
  'NEWTON',
  'PAULDING',
  'PICKENS',
  'PIKE',
  'ROCKDALE',
  'SPALDING',
  'WALTON',
];

function main() {
  const local = process.env.MILLAGE_PDF;
  if (!local || !existsSync(local)) {
    console.error(`Set MILLAGE_PDF to a local copy of the DOR report.\nDownload: ${SOURCE_URL}`);
    process.exit(1);
  }
  const parsed = rows(textItems(contentStreams(readFileSync(local))))
    .map(parseRow)
    .filter((r): r is DistrictRate => r !== null);

  let countiesAffected = 0;
  let worst = { county: '', points: 0 };

  for (const county of METRO_COUNTIES) {
    const all = parsed.filter((r) => r.county === county);
    const extras = all.filter(
      (r) =>
        r.district.startsWith('COUNTY ') &&
        // Not `(IN|UN)CORPORATED` — that matches "UNCORPORATED", which is not
        // a word, and misses "UNINCORPORATED", which is the baseline row. The
        // first run of this script reported every county's own baseline as an
        // omission and put DeKalb 0.832 points light.
        !/^COUNTY (INCORPORATED|UNINCORPORATED)$/.test(r.district) &&
        !r.district.startsWith('COUNTY SSD') &&
        r.mo + r.bond > 0,
    );
    if (extras.length === 0) continue;
    countiesAffected++;

    const names = extras.map((e) => e.district);
    const byBucket = new Map<Bucket, DistrictRate[]>();
    for (const e of extras) {
      const b = classify(e.district, names);
      byBucket.set(b, [...(byBucket.get(b) ?? []), e]);
    }

    // The floor, the ceiling and who pays what — all of it in
    // `lib/areas/district-millage.ts`, where it is tested.
    const omission = omissionFor(extras.map((e) => ({ district: e.district, mills: e.mo + e.bond })));
    const lowPoints = omission.lowPoints;
    const highPoints = omission.highPoints;
    if (highPoints > worst.points) worst = { county, points: highPoints };

    console.log(`\n${county}`);
    console.log(
      `  published figure is understated by ${lowPoints.toFixed(3)}–${highPoints.toFixed(3)} points`,
    );
    for (const [bucket, list] of [...byBucket].sort()) {
      for (const r of list) {
        console.log(
          `    ${bucket.padEnd(15)} ${r.district.padEnd(32)} ${(r.mo + r.bond).toFixed(3)}`,
        );
      }
    }
    const subs = omission.levies.filter((l) => l.bucket === 'sub-district');
    const ambiguous = omission.levies.filter((l) => l.bucket === 'ambiguous');
    if (subs.length > 1) {
      console.log(
        `    → a home is in exactly ONE of those ${subs.length}; there is no single figure for this county`,
      );
    }
    if (ambiguous.length > 0) {
      // DeKalb's fourteen `COUNTY SSD - <city>` rows all carry 2.837, the same
      // as its COUNTY FIRE DISTRICT — one service, two halves. A county with a
      // single stray SSD row is not making the same statement, so the hint is
      // only offered when the mills actually line up.
      const ssdMatches = all.some(
        (r) =>
          r.district.startsWith('COUNTY SSD') &&
          ambiguous.some((a) => Math.abs(a.mo + a.bond - (r.mo + r.bond)) < 0.001),
      );
      console.log(
        ssdMatches
          ? '    → the COUNTY SSD rows carry the same mills: one service, city half and unincorporated half'
          : '    → nothing in the report says whether this is countywide or unincorporated-only',
      );
    }
  }

  console.log(
    `\n${countiesAffected} of ${METRO_COUNTIES.length} counties levy something the published figure omits.`,
  );
  console.log(
    `Worst case: ${worst.county}, up to ${worst.points.toFixed(3)} percentage points of market value.`,
  );
  console.log(
    '\nThis script writes nothing. Deciding each bucket is a judgement call — see the header.',
  );
}

main();
