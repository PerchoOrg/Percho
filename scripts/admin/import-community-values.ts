/**
 * Reads what a county appraises the homes inside a community's boundary at,
 * and writes the median to `scripts/admin/data/community-values.json`, which
 * `upsert-community-profile.ts` turns into the profile's `estimate` block —
 * the figure a community's feed card prints as its own.
 *
 * Why this exists (owner 2026-11-27): a community's card printed its CITY's
 * home value ("Suwanee homes"), the same figure on every card of the city.
 * He wants sold prices, as Redfin and Zillow show them; those arrive with the
 * listing feed, and until then: 「先给一个估值 不要空着」. Redfin's and Zillow's
 * own pages are not read here — neither publishes a community's sold prices
 * as open data for more than a handful of ours (DEVLOG, phase404.15).
 *
 * The source is each county's public parcel service — the tax assessor's own
 * record, free and keyless:
 *
 *   · Gwinnett  current file; total appraised value
 *   · Forsyth   tax year on each row; `CNTASSDVAL` is the appraised (fair
 *               market) value, not the 40% assessment its name suggests
 *   · Fulton    tax year 2023, well under today's prices —
 *               `profile-build.ts` scales it and says so
 *
 * A home is a residential lot with a building on it; a lot counts as inside
 * when the middle of its outline is. One request per thousand lots in the
 * boundary's bounding box. For the communities named on the command line (the
 * ones with a film), not a crawl:
 *
 *   pnpm --filter @percho/web community:values edinburgh windward
 *
 * Re-running a slug replaces its entry; a community in another county, with
 * no boundary, or with no homes on record is reported and left out.
 *
 * A count that has dropped is not believed. Forsyth reloads its layer late in
 * the evening, Eastern time, and for an hour or more answers with a fraction
 * of the county — 7,500 lots of some 100,000 on 2026-11-26, when Aberdeen read
 * as 48 homes instead of 416. An entry is kept as it is when the new read finds
 * under four fifths of the homes it holds; delete the entry to read it afresh.
 *
 * Then rebuild those profiles:
 *   pnpm --filter @percho/web community:profile edinburgh windward --apply
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import type { ValueFacts } from '../../apps/web/lib/communities/profile-build.js';
import {
  type GeoJsonPolygonLike,
  bboxOf,
  pointInPolygon,
} from '../../apps/web/lib/geo/point-in-polygon.js';

const here = dirname(fileURLToPath(import.meta.url));
const FILE = join(here, 'data/community-values.json');
const SLUGS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const AGENT = 'percho-admin/1.0 (hello@percho.co)';
const PAGE = 1000;

type Attributes = Record<string, string | number | null | undefined>;
const num = (v: Attributes[string]) => Number(v ?? 0) || 0;
const text = (v: Attributes[string]) => String(v ?? '');

interface County {
  url: string;
  fields: string;
  /** A residential lot with a building on it. */
  isHome: (a: Attributes) => boolean;
  /** USD, land and building. */
  value: (a: Attributes) => number;
  taxYear?: (a: Attributes) => number;
}

const COUNTIES: Record<string, County> = {
  Gwinnett: {
    url: 'https://gis3.gwinnettcounty.com/mapvis/rest/services/GISDataBrowser/GC_Parcel/MapServer/6/query',
    fields: 'TOTVAL1,DWLGVAL1,PCDESC',
    isHome: (a) => num(a.DWLGVAL1) > 0 && text(a.PCDESC).includes('Res'),
    value: (a) => num(a.TOTVAL1),
  },
  Forsyth: {
    url: 'https://geo.forsythco.com/gis/rest/services/Public/Tax_Parcel/MapServer/0/query',
    fields: 'CNTASSDVAL,LNDVALUE,USEDSCRP,RESYRBLT,TAXYEAR',
    isHome: (a) =>
      num(a.RESYRBLT) > 0 &&
      num(a.CNTASSDVAL) > num(a.LNDVALUE) &&
      text(a.USEDSCRP).toUpperCase().includes('RESIDENTIAL'),
    value: (a) => num(a.CNTASSDVAL),
    taxYear: (a) => num(a.TAXYEAR),
  },
  Fulton: {
    url: 'https://services1.arcgis.com/AQDHTHDrZzfsFsB5/arcgis/rest/services/Tyler_TaxParcels/FeatureServer/0/query',
    fields: 'TotAppr,ImprAppr,LivUnits,ClassCode,TaxYear',
    isHome: (a) => num(a.ImprAppr) > 0 && num(a.LivUnits) >= 1 && text(a.ClassCode).startsWith('R'),
    value: (a) => num(a.TotAppr),
    taxYear: (a) => num(a.TaxYear),
  },
};

interface Stored {
  asOf: string;
  communities: Record<string, ValueFacts>;
}

interface Lot {
  attributes: Attributes;
  geometry?: { rings?: number[][][] };
}

/** Every lot whose outline touches the box, a page at a time. */
async function lotsIn(county: County, box: readonly number[]): Promise<Lot[]> {
  const lots: Lot[] = [];
  for (let offset = 0; ; ) {
    const res = await fetch(county.url, {
      method: 'POST',
      headers: { 'User-Agent': AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        where: '1=1',
        geometry: box.join(','),
        geometryType: 'esriGeometryEnvelope',
        inSR: '4326',
        spatialRel: 'esriSpatialRelIntersects',
        outFields: county.fields,
        returnGeometry: 'true',
        outSR: '4326',
        geometryPrecision: '6',
        resultOffset: String(offset),
        resultRecordCount: String(PAGE),
        f: 'json',
      }),
    });
    if (!res.ok) throw new Error(`parcel service ${res.status}`);
    const body = (await res.json()) as {
      features?: Lot[];
      exceededTransferLimit?: boolean;
      error?: { message?: string };
    };
    if (body.error) throw new Error(`parcel service: ${body.error.message}`);
    const page = body.features ?? [];
    lots.push(...page);
    if (page.length === 0 || (page.length < PAGE && !body.exceededTransferLimit)) return lots;
    offset += page.length;
  }
}

/** The middle of a lot's longest ring — close enough to say which side of a boundary it is on. */
function middle(lot: Lot): { lng: number; lat: number } | null {
  const ring = (lot.geometry?.rings ?? []).reduce<number[][]>(
    (longest, r) => (r.length > longest.length ? r : longest),
    [],
  );
  if (ring.length === 0) return null;
  const sum = ring.reduce((a, p) => ({ lng: a.lng + (p[0] ?? 0), lat: a.lat + (p[1] ?? 0) }), {
    lng: 0,
    lat: 0,
  });
  return { lng: sum.lng / ring.length, lat: sum.lat / ring.length };
}

function median(sorted: readonly number[]): number {
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid] ?? 0;
  return sorted.length % 2 === 1 ? upper : ((sorted[mid - 1] ?? upper) + upper) / 2;
}

async function main() {
  if (SLUGS.length === 0) {
    console.error('Usage: community:values <slug> [<slug> …]');
    process.exit(1);
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
  const sb = createClient(url, serviceKey);
  const { data, error } = await sb
    .from('communities')
    .select('slug, county, boundary')
    .in('slug', SLUGS);
  if (error) throw new Error(`read failed: ${JSON.stringify(error)}`);

  const stored: Stored = existsSync(FILE)
    ? (JSON.parse(readFileSync(FILE, 'utf8')) as Stored)
    : { asOf: '', communities: {} };

  for (const slug of SLUGS) {
    const c = data?.find((r) => r.slug === slug);
    const county = COUNTIES[String(c?.county ?? '')];
    const boundary = c?.boundary as GeoJsonPolygonLike | null | undefined;
    const box = boundary ? bboxOf(boundary) : null;
    if (!c || !county || !boundary || !box) {
      console.warn(`  ${slug}: no such community, no boundary, or no parcel source — skipped`);
      continue;
    }
    const homes = (await lotsIn(county, box)).filter((lot) => {
      const at = middle(lot);
      return at && pointInPolygon(at.lng, at.lat, boundary) && county.isHome(lot.attributes);
    });
    const held = stored.communities[slug];
    if (held && homes.length < held.homes * 0.8) {
      console.warn(
        `  ${slug}: ${homes.length} homes now, ${held.homes} on file — the county's layer looks partial; kept`,
      );
      continue;
    }
    delete stored.communities[slug];
    if (homes.length === 0) {
      console.warn(`  ${slug}: no homes on record inside its boundary — left out`);
      continue;
    }
    const values = homes.map((h) => county.value(h.attributes)).sort((a, b) => a - b);
    const taxYear = county.taxYear
      ? Math.max(...homes.map((h) => county.taxYear?.(h.attributes) ?? 0))
      : 0;
    const facts: ValueFacts = {
      county: String(c.county),
      homes: values.length,
      median: Math.round(median(values)),
      ...(taxYear > 0 ? { taxYear } : {}),
    };
    stored.communities[slug] = facts;
    console.log(
      `  ${slug}: ${facts.homes} homes, median $${facts.median.toLocaleString('en-US')} (${facts.county}${facts.taxYear ? ` ${facts.taxYear}` : ''})`,
    );
  }

  stored.asOf = new Date().toISOString().slice(0, 10);
  stored.communities = Object.fromEntries(
    Object.entries(stored.communities).sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(FILE, `${JSON.stringify(stored, null, 2)}\n`);
  console.log(`Wrote ${Object.keys(stored.communities).length} communities to ${FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
