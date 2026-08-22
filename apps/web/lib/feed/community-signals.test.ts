import { CARD_ICON_NAMES } from '@percho/shared/icons';
/**
 * Tests for the community card's lifestyle signal pills (owner, 2026-08-15).
 *
 * The invariants worth asserting are about RESTRAINT again — this module is a
 * translation layer from resident claims to distinctive phrasings, and every
 * failure mode is a card that lies about a real neighbourhood:
 *
 *   · a GENERIC category word never prints (Restaurants / Walkability / Trees)
 *   · a NUMBER only shows when a count actually exists
 *   · not every card shows the same pills (input-dependent)
 *   · a community with no mapped claim renders no pills
 */
import { describe, expect, it } from 'vitest';
import type { CommunityReason } from './community-reasons';
import { SIGNAL_FAMILIES, communityLifestyleSignals, signalIcon } from './community-signals';

function reasons(labels: string[]): CommunityReason[] {
  return labels.map((label) => ({ label, icon: 'tree' }));
}

describe('communityLifestyleSignals', () => {
  it('translates a category word into a distinctive phrase', () => {
    // The owner's example: "Trees" must NOT print; "Mature trees" may.
    const out = communityLifestyleSignals(reasons(['Trees']), 1);
    expect(out).toEqual(['Mature trees']);
  });

  it('never prints a generic category word', () => {
    for (const label of ['Trees', 'Walkability', 'Restaurants']) {
      const out = communityLifestyleSignals(reasons([label]), 2);
      expect(out).not.toContain(label);
      expect(out).not.toContain('Walkability');
      expect(out).not.toContain('Restaurants');
    }
  });

  it('ranks the rarest claim first', () => {
    // Walkability (25.2%) is rarer than Peaceful (61.2%) and leads.
    const out = communityLifestyleSignals(reasons(['Peaceful', 'Walkability']), 2);
    expect(out[0]).toBe('Highly walkable');
    expect(out[1]).toBe('Quiet streets');
  });

  it('prefers a numbered signal over a phrase', () => {
    // "33 restaurants" beats "Cafés nearby" — a count measures the place.
    const out = communityLifestyleSignals(
      [{ label: 'Restaurants', icon: 'shop', fact: '33 restaurants' }],
      2,
    );
    expect(out).toEqual(['33 restaurants nearby']);
  });

  it('returns a variable number of pills depending on the community', () => {
    // A claim-poor community gets 1; a rich one gets 2 (default).
    const poor = communityLifestyleSignals(reasons(['Trees']), 2);
    expect(poor).toHaveLength(1);
    const rich = communityLifestyleSignals(reasons(['Trees', 'Walkability', 'Restaurants']), 2);
    expect(rich).toHaveLength(2);
  });

  it('returns empty rather than inventing a signal', () => {
    expect(communityLifestyleSignals(null, 2)).toEqual([]);
    expect(communityLifestyleSignals([], 2)).toEqual([]);
    // A claim with no family maps to nothing.
    expect(
      communityLifestyleSignals([{ label: 'Traceylynn Consultant', icon: 'tree' }], 2),
    ).toEqual([]);
  });
});

describe('signalIcon', () => {
  it('gives the phrases the card actually shows a glyph', () => {
    expect(signalIcon('Mature trees')).toBe('tree');
    expect(signalIcon('Highly walkable')).toBe('walk');
    expect(signalIcon('Quiet streets')).toBe('moon');
    expect(signalIcon('Great schools')).toBe('school');
    expect(signalIcon('Safe')).toBe('shieldCheck');
  });

  it('reads the noun out of a count signal', () => {
    // These are built by `extractPoiCounts` from the seed's own noun, so they
    // can never appear in the phrase table and must match on the noun alone.
    expect(signalIcon('33 restaurants nearby')).toBe('cup');
    expect(signalIcon('3 parks nearby')).toBe('yard');
    expect(signalIcon('12 shops nearby')).toBe('shop');
  });

  /**
   * The rule the card depends on. The shipped font is a 14-glyph subset and
   * these signals have no honest match in it; a generic stand-in would be the
   * card asserting a category the community was never measured on.
   */
  it('returns nothing rather than a stand-in glyph', () => {
    expect(signalIcon('Lake nearby')).toBeUndefined();
    expect(signalIcon('Golf nearby')).toBeUndefined();
    expect(signalIcon('Tennis nearby')).toBeUndefined();
    expect(signalIcon('7 helipads nearby')).toBeUndefined();
    expect(signalIcon('')).toBeUndefined();
  });

  it('only ever names a glyph the shipped font carries', () => {
    // A name added here but never re-subset into the .ttf renders BLANK on
    // device and nowhere else — see `packages/shared/src/icons.ts`.
    const phrases = SIGNAL_FAMILIES.flatMap((f) => f.signals);
    for (const phrase of phrases) {
      const icon = signalIcon(phrase);
      if (icon) expect(CARD_ICON_NAMES).toContain(icon);
    }
  });
});
