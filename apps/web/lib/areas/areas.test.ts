import type { Json } from '@/lib/supabase/database.types';
import { METRIC_KEYS, lensById, rankedBy } from '@percho/shared/lenses';
import { describe, expect, it } from 'vitest';
import { groupMetrics } from './areas';

type Row = Parameters<typeof groupMetrics>[0][number];

/** A row shaped exactly as `fetchAreas` selects it. Typed rather than
 *  inferred, so a schema change surfaces here instead of in production. */
function row(over: Partial<Row> = {}): Row {
  return {
    area_kind: 'county',
    state: 'GA',
    area_key: 'cobb',
    area_name: 'Cobb',
    metric: 'property_tax_rate_pct',
    value: 0.72,
    unit: 'percent',
    source: 'GA DOR 2024 tax digest',
    source_url: 'https://dor.georgia.gov/',
    as_of: '2024-12-31',
    estimated: false,
    detail: null,
    ...over,
  };
}

describe('groupMetrics', () => {
  it('collects one area from its several metric rows', () => {
    const areas = groupMetrics([
      row(),
      row({ metric: 'electric_monthly_usd', value: 148, unit: 'usd_per_month' }),
    ]);
    expect(areas).toHaveLength(1);
    expect(areas[0]?.metrics.map((m) => m.metric).sort()).toEqual([
      'electric_monthly_usd',
      'property_tax_rate_pct',
    ]);
  });

  it('keeps two areas apart when only the key differs', () => {
    const areas = groupMetrics([row(), row({ area_key: 'dekalb', area_name: 'DeKalb' })]);
    expect(areas.map((a) => a.name)).toEqual(['Cobb', 'DeKalb']);
  });

  it('does not merge a county into a district of the same name', () => {
    const areas = groupMetrics([
      row({ area_key: 'forsyth', area_name: 'Forsyth' }),
      row({
        area_kind: 'school_district',
        area_key: 'forsyth',
        area_name: 'Forsyth',
        metric: 'school_proficiency_pct',
        value: 62,
      }),
    ]);
    expect(areas).toHaveLength(2);
    expect(areas.map((a) => a.kind).sort()).toEqual(['county', 'school_district']);
  });

  it('reads the number form this instance actually sends', () => {
    // Measured 2026-09-08: PostgREST returns `numeric` as a JSON number here.
    // The raw body is {"value":0.9}. This is the case that happens.
    expect(groupMetrics([row({ value: 0.72 })])[0]?.metrics[0]?.value).toBe(0.72);
  });

  it('also tolerates the string form, which some PostgREST setups send', () => {
    // Tolerated, not expected — see `MetricRow`. Kept because the failure if
    // it ever changes under us is silent: every rate NaN, every county grey.
    expect(groupMetrics([row({ value: '0.72' })])[0]?.metrics[0]?.value).toBe(0.72);
  });

  it('drops a row whose value cannot be a number', () => {
    expect(groupMetrics([row({ value: 'n/a' })])).toHaveLength(0);
  });

  it('skips a metric this build does not know', () => {
    const areas = groupMetrics([row(), row({ metric: 'radon_pci_l', value: 2 })]);
    expect(areas[0]?.metrics).toHaveLength(1);
  });

  it('carries provenance through, and omits an absent source url', () => {
    const [withUrl] = groupMetrics([row()]);
    const [without] = groupMetrics([row({ source_url: null })]);
    expect(withUrl?.metrics[0]?.sourceUrl).toBe('https://dor.georgia.gov/');
    expect(without?.metrics[0]).not.toHaveProperty('sourceUrl');
    expect(without?.metrics[0]?.asOf).toBe('2024-12-31');
  });

  it('feeds the lenses directly', () => {
    const areas = groupMetrics([
      row({ area_key: 'cobb', area_name: 'Cobb', value: 0.72 }),
      row({ area_key: 'dekalb', area_name: 'DeKalb', value: 1.04 }),
    ]);
    const lens = lensById('property_tax');
    if (!lens) throw new Error('lens missing');
    expect(rankedBy(lens, areas).map((v) => v.area.name)).toEqual(['Cobb', 'DeKalb']);
  });
});

describe('supplier projection', () => {
  // `Json`, not `unknown`: that is what the column holds, and every value
  // these tests pass — including the deliberately malformed ones — is valid
  // Json. `supplierOf` still takes `unknown`, because its job is to distrust
  // whatever an importer wrote.
  const electric = (detail: Json) =>
    groupMetrics([
      row({
        metric: 'electric_monthly_usd',
        unit: 'usd_per_month',
        value: 157,
        detail,
      }),
    ])[0]?.metrics[0];

  it('reads the three keys the client has a contract for', () => {
    const m = electric({
      provider: 'Georgia Power Co',
      provider_share: 0.55,
      rate_usd_per_kwh: 0.14624,
      // Everything else an importer felt like recording is ignored.
      assumed_monthly_kwh: 1074,
      basis: 'a long sentence',
    });
    expect(m?.supplier).toEqual({
      name: 'Georgia Power Co',
      share: 0.55,
      unitPrice: 0.14624,
      unitPriceUnit: 'usd_per_kwh',
    });
  });

  it('has no supplier when detail names none', () => {
    expect(electric(null)?.supplier).toBeUndefined();
    expect(electric({ basis: 'no provider here' })?.supplier).toBeUndefined();
    expect(electric('not an object')?.supplier).toBeUndefined();
  });

  it('keeps a name without a share or a rate', () => {
    expect(electric({ provider: 'Cobb EMC' })?.supplier).toEqual({ name: 'Cobb EMC' });
  });

  it('ignores a share or rate that is not a number', () => {
    const m = electric({ provider: 'X', provider_share: '0.5', rate_usd_per_kwh: null });
    expect(m?.supplier).toEqual({ name: 'X' });
  });

  it('reads the multi-provider shape the electric importer writes now', () => {
    // phase219 changed the importer's detail from one provider to a list, and
    // this function kept reading `provider` — so the supplier note vanished
    // from all 29 counties while every figure still looked fine.
    const m = electric({
      providers: [
        { name: 'COBB ELECTRIC MEMBERSHIP CORP', share: 0.41, rate_usd_per_kwh: 0.1188 },
        { name: 'GEORGIA POWER CO', share: 0.38, rate_usd_per_kwh: 0.1549 },
      ],
      provider_count: 4,
      covered_share: 0.99,
      rate_usd_per_kwh: 0.13122,
    });
    expect(m?.supplier).toEqual({
      name: 'COBB ELECTRIC MEMBERSHIP CORP',
      count: 4,
      share: 0.41,
      unitPrice: 0.13122,
      unitPriceUnit: 'usd_per_kwh',
    });
  });

  it('still reads a row an older importer run left behind', () => {
    // Both shapes are read rather than migrating the table: a half-migrated
    // table drops the note for whatever it missed, silently.
    expect(electric({ provider: 'Georgia Power Co', provider_share: 0.98 })?.supplier).toEqual({
      name: 'Georgia Power Co',
      share: 0.98,
    });
  });

  it('does not claim a count of one', () => {
    // `count: 1` would push the note into its "averaged across" phrasing for a
    // county with a single utility.
    const m = electric({ providers: [{ name: 'Solo', share: 1 }], provider_count: 1 });
    expect(m?.supplier).toEqual({ name: 'Solo', share: 1 });
  });
});

describe('the runtime allowlist cannot drift from the type', () => {
  it('accepts every key the shared list declares', () => {
    // phase220 added `public_water_pct` to `MetricKey` and not to the two
    // hand-copied allowlists. 29 correct rows were written and silently
    // dropped by the API: the type said the key existed, both runtime guards
    // disagreed, and nothing failed. This is that test.
    for (const key of METRIC_KEYS) {
      const m = groupMetrics([row({ metric: key, unit: 'x', value: 1, detail: null })])[0]
        ?.metrics[0];
      expect(m?.metric, `${key} is dropped by KNOWN_METRICS`).toBe(key);
    }
  });

  it('still drops a key it does not know', () => {
    // The guard is the point; deriving it must not turn it off.
    const m = groupMetrics([
      row({ metric: 'something_a_newer_writer_produced', unit: 'x', value: 1, detail: null }),
    ]);
    expect(m[0]?.metrics ?? []).toHaveLength(0);
  });
});

describe('the sewer-half flag is projected like a supplier, not passed through', () => {
  const water = (detail: Json) =>
    groupMetrics([
      row({ metric: 'water_monthly_usd', unit: 'usd_per_month', value: 25, detail }),
    ])[0]?.metrics[0];

  it('projects a false flag so the app can say the figure is water only', () => {
    expect(water({ has_county_sewer: false })?.coversSewer).toBe(false);
  });

  it('projects a true flag too', () => {
    expect(water({ has_county_sewer: true })?.coversSewer).toBe(true);
  });

  it('is absent when the importer said nothing', () => {
    // Undefined and false mean different things: one is "no sewer here", the
    // other is "this row predates the flag". Only false earns the note.
    expect(water({})?.coversSewer).toBeUndefined();
    expect(water(null)?.coversSewer).toBeUndefined();
    expect(water({ has_county_sewer: 'no' })?.coversSewer).toBeUndefined();
  });

  it('never appears on a metric it cannot describe', () => {
    const m = groupMetrics([
      row({
        metric: 'trash_monthly_usd',
        unit: 'usd_per_month',
        value: 30,
        detail: { has_county_sewer: false },
      }),
    ])[0]?.metrics[0];
    expect(m?.coversSewer).toBeUndefined();
  });
});
