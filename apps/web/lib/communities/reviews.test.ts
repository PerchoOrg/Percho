import { describe, expect, it } from 'vitest';
import { REVIEW_PAGE_SIZE, cleanDimensions, projectCommunityReviews } from './reviews';

const row = (over: Partial<Parameters<typeof projectCommunityReviews>[0][number]> = {}) => ({
  id: 'r1',
  rating: 4,
  dimensions: { quiet: 5, walkable: 2 },
  body: 'Twenty characters of text here, at least.',
  status: 'approved',
  updated_at: '2026-09-01T00:00:00Z',
  ...over,
});

describe('cleanDimensions', () => {
  it('keeps only the known keys with an integer 1–5', () => {
    expect(cleanDimensions({ quiet: 5, walkable: 0, friendly: 3.5, value: 2, crime: 1 })).toEqual({
      quiet: 5,
      value: 2,
    });
    expect(cleanDimensions(null)).toEqual({});
    expect(cleanDimensions([1, 2])).toEqual({});
  });
});

describe('projectCommunityReviews', () => {
  it('is null with nothing approved, and never leaks the queue', () => {
    expect(projectCommunityReviews([])).toBeNull();
    expect(projectCommunityReviews([row({ status: 'pending' })])).toBeNull();
    const out = projectCommunityReviews([row(), row({ id: 'r2', status: 'rejected' })]);
    expect(out?.count).toBe(1);
    expect(out?.items.map((i) => i.id)).toEqual(['r1']);
  });

  it('averages ratings and per-dimension scores over the rows that have them', () => {
    const out = projectCommunityReviews([
      row({ rating: 5, dimensions: { quiet: 5 } }),
      row({ id: 'r2', rating: 4, dimensions: { quiet: 2, value: 3 } }),
      row({ id: 'r3', rating: 4, dimensions: {} }),
    ]);
    expect(out?.avgRating).toBe(4.3);
    expect(out?.dimensionAvgs).toEqual({ quiet: 3.5, value: 3 });
  });

  it('carries at most a page of items but counts them all', () => {
    const rows = Array.from({ length: REVIEW_PAGE_SIZE + 3 }, (_, i) => row({ id: `r${i}` }));
    const out = projectCommunityReviews(rows);
    expect(out?.count).toBe(REVIEW_PAGE_SIZE + 3);
    expect(out?.items).toHaveLength(REVIEW_PAGE_SIZE);
    expect(out?.items[0]?.date).toBe('2026-09-01T00:00:00Z');
  });
});
