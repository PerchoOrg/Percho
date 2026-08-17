import { describe, expect, it } from 'vitest';
import { GOLDEN_ANNOTATIONS, GOLDEN_PHOTOS } from './fixtures/peachtree-corners';
import { type GuardedClip, guardClips } from './guard';
import { scheduleClips } from './scheduler';
import {
  WORDS_PER_SECOND_MAX,
  WORDS_PER_SECOND_MIN,
  applyVoRewrites,
  assertNoSchoolAssignment,
  buildVoPrompt,
  countWords,
  narrationStats,
  parseVoResponse,
} from './vo-pass';

const clips = (): GuardedClip[] =>
  guardClips(
    scheduleClips(GOLDEN_ANNOTATIONS, GOLDEN_PHOTOS).clips,
    GOLDEN_ANNOTATIONS,
    GOLDEN_PHOTOS,
  ).clips;

describe('countWords / narrationStats', () => {
  it('counts only the clips that carry a line', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('  two  words ')).toBe(2);
    const stats = narrationStats(clips());
    expect(stats.words).toBeGreaterThan(0);
    expect(stats.spokenSeconds).toBeGreaterThan(0);
    expect(stats.spokenSeconds).toBeLessThan(clips().reduce((n, c) => n + c.duration_s, 0) + 0.001);
  });

  it('flags a line that cannot be read inside its own clip', () => {
    const [first, ...rest] = clips();
    const overlong = {
      ...first!,
      duration_s: 2.0,
      vo_line: 'one two three four five six seven eight nine ten',
    };
    const stats = narrationStats([overlong, ...rest]);
    expect(stats.overlong.map((o) => o.sort_order)).toContain(overlong.sort_order);
    expect(stats.overlong[0]!.maxWords).toBe(4); // floor(2.0 * 2.4)
  });
});

describe('buildVoPrompt', () => {
  it('carries order, duration and draft line for every clip', () => {
    const prompt = buildVoPrompt(clips());
    expect(prompt).not.toContain('{{ORDERED_CLIPS}}');
    expect(prompt).toContain('0. Corners Connector Trail');
    expect(prompt).toContain('never state or imply school assignment');
    expect(prompt).toContain('may NOT add a line to a\n  clip that currently has ""');
  });
});

describe('parseVoResponse', () => {
  it('accepts a fenced array and ignores malformed entries', () => {
    const parsed = parseVoResponse('```json\n[{"index":0,"vo_line":"A line."},{"index":"x"}]\n```');
    expect(parsed).toEqual([{ index: 0, vo_line: 'A line.' }]);
  });

  it('returns nothing usable rather than throwing', () => {
    expect(parseVoResponse('sorry')).toEqual([]);
    expect(parseVoResponse('[oops')).toEqual([]);
  });
});

describe('applyVoRewrites', () => {
  it('rewrites a line that exists', () => {
    const source = clips();
    const { clips: out } = applyVoRewrites(source, [{ index: 0, vo_line: 'A quieter opening.' }]);
    expect(out[0]!.vo_line).toBe('A quieter opening.');
  });

  it('lets the model blank a line', () => {
    const source = clips();
    const { clips: out } = applyVoRewrites(source, [{ index: 0, vo_line: '' }]);
    expect(out[0]!.vo_line).toBe('');
  });

  it('refuses to narrate a clip the Curator left silent', () => {
    const source = clips();
    const silent = source.findIndex((c) => c.vo_line === '');
    expect(silent).toBeGreaterThan(-1);
    const { clips: out, violations } = applyVoRewrites(source, [
      { index: silent, vo_line: 'Sneaking narration in.' },
    ]);
    expect(out[silent]!.vo_line).toBe('');
    expect(violations.some((v) => v.code === 'vo_added_to_silent_clip')).toBe(true);
  });

  it('strips school assignment phrasing the rewrite reintroduced', () => {
    const source = clips();
    const { clips: out, violations } = applyVoRewrites(source, [
      { index: 0, vo_line: 'Children here will attend Norcross High School.' },
    ]);
    expect(out[0]!.vo_line).toBe('');
    expect(violations.some((v) => v.code === 'vo_school_assignment_stripped')).toBe(true);
    expect(() => assertNoSchoolAssignment(out)).not.toThrow();
  });

  it('reports a pace outside the spoken range', () => {
    const source = clips();
    const { violations } = applyVoRewrites(
      source,
      source.map((c, i) => ({ index: i, vo_line: c.vo_line === '' ? '' : 'Short.' })),
    );
    expect(violations.some((v) => v.code === 'vo_rate_out_of_range')).toBe(true);
  });

  it('accepts a script inside the range', () => {
    const source = clips();
    // ~2.4 words/sec on every narrated clip.
    const rewrites = source.map((c, i) => ({
      index: i,
      vo_line:
        c.vo_line === ''
          ? ''
          : Array.from({ length: Math.round(c.duration_s * 2.4) }, () => 'word').join(' '),
    }));
    const { clips: out, violations } = applyVoRewrites(source, rewrites);
    const stats = narrationStats(out);
    expect(stats.rate).toBeGreaterThanOrEqual(WORDS_PER_SECOND_MIN);
    expect(stats.rate).toBeLessThanOrEqual(WORDS_PER_SECOND_MAX);
    expect(violations.filter((v) => v.code === 'vo_rate_out_of_range')).toHaveLength(0);
  });
});

describe('assertNoSchoolAssignment', () => {
  it('throws rather than letting the phrasing ship', () => {
    const source = clips();
    const bad = [{ ...source[0]!, vo_line: 'The home is zoned for Simpson Elementary.' }];
    expect(() => assertNoSchoolAssignment(bad)).toThrow(/school assignment/);
  });

  it('passes the Curator drafts, which the Guard already cleaned', () => {
    expect(() => assertNoSchoolAssignment(clips())).not.toThrow();
  });
});
