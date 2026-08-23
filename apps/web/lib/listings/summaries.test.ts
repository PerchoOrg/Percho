import { describe, expect, it } from 'vitest';
import { SUMMARY_IDS_LIMIT, parseSummaryIds, projectSummaries } from './summaries';

const uuid = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  address: '1 Main St',
  city: 'Kennesaw',
  state: 'GA',
  price: 470000,
  beds: 4,
  baths: 3,
  sqft: 2853,
  ...over,
});

describe('parseSummaryIds', () => {
  it('accepts only uuids, dedupes, and caps at the limit', () => {
    const many = Array.from({ length: 40 }, (_, i) => uuid(i)).join(',');
    expect(parseSummaryIds(many)).toHaveLength(SUMMARY_IDS_LIMIT);
    expect(parseSummaryIds(`${uuid(1)}, ${uuid(1)} ,junk,`)).toEqual([uuid(1)]);
    expect(parseSummaryIds(null)).toEqual([]);
    expect(parseSummaryIds('DROP TABLE listings')).toEqual([]);
  });
});

describe('projectSummaries', () => {
  it('returns rows in the CALLER’s id order, dropping unknown ids', () => {
    const ids = [uuid(2), uuid(9), uuid(1)];
    const rows = [row(uuid(1)), row(uuid(2))];
    expect(projectSummaries(ids, rows, []).map((s) => s.id)).toEqual([uuid(2), uuid(1)]);
  });

  it('omits absent numbers rather than emitting zeros', () => {
    const s = projectSummaries([uuid(1)], [row(uuid(1), { price: null, sqft: 0 })], [])[0];
    expect(s && 'price' in s).toBe(false);
    expect(s && 'sqft' in s).toBe(false);
  });

  it('picks the lowest-sort_order photo as the thumb, nulls last', () => {
    const s = projectSummaries(
      [uuid(1)],
      [row(uuid(1))],
      [
        { listing_id: uuid(1), storage_path: 'b.jpg', sort_order: null },
        { listing_id: uuid(1), storage_path: 'a.jpg', sort_order: 2 },
        { listing_id: uuid(1), storage_path: 'hero.jpg', sort_order: 0 },
      ],
    )[0];
    expect(s?.thumbUrl).toContain('hero.jpg');
  });

  it('renders text-only when a listing has no ready photo', () => {
    const s = projectSummaries([uuid(1)], [row(uuid(1))], [])[0];
    expect(s && 'thumbUrl' in s).toBe(false);
  });
});
