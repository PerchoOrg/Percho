/**
 * A claim nobody may clear is a claim that never goes away.
 *
 * Windward, 2026-09-03: `generate` finished in 2.4s and left its marker
 * behind. For the next nine minutes every step declined to clear it — the rule
 * was "clear only your own" — so the strip showed Render running, then failed,
 * while the film assembled fine underneath. The rule is now "clear your own, or
 * anything older than you", which is the same protection against a faster step
 * that started after us and none of the deadlock.
 */

import { describe, expect, it } from 'vitest';
import { mayClearClaim } from './shared';

const at = (iso: string) => ({ step: 'generate', started_at: iso });

describe('mayClearClaim', () => {
  it('clears when there is no marker at all', () => {
    expect(mayClearClaim(null, '2026-09-03T08:56:18.841Z')).toBe(true);
    expect(mayClearClaim(undefined, '2026-09-03T08:56:18.841Z')).toBe(true);
  });

  it('clears its own marker', () => {
    const started = '2026-09-03T08:47:50.268Z';
    expect(mayClearClaim(at(started), started)).toBe(true);
  });

  it('clears a marker left behind before it — the Windward deadlock', () => {
    // generate claimed at 08:47:50 and never released; assemble runs at 08:56:18.
    expect(mayClearClaim(at('2026-09-03T08:47:50.268Z'), '2026-09-03T08:56:18.841Z')).toBe(true);
  });

  it('leaves a marker claimed after it alone', () => {
    // A slow step returning after a faster one has already claimed the run:
    // clearing here would blank the spinner out from under live work.
    expect(mayClearClaim(at('2026-09-03T08:56:18.841Z'), '2026-09-03T08:47:50.268Z')).toBe(false);
  });
});
