/**
 * The pool that was never drawn from.
 *
 * Five voices existed since 2026-08-20 and every community was read by Aoede,
 * because the picker's first rule was "has an outdoor place → calm" and every
 * community tour visits a park. Aberdeen, Bellmoore Park and Apremont -
 * Highcroft, all Aoede (owner 2026-08-23: "voice is same for all videos - we
 * need to have a pool of different voices that we can choose from").
 */

import { describe, expect, it } from 'vitest';
import { AUTO_VOICE_POOL, VOICE_CATALOGUE, VOICE_IDS, voiceForCommunity } from './narration';

/** The bucket lists those three real runs actually carried. */
const REAL_BUCKETS: Record<string, string[]> = {
  'f00f6784-c71c-442a-89b8-47c426d81cf9': [
    'amenities',
    'outdoor',
    'kids',
    'dining',
    'schools',
    'fitness',
    'shopping',
    'asian_community',
    'other',
    'pets',
  ],
  'apremont-highcroft': [
    'outdoor',
    'waterfront',
    'dining',
    'kids',
    'schools',
    'other',
    'fitness',
    'daily_errands',
    'shopping',
    'outdoor',
  ],
  'cc9fc1da-0597-42ed-b71d-5b96b7965303': [
    'amenities',
    'shopping',
    'schools',
    'outdoor',
    'fitness',
    'dining',
    'pets',
    'civic',
    'nightlife',
    'shopping',
  ],
};

describe('voiceForCommunity', () => {
  it('gives the three real communities three different voices', () => {
    // The regression this whole change exists for.
    const picked = Object.entries(REAL_BUCKETS).map(([seed, b]) => voiceForCommunity(seed, b));
    expect(new Set(picked).size).toBe(3);
  });

  it('is stable — the same community keeps its narrator for ever', () => {
    for (const [seed, buckets] of Object.entries(REAL_BUCKETS)) {
      expect(voiceForCommunity(seed, buckets)).toBe(voiceForCommunity(seed, buckets));
    }
  });

  it('ignores buckets entirely, because buckets do not discriminate', () => {
    // All three real communities carry outdoor, dining, schools, fitness,
    // shopping and kids. Anything keyed on that cannot tell them apart, which
    // is why the character rules were removed rather than reordered.
    const seed = 'somewhere';
    expect(voiceForCommunity(seed, ['outdoor'])).toBe(voiceForCommunity(seed, ['nightlife']));
    expect(voiceForCommunity(seed, [])).toBe(voiceForCommunity(seed, ['schools', 'kids']));
  });

  it('spreads a realistic set of communities across the pool', () => {
    const names = Array.from({ length: 60 }, (_, i) => `community-${i}`);
    const used = new Set(names.map((n) => voiceForCommunity(n, [])));
    // Not a uniformity proof — just that it is not collapsing to one or two.
    expect(used.size).toBeGreaterThan(10);
  });

  it('only ever returns a voice the TTS API knows', () => {
    for (const n of Array.from({ length: 200 }, (_, i) => `c${i}`)) {
      expect(VOICE_IDS.has(voiceForCommunity(n, []))).toBe(true);
    }
  });

  it('lets the owner’s pick beat the automatic one', () => {
    expect(voiceForCommunity('seed', ['outdoor'], 'Gacrux')).toBe('Gacrux');
    // Including voices outside the automatic pool — "wrong for the format in
    // general" is not "wrong for this community".
    expect(voiceForCommunity('seed', [], 'Algenib')).toBe('Algenib');
  });

  it('ignores an override that is not a real voice', () => {
    const auto = voiceForCommunity('seed', []);
    expect(voiceForCommunity('seed', [], 'Scarlett')).toBe(auto);
    expect(voiceForCommunity('seed', [], '')).toBe(auto);
    expect(voiceForCommunity('seed', [], null)).toBe(auto);
  });
});

describe('the catalogue', () => {
  it('carries all thirty prebuilt Gemini voices', () => {
    expect(VOICE_CATALOGUE).toHaveLength(30);
    expect(new Set(VOICE_CATALOGUE.map((v) => v.id)).size).toBe(30);
  });

  it('every automatic pick is a real catalogue entry', () => {
    for (const id of AUTO_VOICE_POOL) expect(VOICE_IDS.has(id)).toBe(true);
  });

  it('leaves the wrong-for-a-property-film voices out of the automatic pool', () => {
    for (const id of ['Fenrir', 'Algenib', 'Enceladus', 'Pulcherrima', 'Sadachbia', 'Leda']) {
      expect(AUTO_VOICE_POOL, id).not.toContain(id);
      // …but still selectable by hand.
      expect(VOICE_IDS.has(id), id).toBe(true);
    }
  });
});
