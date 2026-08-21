/**
 * The home tour's clip staleness fingerprint.
 *
 * A clip is a function of more than its photo. The community tour learned this
 * the expensive way on 2026-08-19: staleness was judged by comparing the
 * clip's timestamp against the photo's, which sees photo edits and nothing
 * else, and three plan-only changes each shipped undetected — every time
 * `generate` reported "0 requeued" and the film came out unchanged.
 *
 * The home tour has a fourth input the community tour does not: the surface.
 * These pin that every input actually moves the key.
 */
import { describe, expect, it } from 'vitest';
import { renderKey } from './generate';

const base = {
  surface: 'ios' as const,
  engine: 'kenburns',
  move: 'push_in',
  duration_s: 3.0,
  photoVersion: '',
};

describe('renderKey', () => {
  it('is stable for identical inputs', () => {
    expect(renderKey(base)).toBe(renderKey({ ...base }));
  });

  it('changes with the surface', () => {
    // The whole reason surface is in the unique key: the same photo, engine
    // and move produce different pixels on 1080x1576 and 1920x1080, so an iOS
    // clip must never be mistaken for a rendered web one.
    expect(renderKey({ ...base, surface: 'web' })).not.toBe(renderKey(base));
  });

  it('carries the canvas, not just the surface name', () => {
    // If the canvas ever changes shape under a surface, every clip rendered
    // for the old one has to read as stale. That is exactly the failure the
    // iOS canvas move from 1080x1080 to 1080x1576 would otherwise have been.
    expect(renderKey(base)).toContain('1080x1576');
    expect(renderKey({ ...base, surface: 'web' })).toContain('1920x1080');
  });

  it('changes with engine, move and duration', () => {
    expect(renderKey({ ...base, engine: 'depthflow' })).not.toBe(renderKey(base));
    expect(renderKey({ ...base, move: 'orbit' })).not.toBe(renderKey(base));
    expect(renderKey({ ...base, duration_s: 4.0 })).not.toBe(renderKey(base));
  });

  it('changes when the photo is re-enhanced', () => {
    expect(renderKey({ ...base, photoVersion: '2026-08-21T00:00:00Z' })).not.toBe(renderKey(base));
  });

  it('ignores float noise in the duration', () => {
    // The duration is a float out of the planner; a 0.0001 difference is not a
    // reason to re-render a whole library.
    expect(renderKey({ ...base, duration_s: 3.0001 })).toBe(renderKey(base));
  });

  it('treats a missing move and a missing version as absent, not as undefined', () => {
    const key = renderKey({ ...base, move: null, photoVersion: '' });
    expect(key).not.toContain('undefined');
    expect(key).not.toContain('null');
  });
});
