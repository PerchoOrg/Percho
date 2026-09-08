import { lensById, rankedBy } from '@percho/shared/lenses';
import { describe, expect, it } from 'vitest';
import { groupMetrics } from './areas';

function row(over: Partial<Parameters<typeof groupMetrics>[0][number]> = {}) {
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
    detail: null as unknown,
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

  it('parses the numeric Postgres sends as a string', () => {
    // PostgREST serialises `numeric` as a string; a silent NaN would paint the
    // county blank instead of raising.
    const areas = groupMetrics([row({ value: '0.72' })]);
    expect(areas[0]?.metrics[0]?.value).toBe(0.72);
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
  const electric = (detail: unknown) =>
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
});
