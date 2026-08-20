/**
 * A clip re-renders when its render INPUTS change — not only its photo.
 *
 * The predecessor compared clip.updated_at against the photo's outpainted_at /
 * enhanced_at, which sees photo edits and nothing else. On 2026-08-19 three
 * plan-only changes each shipped undetected behind "0 requeued": the canvas
 * going 1080x1920 -> 1080x1576, the render read-path preferring originals over
 * reframes, and the moves shifting toward orbit. `render_key` covers the whole
 * input set so that class of bug cannot recur.
 *
 * Seedance stays exempt from automatic re-render. Owner 2026-08-19: "for photos
 * with seedance clips, never call it again!!!! always re-use, unless I clicked
 * regenerate manually". The manual path (`enqueueClips(..., requeueReady)`)
 * does not consult these functions at all.
 */

import { describe, expect, it } from 'vitest';
import { CANVAS_H, CANVAS_W } from '../tour-orchestrator/scheduler';
import { renderKey, staleClipKeys } from './generate';

const base = { engine: 'kenburns', move: 'pan_lr', duration_s: 3, photoVersion: 'v1' };

describe('renderKey', () => {
  it('is stable for identical inputs', () => {
    expect(renderKey(base)).toBe(renderKey({ ...base }));
  });

  it('changes when any single input changes', () => {
    const k = renderKey(base);
    expect(renderKey({ ...base, engine: 'depthflow' })).not.toBe(k);
    expect(renderKey({ ...base, move: 'orbit_left' })).not.toBe(k);
    expect(renderKey({ ...base, duration_s: 3.5 })).not.toBe(k);
    expect(renderKey({ ...base, photoVersion: 'v2' })).not.toBe(k);
  });

  it('carries the canvas, which is not a property of the clip row', () => {
    expect(renderKey(base)).toContain(`${CANVAS_W}x${CANVAS_H}`);
  });

  it('ignores float noise in the duration', () => {
    expect(renderKey({ ...base, duration_s: 3.0001 })).toBe(renderKey(base));
  });
});

describe('staleClipKeys', () => {
  const wanted = new Map([
    ['p1:kenburns', renderKey(base)],
    ['p1:seedance', renderKey({ ...base, engine: 'seedance' })],
    ['p2:depthflow', renderKey({ ...base, engine: 'depthflow' })],
  ]);

  it('leaves a clip alone when its key already matches', () => {
    const stale = staleClipKeys(
      [{ photo_id: 'p1', engine: 'kenburns', render_key: renderKey(base) }],
      wanted,
    );
    expect([...stale]).toEqual([]);
  });

  it('stales a clip whose key no longer matches', () => {
    const stale = staleClipKeys(
      [{ photo_id: 'p1', engine: 'kenburns', render_key: renderKey({ ...base, move: 'tilt_td' }) }],
      wanted,
    );
    expect([...stale]).toEqual(['p1:kenburns']);
  });

  it('stales a row that predates the column, so the library heals once', () => {
    const stale = staleClipKeys([{ photo_id: 'p1', engine: 'kenburns', render_key: null }], wanted);
    expect([...stale]).toEqual(['p1:kenburns']);
  });

  it('never stales a seedance clip, however far its key has drifted', () => {
    const stale = staleClipKeys(
      [{ photo_id: 'p1', engine: 'seedance', render_key: 'something-else-entirely' }],
      wanted,
    );
    expect([...stale]).toEqual([]);
  });

  it('spares the seedance clip while staling the local one on the same photo', () => {
    const stale = staleClipKeys(
      [
        { photo_id: 'p1', engine: 'seedance', render_key: null },
        { photo_id: 'p1', engine: 'kenburns', render_key: null },
      ],
      wanted,
    );
    expect([...stale]).toEqual(['p1:kenburns']);
  });

  it('ignores a clip that is not in this cut', () => {
    const stale = staleClipKeys([{ photo_id: 'p9', engine: 'kenburns', render_key: null }], wanted);
    expect([...stale]).toEqual([]);
  });
});
