/**
 * Regenerate the `/demos/area-compare` review page from what actually shipped.
 *
 * Same story as `build-lens-demo.ts`, and the same trap: this page was drawn
 * before the compare screen existed and never caught up. It shows three
 * COMMUNITIES — "River Green", "Vickery", "Oak Grove" — with figures I made
 * up, while the screen that shipped (`apps/mobile/app/compare-areas.tsx`)
 * compares COUNTIES resolved from the buyer's saved areas, using real
 * millage, real Milestones results and a real electric rate.
 *
 * Two demos drifting the same way is not bad luck, it is what a hand-drawn
 * preview does once the thing it previews is real. So this page is generated
 * from:
 *
 *   the table code  `apps/mobile/lib/areas/compare-areas.ts` — the same
 *                   `buildAreaCompareTable` the phone calls, including which
 *                   cell it marks best and which rows it refuses to rank.
 *   the live API    `percho.co/api/mobile/areas`.
 *
 * ── Why presets rather than a free picker ──────────────────────────────────
 *
 * The table's maths cannot run in the browser without reimplementing it there,
 * which is the second source of truth that caused this. So the trios are
 * precomputed. Four of them, each chosen to show a different thing the table
 * does: schools trading against cost, the cheap outer ring where the spread is
 * small, the core metro, and the counties where tax dominates.
 *
 * Each trio is also rendered a second time with a "schools first" priority
 * weighting, because row REORDERING is a real feature of the shipped screen
 * (`@percho/shared` priorities) and a static table would not show it.
 *
 * Usage:
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/build-compare-demo.ts
 *   AREAS_JSON=/tmp/prod.json pnpm ... (to build from a saved payload)
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { Area } from '../../packages/shared/src/lenses.js';
import { REFERENCE_HOME_USD } from '../../packages/shared/src/lenses.js';
import { buildAreaCompareTable } from '../../apps/mobile/lib/areas/compare-areas.js';
import { defaultWeights } from '../../apps/mobile/lib/priorities.js';

const API = 'https://www.percho.co/api/mobile/areas';

/** Each trio shows something different about how the table behaves. */
const TRIOS: { title: string; blurb: string; keys: string[] }[] = [
  {
    title: 'Schools against cost',
    blurb:
      'The trade-off the buyer study said people actually make. Forsyth tests best in the metro and is not the cheapest to own.',
    keys: ['forsyth', 'fulton', 'dekalb'],
  },
  {
    title: 'The cheap outer ring',
    blurb:
      'Where the monthly figures converge. When three counties are this close, the table earns its keep by showing that nothing separates them.',
    keys: ['dawson', 'pickens', 'hall'],
  },
  {
    title: 'Core metro',
    blurb:
      'The three counties most buyers start with. Note the electric line: the utility is found by area, not by the county’s name.',
    keys: ['fulton', 'dekalb', 'cobb'],
  },
  {
    title: 'Where the tax bites',
    blurb:
      'Property tax is the biggest line in every one of these, and the spread between counties is larger than any other row.',
    keys: ['rockdale', 'clayton', 'cobb'],
  },
];

async function main() {
  const saved = process.env.AREAS_JSON;
  let payload: string;
  if (saved && existsSync(saved)) {
    console.log(`Reading ${saved}`);
    payload = readFileSync(saved, 'utf8');
  } else {
    console.log(`Fetching ${API}`);
    const res = await fetch(API);
    if (!res.ok) {
      console.error(`${API} returned ${res.status}. Nothing written.`);
      process.exit(1);
    }
    payload = await res.text();
  }
  const { areas } = JSON.parse(payload) as { areas: Area[] };
  const byKey = new Map(areas.map((a) => [a.key, a]));
  console.log(`${areas.length} areas.`);

  /** Everything at 1 except schools at 3 — the weighting the You tab writes
   *  when a buyer says schools matter most. */
  const schoolsFirst = { ...defaultWeights(), schools: 3 };

  const trios = TRIOS.map((trio) => {
    const picked = trio.keys.flatMap((k) => {
      const a = byKey.get(k);
      return a ? [a] : [];
    });
    if (picked.length !== trio.keys.length) {
      const missing = trio.keys.filter((k) => !byKey.has(k));
      console.error(`Trio "${trio.title}" is missing: ${missing.join(', ')}`);
      process.exit(1);
    }
    return {
      title: trio.title,
      blurb: trio.blurb,
      neutral: buildAreaCompareTable(picked),
      schoolsFirst: buildAreaCompareTable(picked, schoolsFirst),
    };
  });

  const out = {
    generatedAt: new Date().toISOString(),
    referenceHomeUsd: REFERENCE_HOME_USD,
    trios,
  };
  const path = new URL(
    '../../apps/web/public/demos/area-compare/data.js',
    import.meta.url,
  );
  writeFileSync(path, `window.__COMPARE__=${JSON.stringify(out)};\n`);

  console.log('');
  for (const t of trios) {
    const cols = t.neutral.headers.map((h) => h.name).join(' · ');
    const top = t.neutral.rows[0];
    const reordered = t.schoolsFirst.rows[0]?.label !== top?.label;
    console.log(
      `  ${t.title.padEnd(24)} ${cols.padEnd(30)} leads with "${top?.label}"${reordered ? ` → "${t.schoolsFirst.rows[0]?.label}" under schools-first` : ''}`,
    );
  }
  const bytes = Buffer.byteLength(JSON.stringify(out));
  console.log(`\nWrote data.js, ${(bytes / 1024).toFixed(1)} KB.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
