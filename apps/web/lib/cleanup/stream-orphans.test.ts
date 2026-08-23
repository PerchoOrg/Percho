import { describe, expect, it } from 'vitest';
import { type StreamAsset, buildRefMap, classifyStreamAssets } from './stream-orphans';

const HOUR = 3_600_000;
const NOW = Date.parse('2026-08-23T21:00:00Z');
const asset = (uid: string, hoursAgo: number, duration: number | null = 30): StreamAsset => ({
  uid,
  created: new Date(NOW - hoursAgo * HOUR).toISOString(),
  duration,
  state: 'ready',
});

describe('classifyStreamAssets', () => {
  it('splits live, superseded and unreferenced', () => {
    const report = classifyStreamAssets({
      assets: [asset('a', 48), asset('b', 48), asset('c', 48)],
      refs: buildRefMap({ live: ['a'], assemblies: ['b'] }),
      now: NOW,
    });
    expect(report.assets.map((a) => a.klass)).toEqual(['live', 'superseded', 'unreferenced']);
    expect(report.buckets.live.count).toBe(1);
    expect(report.buckets.superseded.count).toBe(1);
    expect(report.buckets.unreferenced.count).toBe(1);
  });

  it('never offers a live asset for deletion, however old', () => {
    const report = classifyStreamAssets({
      assets: [asset('a', 24 * 365)],
      refs: buildRefMap({ live: ['a'], assemblies: ['a'] }),
      now: NOW,
    });
    expect(report.deletable).toEqual([]);
  });

  it('holds back anything younger than the age floor', () => {
    // The assembly step uploads, waits for Stream to encode, then patches the
    // video row: a cut minutes old can look unreferenced and not be.
    const report = classifyStreamAssets({
      assets: [asset('fresh', 2), asset('old', 30)],
      refs: new Map(),
      now: NOW,
    });
    expect(report.deletable.map((a) => a.uid)).toEqual(['old']);
  });

  it('prices storage at Cloudflare rates', () => {
    // 2 × 30 min = 60 min = $0.30/month.
    const report = classifyStreamAssets({
      assets: [asset('a', 48, 1800), asset('b', 48, 1800)],
      refs: new Map(),
      now: NOW,
    });
    expect(report.buckets.unreferenced.minutes).toBe(60);
    expect(report.buckets.unreferenced.usdPerMonth).toBeCloseTo(0.3, 5);
  });

  it('counts a still-processing video as zero minutes rather than crashing', () => {
    const report = classifyStreamAssets({
      assets: [asset('a', 48, null)],
      refs: new Map(),
      now: NOW,
    });
    expect(report.buckets.unreferenced.minutes).toBe(0);
  });
});

describe('buildRefMap', () => {
  it('lets live win over superseded for the same uid', () => {
    // The current cut is both the newest assembly row AND the one the video
    // row plays; it must never be classed as superseded.
    const refs = buildRefMap({ live: ['x'], assemblies: ['x'] });
    expect(refs.get('x')).toBe('live');
  });

  it('ignores nulls from nullable uid columns', () => {
    const refs = buildRefMap({ live: [null, undefined, 'a'], assemblies: [null] });
    expect([...refs.keys()]).toEqual(['a']);
  });
});
