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
