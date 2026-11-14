import { describe, expect, it } from 'vitest';
import { failedShotKeys } from './generate';

describe('failedShotKeys', () => {
  it('finds failed clips on every engine, not only seedance', () => {
    const shots = [
      { photo_id: 'p1', engine: 'kenburns' },
      { photo_id: 'p2', engine: 'depthflow' },
      { photo_id: 'p3', engine: 'seedance' },
      { photo_id: 'p4', engine: 'kenburns' },
    ];
    const status = new Map([
      ['p1:kenburns', 'failed'],
      ['p2:depthflow', 'failed'],
      ['p3:seedance', 'failed'],
      ['p4:kenburns', 'ready'],
    ]);
    expect(failedShotKeys(shots, status)).toEqual(shots.slice(0, 3));
  });

  it('ignores a failed row on an engine the plan no longer uses', () => {
    const shots = [{ photo_id: 'p1', engine: 'kenburns' }];
    const status = new Map([
      ['p1:seedance', 'failed'],
      ['p1:kenburns', 'ready'],
    ]);
    expect(failedShotKeys(shots, status)).toEqual([]);
  });
});
