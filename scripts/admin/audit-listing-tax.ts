/**
 * What the listing page's flat tax rate costs, on the homes we actually have.
 *
 * Read-only. Fetches production and writes nothing.
 *
 * ── Why ────────────────────────────────────────────────────────────────────
 *
 * `apps/mobile/lib/listing/cost.ts` prices property tax at a flat
 * `DEFAULT_TAX_RATE = 0.0085` for every home. The area map prices it from each
 * county's adopted millage and homestead exemption. phase242 measured that gap
 * on a hypothetical $500,000 home and flagged it.
 *
 * This measures it on the real catalogue, which says something stronger: the
 * flat rate is **below every county we have inventory in**, so the listing page
 * understates the monthly cost of every home it shows, by 4% to 21%.
 *
 * ── And it is a smaller fix than phase242 said ─────────────────────────────
 *
 * phase242 recorded that "the listing detail payload carries no coordinate, so
 * the county cannot be resolved on the client". That is true of the DETAIL DTO
 * and not of the data: the browse feed's own card carries `lat` and `lng`. The
 * server has the coordinate and does not project it into the detail response.
 *
 * So the change is to project a field that already exists rather than to build
 * a resolution pipeline. Still the owner's call — it moves the headline monthly
 * figure on a screen outside the scope I was given — but a smaller one than I
 * described.
 *
 * Usage:
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/audit-listing-tax.ts
 */

import { countyKeyForPoint } from '../../apps/mobile/lib/areas/locate.js';
import type { Area, MetricKey } from '../../packages/shared/src/lenses.js';
import { estimatePropertyTax } from '../../packages/shared/src/property-tax.js';

const AREAS = 'https://www.percho.co/api/mobile/areas';
const BROWSE = 'https://www.percho.co/api/browse/feed?limit=200';
/** The rate `cost.ts` uses for every home, everywhere. */
const FLAT_TAX_RATE = 0.0085;

interface Listing {
  city?: string;
  price?: number;
  lat?: number;
  lng?: number;
}

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return (await res.json()) as T;
}

async function main() {
  const live = await json<{ areas: Area[]; shapes: Parameters<typeof countyKeyForPoint>[2] }>(
    AREAS,
  );
  const browse = await json<{ cards: { listing?: Listing }[] }>(BROWSE);

  const metrics = new Map<string, Map<MetricKey, number>>();
  for (const a of live.areas) {
    metrics.set(a.key, new Map(a.metrics.map((m) => [m.metric, Number(m.value)])));
  }

  console.log(
    `\n${'city'.padEnd(18)}${'price'.padStart(11)}  ${'county'.padEnd(11)}${'flat'.padStart(8)}${'county rate'.padStart(12)}${'off by'.padStart(9)}`,
  );
  let priced = 0;
  let understated = 0;
  let worst = { city: '', pct: 0, usd: 0 };
  for (const card of browse.cards) {
    const l = card.listing;
    if (!l || typeof l.lat !== 'number' || typeof l.lng !== 'number') continue;
    if (typeof l.price !== 'number' || l.price <= 0) continue;
    const key = countyKeyForPoint(l.lat, l.lng, live.shapes);
    const m = key ? metrics.get(key) : undefined;
    if (!key || !m) continue;
    const est = estimatePropertyTax(
      l.price,
      {
        countyMo: m.get('county_mo_mills') ?? 0,
        countyBond: m.get('county_bond_mills') ?? 0,
        schoolMo: m.get('school_mo_mills') ?? 0,
        schoolBond: m.get('school_bond_mills') ?? 0,
      },
      key,
    );
    if (!est) continue;
    priced++;
    const flat = (l.price * FLAT_TAX_RATE) / 12;
    const usd = flat - est.monthlyUsd;
    const pct = usd / est.monthlyUsd;
    if (usd < 0) understated++;
    if (Math.abs(pct) > Math.abs(worst.pct)) worst = { city: l.city ?? '?', pct, usd };
    console.log(
      `${(l.city ?? '?').padEnd(18)}${l.price.toLocaleString().padStart(11)}  ${key.padEnd(11)}` +
        `${`$${Math.round(flat)}`.padStart(8)}${`$${Math.round(est.monthlyUsd)}`.padStart(12)}` +
        `${`${usd > 0 ? '+' : ''}${Math.round(pct * 100)}%`.padStart(9)}`,
    );
  }

  console.log(`\n${priced} listings priced against their own county.`);
  console.log(
    `${understated} of them are UNDERSTATED by the flat rate` +
      (understated === priced ? ' — every one.' : '.'),
  );
  console.log(
    `Worst: ${worst.city}, ${Math.round(Math.abs(worst.pct) * 100)}% ` +
      `${worst.pct < 0 ? 'low' : 'high'} — $${Math.abs(Math.round(worst.usd))} a month.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
