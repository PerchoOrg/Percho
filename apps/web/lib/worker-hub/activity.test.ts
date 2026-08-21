import { describe, expect, it } from 'vitest';
import { dayKey, summarise } from './activity';

const NOW = new Date('2026-08-21T12:00:00Z');

describe('summarise', () => {
  it('splits today out of the seven-day total', () => {
    const spend = summarise(
      [
        { cost_usd: 1.5, created_at: '2026-08-21T01:00:00Z' },
        { cost_usd: 0.5, created_at: '2026-08-21T11:00:00Z' },
        { cost_usd: 3, created_at: '2026-08-18T11:00:00Z' },
      ],
      NOW,
    );
    expect(spend.today).toBeCloseTo(2);
    expect(spend.last7d).toBeCloseTo(5);
    expect(spend.jobs7d).toBe(3);
  });

  it('returns seven days, oldest first, with gaps as zero', () => {
    const spend = summarise([{ cost_usd: 2, created_at: '2026-08-19T05:00:00Z' }], NOW);
    expect(spend.byDay.map((d) => d.date)).toEqual([
      '2026-08-15',
      '2026-08-16',
      '2026-08-17',
      '2026-08-18',
      '2026-08-19',
      '2026-08-20',
      '2026-08-21',
    ]);
    expect(spend.byDay[4]?.usd).toBe(2);
    expect(spend.byDay[5]?.usd).toBe(0);
  });

  it('ignores a row older than the window instead of banking it', () => {
    const spend = summarise([{ cost_usd: 99, created_at: '2026-07-01T00:00:00Z' }], NOW);
    expect(spend.last7d).toBe(0);
  });
});

describe('dayKey', () => {
  it('is the UTC date', () => expect(dayKey('2026-08-21T23:59:59Z')).toBe('2026-08-21'));
});
