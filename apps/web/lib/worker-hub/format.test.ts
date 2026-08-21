import { describe, expect, it } from 'vitest';
import { formatAge, formatBytes, formatDuration, formatUsd, hourlyHistogram } from './format';

describe('formatDuration', () => {
  it('picks a unit per magnitude', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(12 * 60)).toBe('12m');
    expect(formatDuration(3 * 3600 + 20 * 60)).toBe('3h 20m');
    expect(formatDuration(2 * 86_400 + 4 * 3600)).toBe('2d 4h');
  });
  it('is a dash for nothing', () => expect(formatDuration(null)).toBe('—'));
});

describe('formatBytes', () => {
  it('scales', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(12_709_133)).toBe('12.1 MB');
  });
});

describe('formatUsd', () => {
  it('keeps cents on small numbers and drops them on large', () => {
    expect(formatUsd(0)).toBe('$0.00');
    expect(formatUsd(1.234)).toBe('$1.23');
    expect(formatUsd(120.9)).toBe('$121');
  });
});

describe('formatAge', () => {
  it('renders relative to now', () => {
    const now = Date.parse('2026-08-21T12:00:00Z');
    expect(formatAge('2026-08-21T11:30:00Z', now)).toBe('30m ago');
  });
});

describe('hourlyHistogram', () => {
  const now = Date.parse('2026-08-21T12:00:00Z');

  it('puts the newest hour in the last bucket', () => {
    const buckets = hourlyHistogram(['2026-08-21T11:59:00Z', '2026-08-21T11:10:00Z'], now);
    expect(buckets).toHaveLength(24);
    expect(buckets[23]).toBe(2);
  });

  it('drops anything older than 24h', () => {
    expect(hourlyHistogram(['2026-08-19T12:00:00Z'], now).every((n) => n === 0)).toBe(true);
  });

  it('places a bucket by hours elapsed, not by clock hour', () => {
    const buckets = hourlyHistogram(['2026-08-21T09:30:00Z'], now);
    expect(buckets[21]).toBe(1);
  });
});
