import { describe, expect, it } from 'vitest';
import { hasAnyVideoUid, mobileVideoUid, webVideoUid } from './video-uid';

/**
 * Regression guard for 5122 Lower Creek Street (2026-08-03): the row had ONLY
 * `cf_video_id_square`, every web loader resolved
 * `cf_video_id ?? cf_video_id_landscape`, and the video silently did not play on
 * web while playing fine on iOS.
 */
describe('video-uid', () => {
  const squareOnly = {
    cf_video_id: null,
    cf_video_id_landscape: null,
    cf_video_id_square: 'SQ',
  };

  it('web falls back to square when nothing else rendered (the 5122 bug)', () => {
    expect(webVideoUid(squareOnly)).toBe('SQ');
    expect(hasAnyVideoUid(squareOnly)).toBe(true);
  });

  it('web prefers landscape over square when both exist', () => {
    expect(
      webVideoUid({ cf_video_id: null, cf_video_id_landscape: 'LS', cf_video_id_square: 'SQ' }),
    ).toBe('LS');
  });

  it('mobile prefers square over landscape when both exist', () => {
    expect(
      mobileVideoUid({ cf_video_id: null, cf_video_id_landscape: 'LS', cf_video_id_square: 'SQ' }),
    ).toBe('SQ');
  });

  it('the two surfaces pick DIFFERENT assets once both renders exist', () => {
    const both = { cf_video_id: null, cf_video_id_landscape: 'LS', cf_video_id_square: 'SQ' };
    expect(webVideoUid(both)).not.toBe(mobileVideoUid(both));
  });

  it('returns null rather than empty string for a row with no render', () => {
    const none = { cf_video_id: null, cf_video_id_landscape: null, cf_video_id_square: null };
    expect(webVideoUid(none)).toBeNull();
    expect(mobileVideoUid(none)).toBeNull();
    expect(hasAnyVideoUid(none)).toBe(false);
    expect(webVideoUid(null)).toBeNull();
  });
});

describe('the phone and the web never share a preference', () => {
  it('picks a different render when both shapes exist', () => {
    // The property that matters: a listing rendered for both surfaces must not
    // hand the same file to both. On 2026-08-21 the phone was playing the web
    // cut because a fallback in the feed route resolved the uid with the WEB
    // preference; the two functions themselves were always right.
    const both = {
      cf_video_id: null,
      cf_video_id_landscape: 'WEB',
      cf_video_id_square: 'PHONE',
    };
    expect(mobileVideoUid(both)).toBe('PHONE');
    expect(webVideoUid(both)).toBe('WEB');
  });

  it('still plays something when only one shape was rendered', () => {
    // A one-surface listing is the common case for everything rendered before
    // both canvases existed. Neither surface may go dark over it.
    const phoneOnly = { cf_video_id: null, cf_video_id_landscape: null, cf_video_id_square: 'P' };
    const webOnly = { cf_video_id: null, cf_video_id_landscape: 'W', cf_video_id_square: null };
    expect(mobileVideoUid(phoneOnly)).toBe('P');
    expect(webVideoUid(phoneOnly)).toBe('P');
    expect(mobileVideoUid(webOnly)).toBe('W');
    expect(webVideoUid(webOnly)).toBe('W');
  });
});
