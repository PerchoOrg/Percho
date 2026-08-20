/**
 * The prompt carries rules that exist because of specific failures. If one of
 * them falls out, the next generated batch is unusable and nobody finds out
 * until a film sounds wrong.
 */

import { describe, expect, it } from 'vitest';
import { LYRIA_PRESETS, buildLyriaPrompt, lyriaFilename } from './lyria';
import { BGM_VIBES } from './storage';

describe('buildLyriaPrompt', () => {
  it('writes timestamps as m:ss past a minute', () => {
    // "0:82" is not a time. The first draft emitted exactly that for a 90s
    // track, and 0:112 / 0:120 for a two-minute one.
    const p = buildLyriaPrompt('acoustic', 90);
    expect(p).toContain('[0:08 - 1:22]');
    expect(p).toContain('[1:22 - 1:30]');
    expect(p).not.toMatch(/0:(6\d|7\d|8\d|9\d|\d{3})/);
  });

  it('keeps the structure inside the requested length', () => {
    for (const seconds of [30, 60, 90, 120, 150, 180]) {
      const stamps = buildLyriaPrompt('electronic', seconds)
        .split('\n')
        .filter((l) => l.startsWith('['))
        .flatMap((l) =>
          [...l.matchAll(/(\d+):(\d{2})/g)].map(([, m, s]) => +(m ?? 0) * 60 + +(s ?? 0)),
        );
      expect(Math.max(...stamps), `${seconds}s`).toBeLessThanOrEqual(seconds);
      // Monotonic — an outro that starts before the body ends is not a shape.
      expect(
        [...stamps].sort((a, b) => a - b),
        `${seconds}s`,
      ).toEqual(stamps);
    }
  });

  it('never lets the outro swallow a short track', () => {
    const stamps = buildLyriaPrompt('acoustic', 30);
    expect(stamps).toContain('[0:08 - 0:22]');
  });

  it('demands instrumental and forbids swells, for every vibe', () => {
    for (const vibe of BGM_VIBES) {
      const p = buildLyriaPrompt(vibe, 90).toLowerCase();
      expect(p, vibe).toContain('instrumental only');
      expect(p, vibe).toContain('no vocals');
      // The rule that exists because a random loud, dynamic track shipped.
      expect(p, vibe).toContain('no dramatic swells');
      expect(p, vibe).toContain('no build-ups');
    }
  });

  it('gives each vibe its own sound, not a shared template', () => {
    const briefs = BGM_VIBES.map((v) => LYRIA_PRESETS[v].brief);
    expect(new Set(briefs).size).toBe(BGM_VIBES.length);
    expect(new Set(BGM_VIBES.map((v) => LYRIA_PRESETS[v].slug)).size).toBe(BGM_VIBES.length);
  });

  it('appends the operator’s steer without displacing the rules', () => {
    const p = buildLyriaPrompt('piano', 90, 'still', 'brighter, more piano');
    expect(p).toContain('brighter, more piano');
    expect(p).toContain('Instrumental only');
  });
});

describe('lyriaFilename', () => {
  it('says where the track came from and sorts by date', () => {
    const name = lyriaFilename('acoustic', new Date('2026-08-20T12:00:00Z'));
    expect(name).toMatch(/^ai-acoustic-20260820-[0-9a-f]{4}\.mp3$/);
  });

  it('does not collide within a batch', () => {
    const names = new Set(Array.from({ length: 50 }, () => lyriaFilename('electronic')));
    expect(names.size).toBeGreaterThan(45);
  });
});
