import { describe, expect, it } from 'vitest';
import { type BgmCandidate, selectBgm, vibeForCommunity } from './select';
import type { BgmRole, BgmVibe } from './storage';

const track = (path: string, role?: BgmRole, vibe?: BgmVibe): BgmCandidate => ({
  path,
  meta: role
    ? {
        title: path,
        vibe: vibe ?? (path.split('/')[0] as BgmVibe),
        role,
        tags: [],
        source: 'lyria',
        created_at: '2026-08-20',
      }
    : undefined,
});

const beds = [
  track('warm-acoustic/a.mp3', 'bed'),
  track('warm-acoustic/b.mp3', 'bed'),
  track('warm-acoustic/c.mp3', 'bed'),
];

describe('selectBgm', () => {
  it('gives one community the same track every time', () => {
    const first = selectBgm({ candidates: beds, vibe: 'warm-acoustic', role: 'bed', seed: 'abc' });
    for (let i = 0; i < 20; i++) {
      expect(
        selectBgm({ candidates: beds, vibe: 'warm-acoustic', role: 'bed', seed: 'abc' })?.path,
      ).toBe(first?.path);
    }
  });

  it('does not give every community the same track', () => {
    const picked = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(
        (s) => selectBgm({ candidates: beds, vibe: 'warm-acoustic', role: 'bed', seed: s })?.path,
      ),
    );
    expect(picked.size).toBeGreaterThan(1);
  });

  it('is stable when Storage returns a different order', () => {
    const a = selectBgm({ candidates: beds, vibe: 'warm-acoustic', role: 'bed', seed: 'x' });
    const b = selectBgm({
      candidates: [...beds].reverse(),
      vibe: 'warm-acoustic',
      role: 'bed',
      seed: 'x',
    });
    expect(a?.path).toBe(b?.path);
  });

  it('never hands a narrated film a lead track when a bed exists', () => {
    const mixed = [track('warm-acoustic/loud.mp3', 'lead'), ...beds];
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const got = selectBgm({ candidates: mixed, vibe: 'warm-acoustic', role: 'bed', seed });
      expect(got?.meta?.role).toBe('bed');
    }
  });

  it('prefers the vibe but takes another rather than going silent', () => {
    const other = [track('luxury-ambient/x.mp3', 'bed')];
    const got = selectBgm({
      candidates: other,
      vibe: 'warm-acoustic',
      role: 'bed',
      seed: 'anything',
    });
    expect(got?.path).toBe('luxury-ambient/x.mp3');
  });

  it('treats an untagged legacy track as a bed of its folder', () => {
    // Every track imported before metadata existed has been used as a bed for
    // months. Excluding them would have emptied the library on deploy day.
    const legacy = [track('warm-acoustic/old.mp3')];
    const got = selectBgm({ candidates: legacy, vibe: 'warm-acoustic', role: 'bed', seed: 's' });
    expect(got?.path).toBe('warm-acoustic/old.mp3');
  });

  it('returns null only when there is nothing at all', () => {
    expect(selectBgm({ candidates: [], vibe: 'warm-acoustic', role: 'bed', seed: 's' })).toBeNull();
  });
});

describe('vibeForCommunity', () => {
  it('defaults to warm acoustic', () => {
    expect(vibeForCommunity(['schools', 'outdoor', 'dining'])).toBe('warm-acoustic');
  });

  it('reads nightlife and work hubs as urban', () => {
    expect(vibeForCommunity(['nightlife', 'dining'])).toBe('chill-electronic');
    expect(vibeForCommunity(['work_hubs'])).toBe('chill-electronic');
  });

  it('does not call a park-and-school community modern', () => {
    expect(vibeForCommunity(['schools', 'outdoor', 'shopping', 'fitness'])).toBe('warm-acoustic');
  });

  it('calls a shops-and-gym-only community modern', () => {
    expect(vibeForCommunity(['shopping', 'fitness'])).toBe('modern-corporate');
  });
});
