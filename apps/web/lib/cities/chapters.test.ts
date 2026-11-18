import type { CityFilmChapter, CityFilmLine } from '@/lib/zod/city-profile';
import { describe, expect, it } from 'vitest';
import { bySection, chapterProblems, sectionOf, shortSections } from './chapters';

const line = (chapter?: CityFilmChapter): CityFilmLine =>
  ({
    say: 'A line of narration about the city.',
    chapter,
    shots: [{ photo: 'aaaaaaaa' }],
  }) as CityFilmLine;
const film = (...chapters: Array<CityFilmChapter | undefined>) => chapters.map(line);

describe('chapterProblems', () => {
  it('accepts a film of whole chapters with the four every city has', () => {
    expect(
      chapterProblems(
        film(
          'overview',
          'signature',
          'history',
          'schools',
          'schools',
          'homes',
          'commute',
          'outdoor',
        ),
        'Golf',
      ),
    ).toEqual([]);
  });

  it('wants a section in one piece — it is one stretch of the bar', () => {
    const problems = chapterProblems(
      film('overview', 'schools', 'homes', 'commute', 'outdoor', 'history', 'events'),
    );
    expect(problems).toEqual([
      'the "Overview" section is split — keep its chapters together (overview, signature, history, growth, future)',
      'the "Life" section is split — keep its chapters together (daily, outdoor, downtown, events)',
    ]);
  });

  it('refuses a chapter told in two places — it could not be watched alone', () => {
    const problems = chapterProblems(film('overview', 'schools', 'homes', 'commute', 'overview'));
    expect(problems[0]).toContain('"overview" is told in two places');
    // …which also splits its section.
    expect(problems).toHaveLength(2);
  });

  it('names each required chapter that is missing', () => {
    expect(chapterProblems(film('overview', 'schools', 'outdoor'))).toEqual([
      'no "homes" chapter — every city has one',
      'no "commute" chapter — every city has one',
    ]);
  });

  it('wants every line in a chapter, the overview first, and a name for the signature', () => {
    const problems = chapterProblems(
      film('schools', 'overview', 'homes', 'commute', 'signature', undefined),
    );
    expect(problems.some((p) => p.includes('has no chapter'))).toBe(true);
    expect(problems).toContain('the film opens on the overview');
    expect(problems.some((p) => p.includes('film.signature'))).toBe(true);
  });
});

describe('sections', () => {
  it('files every chapter under one of five', () => {
    expect(sectionOf('signature')).toEqual({ key: 'about', label: 'Overview' });
    expect(sectionOf('events')?.label).toBe('Life');
    expect(sectionOf('dining')).toBeNull();
  });

  it('re-files segments, and leaves alone what is not a chapter', () => {
    expect(
      bySection([
        { bucket: 'signature', bucketLabel: 'Golf' },
        { bucket: 'outdoor' },
        { bucket: 'dining' },
        {},
      ]),
    ).toEqual([
      { bucket: 'about', bucketLabel: 'Overview' },
      { bucket: 'life', bucketLabel: 'Life' },
      { bucket: 'dining' },
      {},
    ]);
  });
});

describe('shortSections', () => {
  const part = (chapter: CityFilmChapter, seconds: number) => ({ chapter, seconds });

  it('passes a film whose sections each take 15% or more', () => {
    expect(
      shortSections([
        part('overview', 10),
        part('signature', 15),
        part('schools', 18),
        part('homes', 17),
        part('commute', 17),
        part('outdoor', 12),
        part('events', 11),
      ]),
    ).toEqual([]);
  });

  it('names a section too short to carry its name, and what it needs', () => {
    const problems = shortSections([
      part('overview', 42),
      part('schools', 17),
      part('homes', 10),
      part('commute', 9),
      part('outdoor', 35),
    ]);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain('the "Homes" section runs 10s, 9% of the film');
    expect(problems[0]).toContain('about 17s here');
    expect(problems[1]).toContain('"Commute"');
  });
});
