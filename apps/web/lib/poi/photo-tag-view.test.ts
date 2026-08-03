import { describe, expect, it } from 'vitest';
import { projectTags, resolutionWarning } from './photo-tag-view';

/**
 * The two taggers write DIFFERENT keys into the same-named jsonb column, and
 * ~50% of rows have no tags at all. Both shapes must project, and an absent blob
 * must not throw.
 */
describe('projectTags', () => {
  it('reads the listing tagger shape', () => {
    const v = projectTags({
      caption: 'Modern townhome with gray siding',
      room_type: 'exterior',
      quality: 0.85,
      hero_score: 0.75,
      usable: true,
      is_master: false,
      time_of_day: 'day',
      style_signals: ['brick', 'modern_kitchen'],
    });
    expect(v.category).toBe('exterior');
    expect(v.description).toBe('Modern townhome with gray siding');
    expect(v.tags).toEqual(['brick', 'modern_kitchen', 'day']);
    expect(v.heroScore).toBe(0.75);
    expect(v.usable).toBe(true);
  });

  it('reads the POI tagger shape', () => {
    const v = projectTags({
      description: 'Asian cafe in a strip mall',
      primary_category: 'dining',
      tags: ['cafe', 'strip-mall'],
      mood: 'modern',
      usable: true,
    });
    expect(v.category).toBe('dining');
    expect(v.description).toBe('Asian cafe in a strip mall');
    expect(v.tags).toEqual(['cafe', 'strip-mall', 'modern']);
    // POI rows carry no hero_score — must be null, not 0, or the table would
    // claim every POI photo is a terrible opening shot.
    expect(v.heroScore).toBeNull();
  });

  it('survives null / empty / junk without throwing', () => {
    for (const input of [null, undefined, {}, { tags: 'not-an-array', quality: 'high' }]) {
      const v = projectTags(input as never);
      expect(v.category).toBeNull();
      expect(v.description).toBeNull();
      expect(v.tags).toEqual([]);
      expect(v.quality).toBeNull();
      expect(v.isMaster).toBe(false);
    }
  });

  it('distinguishes usable=false from usable missing', () => {
    expect(projectTags({ usable: false }).usable).toBe(false);
    expect(projectTags({}).usable).toBeNull();
  });
});

describe('resolutionWarning', () => {
  it('flags sources that will soften under the 4x ken-burns upscale', () => {
    expect(resolutionWarning(1024, 681)).toBe('low');
    expect(resolutionWarning(1800, 2400)).toBe('ok');
    expect(resolutionWarning(null, null)).toBeNull();
    expect(resolutionWarning(1600, 1200)).toBe('ok');
  });
});
