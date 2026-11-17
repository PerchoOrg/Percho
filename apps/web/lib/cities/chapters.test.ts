import type { CityFilmChapter, CityFilmLine } from '@/lib/zod/city-profile';
import { describe, expect, it } from 'vitest';
import { chapterProblems } from './chapters';

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
        film('overview', 'schools', 'schools', 'homes', 'signature', 'commute', 'history'),
        'Golf',
      ),
    ).toEqual([]);
  });

  it('refuses a chapter told in two places — it could not be watched alone', () => {
    const problems = chapterProblems(film('overview', 'schools', 'homes', 'commute', 'overview'));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('"overview" is told in two places');
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
