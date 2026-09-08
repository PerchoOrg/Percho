import { readFileSync } from 'node:fs';
import { type Area, type AreaMetric, LENSES, type MetricKey } from '@percho/shared/lenses';
import { describe, expect, it } from 'vitest';
import { buildAreaCompareTable } from '../../../mobile/lib/areas/compare-areas';

/**
 * The two review demos are GENERATED artefacts checked into `public/demos`,
 * and they went stale twice.
 *
 * `/demos/search-lenses` was drawn before the implementation and still showed
 * four lenses when production had five, with property tax figures invented
 * months earlier. `/demos/area-compare` showed three communities that do not
 * exist. Both failures were silent: nothing broke, the pages simply described
 * a product that no longer existed — to the one person who reviews by opening
 * them.
 *
 * The fix at the time was a note reading "re-run both build scripts after any
 * data or lens change", which is a process that depends on someone
 * remembering, and forgetting is exactly what happened twice.
 *
 * So these tests make structural drift a FAILING BUILD instead. They do not —
 * and cannot — check that the numbers are current: the data behind them
 * changes when a scraper runs, with no code change to hang a test on, and an
 * age assertion would fail on a quiet week rather than on a real problem.
 * What they check is the shape: if a lens is added, renamed, recoloured or
 * removed, or if a compare row changes, the committed artefact no longer
 * matches the code that generates it and this file says so.
 *
 * When one of these fails, the fix is to re-run the generator, not to edit the
 * expectation:
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/build-lens-demo.ts
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/build-compare-demo.ts
 */

/** `window.__NAME__={…};` → the object. No eval: the file is data, not code. */
function readArtifact<T>(file: string, global: string): T {
  const raw = readFileSync(new URL(`../../public/demos/${file}`, import.meta.url), 'utf8');
  const prefix = `window.${global}=`;
  expect(raw.startsWith(prefix), `${file} should start with ${prefix}`).toBe(true);
  return JSON.parse(raw.slice(prefix.length).trim().replace(/;$/, '')) as T;
}

interface LensArtifact {
  generatedAt: string;
  referenceHomeUsd: number;
  shapes: { key: string; name: string }[];
  lenses: {
    id: string;
    label: string;
    unit: string;
    rankTitle: string;
    ramp: string[];
    rows: { key: string; name: string; text: string; estimated: boolean }[];
  }[];
  details: { key: string; lines: { label: string }[] }[];
}

interface CompareArtifact {
  generatedAt: string;
  trios: {
    title: string;
    neutral: { headers: { name: string }[]; rows: { label: string }[] };
    schoolsFirst: { rows: { label: string }[] };
  }[];
}

describe('the search-lenses demo matches the shipped lens catalogue', () => {
  const art = readArtifact<LensArtifact>('search-lenses/data.js', '__LENSES__');

  it('says when it was generated', () => {
    expect(Number.isNaN(Date.parse(art.generatedAt))).toBe(false);
  });

  it('has exactly the lenses that ship, in order', () => {
    // This is the one that would have caught the four-vs-five drift.
    expect(art.lenses.map((l) => l.id)).toEqual(LENSES.map((l) => l.id));
  });

  it('carries each lens’s current label, unit and heading', () => {
    for (const lens of LENSES) {
      const a = art.lenses.find((x) => x.id === lens.id);
      expect(a?.label, lens.id).toBe(lens.label);
      expect(a?.unit, lens.id).toBe(lens.unit);
      expect(a?.rankTitle, lens.id).toBe(lens.rankTitle);
    }
  });

  it('carries each lens’s current ramp', () => {
    // A recoloured lens whose demo still paints the old hue is drift the eye
    // will not catch — the map still looks plausible.
    for (const lens of LENSES) {
      const a = art.lenses.find((x) => x.id === lens.id);
      expect(a?.ramp, lens.id).toEqual([...lens.ramp]);
    }
  });

  it('prices the same reference home the code does', () => {
    expect(art.referenceHomeUsd).toBe(500_000);
  });

  it('ranks every county it can draw', () => {
    // A shape with no row renders as a grey hole; a row with no shape ranks
    // in a list you cannot find on the map.
    const shapes = new Set(art.shapes.map((s) => s.key));
    for (const lens of art.lenses) {
      for (const row of lens.rows) {
        expect(shapes.has(row.key), `${lens.id}/${row.key} has no shape`).toBe(true);
      }
    }
  });

  it('has a cost sheet for every county on the map', () => {
    const details = new Set(art.details.map((d) => d.key));
    for (const s of art.shapes) {
      expect(details.has(s.key), `${s.key} has no cost sheet`).toBe(true);
    }
  });
});

describe('the area-compare demo matches the shipped table', () => {
  const art = readArtifact<CompareArtifact>('area-compare/data.js', '__COMPARE__');

  /** Two synthetic counties, complete enough to produce every row. */
  const metric = (m: MetricKey, value: number): AreaMetric => ({
    metric: m,
    value,
    unit: 'x',
    source: 'test',
    asOf: '2024-01-01',
    estimated: false,
  });
  const area = (key: string): Area => ({
    key,
    name: key,
    kind: 'county',
    state: 'GA',
    metrics: [
      metric('county_mo_mills', 8.87),
      metric('county_bond_mills', 0.18),
      metric('school_mo_mills', 17.14),
      metric('school_bond_mills', 0),
      metric('school_proficiency_pct', 54),
      metric('electric_monthly_usd', 157),
      metric('water_monthly_usd', 78),
      metric('trash_monthly_usd', 32),
    ],
  });

  it('says when it was generated', () => {
    expect(Number.isNaN(Date.parse(art.generatedAt))).toBe(false);
  });

  it('has the rows the table produces today', () => {
    const live = buildAreaCompareTable([area('a'), area('b')]).rows.map((r) => r.label);
    for (const trio of art.trios) {
      expect(
        trio.neutral.rows.map((r) => r.label),
        trio.title,
      ).toEqual(live);
    }
  });

  it('compares three counties in every trio', () => {
    for (const trio of art.trios) {
      expect(trio.neutral.headers, trio.title).toHaveLength(3);
    }
  });

  it('still demonstrates priority reordering', () => {
    // The schools-first variant exists to show a real feature of the shipped
    // screen. If it ever stops reordering, the demo silently stops making its
    // point while still looking correct.
    for (const trio of art.trios) {
      expect(trio.schoolsFirst.rows[0]?.label, trio.title).toMatch(/schools/i);
      expect(trio.neutral.rows[0]?.label, trio.title).not.toMatch(/schools/i);
    }
  });
});
