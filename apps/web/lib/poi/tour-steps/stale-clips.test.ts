/**
 * Seedance must never be re-billed by the automatic staleness path.
 *
 * Owner 2026-08-19: "for photos with seedance clips, never call it again!!!!
 * always re-use, unless I clicked regenerate manually". The manual path is
 * `enqueueClips(..., requeueReady = true)`, which does not consult this
 * function at all — so exempting Seedance here is what makes the rule hold.
 */

import { describe, expect, it } from 'vitest';
import { staleClipKeys } from './generate';

/** Minimal stand-in for the two `.from().select().in()` calls the fn makes. */
function dbWith(photos: Array<Record<string, unknown>>) {
  return {
    from: () => ({
      select: () => ({
        in: async () => ({ data: photos }),
      }),
    }),
    // biome-ignore lint/suspicious/noExplicitAny: test double for TourDb
  } as any;
}

const RENDERED = '2026-08-19T10:00:00.000Z';
const REFRAMED_AFTER = '2026-08-19T12:00:00.000Z';

describe('staleClipKeys', () => {
  it('stales a local clip whose photo was reframed after the render', async () => {
    const sb = dbWith([
      {
        id: 'p1',
        outpainted_at: REFRAMED_AFTER,
        outpaint_status: 'ready',
        enhanced_at: null,
        enhanced_status: null,
      },
    ]);
    const stale = await staleClipKeys(
      sb,
      ['p1'],
      [{ photo_id: 'p1', engine: 'kenburns', status: 'ready', updated_at: RENDERED }],
    );
    expect([...stale]).toEqual(['p1:kenburns']);
  });

  it('never stales a seedance clip, however far behind it is', async () => {
    const sb = dbWith([
      {
        id: 'p1',
        outpainted_at: REFRAMED_AFTER,
        outpaint_status: 'ready',
        enhanced_at: REFRAMED_AFTER,
        enhanced_status: 'approved',
      },
    ]);
    const stale = await staleClipKeys(
      sb,
      ['p1'],
      [{ photo_id: 'p1', engine: 'seedance', status: 'ready', updated_at: RENDERED }],
    );
    expect([...stale]).toEqual([]);
  });

  it('stales the local clip but spares the seedance one on the same photo', async () => {
    const sb = dbWith([
      {
        id: 'p1',
        outpainted_at: null,
        outpaint_status: null,
        enhanced_at: REFRAMED_AFTER,
        enhanced_status: 'approved',
      },
    ]);
    const stale = await staleClipKeys(
      sb,
      ['p1'],
      [
        { photo_id: 'p1', engine: 'seedance', status: 'ready', updated_at: RENDERED },
        { photo_id: 'p1', engine: 'depthflow', status: 'ready', updated_at: RENDERED },
      ],
    );
    expect([...stale]).toEqual(['p1:depthflow']);
  });

  it('leaves a clip alone when its render is newer than the change', async () => {
    const sb = dbWith([
      {
        id: 'p1',
        outpainted_at: RENDERED,
        outpaint_status: 'ready',
        enhanced_at: null,
        enhanced_status: null,
      },
    ]);
    const stale = await staleClipKeys(
      sb,
      ['p1'],
      [{ photo_id: 'p1', engine: 'kenburns', status: 'ready', updated_at: REFRAMED_AFTER }],
    );
    expect([...stale]).toEqual([]);
  });

  it('ignores a reframe that is not ready and an enhancement not approved', async () => {
    const sb = dbWith([
      {
        id: 'p1',
        outpainted_at: REFRAMED_AFTER,
        outpaint_status: 'queued',
        enhanced_at: REFRAMED_AFTER,
        enhanced_status: 'ready',
      },
    ]);
    const stale = await staleClipKeys(
      sb,
      ['p1'],
      [{ photo_id: 'p1', engine: 'kenburns', status: 'ready', updated_at: RENDERED }],
    );
    expect([...stale]).toEqual([]);
  });
});
