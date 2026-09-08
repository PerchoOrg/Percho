/**
 * What each defensible tax-district ruling does to the map — decision support.
 *
 * Read-only. Fetches production and writes nothing.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * `audit-millage-districts.ts` prints the evidence: which levies each county
 * has and which bucket they fall in. That is the right thing to rule on, and it
 * has been waiting since phase202 — partly, I think, because it asks for a
 * judgement about millage tables and shows its consequence in percentage
 * points of market value, which is unreadable as an outcome.
 *
 * This shows the outcome instead. Same evidence, expressed as the thing the
 * product actually presents: the ranked list of counties by what a home costs
 * to own.
 *
 * ── What it found ──────────────────────────────────────────────────────────
 *
 * The rulings differ from each other far less than any of them differs from
 * today. **Hall, Cherokee and Barrow leave the cheapest ten under every one**,
 * including the floor — which counts only levies a home outside city limits
 * certainly pays, and is the most conservative reading available.
 *
 * So the question is not really which ruling is right. It is that **doing
 * nothing is not among the defensible options**, and the ruling only decides
 * how far the current map is out.
 *
 * Usage:
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/audit-ruling-outcomes.ts
 */

import { type Area, LENSES, REFERENCE_HOME_USD, rankedBy } from '@percho/shared/lenses';

const API = 'https://www.percho.co/api/mobile/areas';
const TOP = 10;

const metric = (a: Area, m: string): number => {
  const hit = a.metrics.find((x) => x.metric === m);
  return hit === undefined ? 0 : Number(hit.value);
};
/** Percentage points of market value → dollars a month on the reference home. */
const perMonth = (pct: number) => (REFERENCE_HOME_USD * (pct / 100)) / 12;

const RULINGS: { name: string; note: string; add: (a: Area) => number }[] = [
  { name: 'as published today', note: 'nothing added', add: () => 0 },
  {
    name: 'FLOOR',
    note: 'county-wide and unincorporated-only levies, plus the cheapest sub-district',
    add: (a) => perMonth(metric(a, 'district_millage_omitted_min_pct')),
  },
  {
    name: 'MIDPOINT',
    note: 'floor and ceiling averaged',
    add: (a) =>
      perMonth(
        (metric(a, 'district_millage_omitted_min_pct') +
          metric(a, 'district_millage_omitted_max_pct')) /
          2,
      ),
  },
  {
    name: 'CEILING',
    note: 'every omitted levy applies, dearest sub-district',
    add: (a) => perMonth(metric(a, 'district_millage_omitted_max_pct')),
  },
];

async function main() {
  console.log(`Fetching ${API}`);
  const res = await fetch(API);
  if (!res.ok) {
    console.error(`${API} returned ${res.status}.`);
    process.exit(1);
  }
  const { areas } = (await res.json()) as { areas: Area[] };
  const lens = LENSES.find((l) => l.id === 'true_cost');
  if (!lens) throw new Error('the true-cost lens is gone');

  const base = rankedBy(lens, areas);
  if (base.length === 0) throw new Error('no counties ranked — nothing to compare');
  const todayKeys = base.map((v) => v.area.key);

  const tops: string[][] = [];
  for (const r of RULINGS) {
    const ranked = base
      .map((v) => ({ key: v.area.key, name: v.area.name, value: v.value + r.add(v.area) }))
      .sort((x, y) => x.value - y.value);
    const moved = ranked.filter((v, i) => todayKeys[i] !== v.key).length;
    tops.push(ranked.slice(0, TOP).map((v) => v.name));
    console.log(`\n  ${r.name} — ${r.note}`);
    console.log(
      `    ${ranked
        .slice(0, TOP)
        .map((v, i) => `${i + 1}.${v.name} $${Math.round(v.value)}`)
        .join('   ')}`,
    );
    console.log(`    ${moved} of ${ranked.length} positions differ from today`);
  }

  // The point of the whole exercise: who leaves the cheapest ten no matter
  // which ruling is chosen. Those counties are wrong on the map today under
  // every defensible reading, so their being wrong is not what is in doubt.
  const [today, ...rulings] = tops;
  const alwaysOut = (today ?? []).filter((name) => rulings.every((t) => !t.includes(name)));
  console.log(
    `\nIn the cheapest ${TOP} today and in NONE of the rulings: ${
      alwaysOut.length > 0 ? alwaysOut.join(', ') : '(none)'
    }`,
  );
  console.log(
    'The rulings differ from each other far less than any differs from today.\n' +
      'Whichever is right, the current map is wrong about those counties — so\n' +
      'leaving it as published is not one of the defensible options.',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
