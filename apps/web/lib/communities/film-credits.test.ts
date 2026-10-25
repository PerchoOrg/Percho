import { describe, expect, it } from 'vitest';
import { clipPhotoIds, googleAuthorNames } from './film-credits';

const google = (id: string, ...names: string[]) => ({
  id,
  source: 'google_places',
  attribution: { authorAttributions: names.map((displayName) => ({ displayName })) },
});

describe('googleAuthorNames', () => {
  it('lists Google authors in the order the film shows their photos', () => {
    const rows = [google('p3', 'Cara'), google('p1', 'Ann'), google('p2', 'Bo')];
    expect(googleAuthorNames(rows, ['p1', 'p2', 'p3'])).toEqual(['Ann', 'Bo', 'Cara']);
  });

  it('names each author once, however many of their photos the film uses', () => {
    const rows = [google('p1', 'Ann'), google('p2', 'Ann', 'Bo')];
    expect(googleAuthorNames(rows, ['p1', 'p2'])).toEqual(['Ann', 'Bo']);
  });

  it('skips photos with no Google author: community-site rows, blanks, bad shapes', () => {
    const rows = [
      { id: 'p1', source: 'community_site', attribution: { source_page: 'https://x.test' } },
      google('p2', '  '),
      { id: 'p3', source: 'google_places', attribution: null },
      { id: 'p4', source: 'google_places', attribution: { authorAttributions: 'nope' } },
      google('p5', ' Dee '),
    ];
    expect(googleAuthorNames(rows, ['p1', 'p2', 'p3', 'p4', 'p5'])).toEqual(['Dee']);
  });
});

describe('clipPhotoIds', () => {
  it('reads photo ids from an assembly in film order, without repeats', () => {
    const clips = [{ photo_id: 'a' }, { photo_id: 'b' }, { photo_id: 'a' }, { poi_id: 'x' }];
    expect(clipPhotoIds(clips)).toEqual(['a', 'b']);
  });

  it('treats a non-array as no photos', () => {
    expect(clipPhotoIds(null)).toEqual([]);
    expect(clipPhotoIds({ photo_id: 'a' })).toEqual([]);
  });
});
