import { describe, expect, it } from 'vitest';
import { cityFilmCredits } from './detail';

const google = (id: string, name: string) => ({
  id,
  source: 'google_places',
  attribution: { authorAttributions: [{ displayName: name }] },
});
const commons = (id: string, author: string, licence: string, page: string) => ({
  id,
  source: 'wikimedia_commons',
  attribution: { commons_title: `File:${id}.jpg`, author, licence, source_page: page },
});

describe('cityFilmCredits', () => {
  it('credits Google authors by name and Commons files with author, licence and link, in film order', () => {
    const rows = [
      commons(
        'c',
        'John Phelan',
        'CC BY 4.0',
        'https://commons.wikimedia.org/wiki/File:Caboose.jpg',
      ),
      google('a', 'Ana'),
      commons('d', 'USGS', 'Public domain', 'https://commons.wikimedia.org/wiki/File:Map.jpg'),
      google('b', 'Ben'),
    ];
    expect(cityFilmCredits(rows, ['b', 'd', 'a', 'c'])).toEqual({
      google: ['Ben', 'Ana'],
      commons: [
        {
          author: 'USGS',
          licence: 'Public domain',
          url: 'https://commons.wikimedia.org/wiki/File:Map.jpg',
        },
        {
          author: 'John Phelan',
          licence: 'CC BY 4.0',
          url: 'https://commons.wikimedia.org/wiki/File:Caboose.jpg',
        },
      ],
    });
  });

  it('lists a Commons file once, and never without the page a credit must link to', () => {
    const page = 'https://commons.wikimedia.org/wiki/File:Bridge.jpg';
    const rows = [
      commons('a', 'John Phelan', 'CC BY 4.0', page),
      commons('b', 'John Phelan', 'CC BY 4.0', page),
      { id: 'c', source: 'wikimedia_commons', attribution: { author: 'Nobody' } },
      { id: 'd', source: 'community_site', attribution: { source_page: 'https://example.com' } },
    ];
    expect(cityFilmCredits(rows, ['a', 'b', 'c', 'd']).commons).toEqual([
      { author: 'John Phelan', licence: 'CC BY 4.0', url: page },
    ]);
  });

  it('names an unknown author as unknown rather than leaving the credit blank', () => {
    const rows = [
      {
        id: 'a',
        source: 'wikimedia_commons',
        attribution: { author: ' ', licence: 'CC0', source_page: 'https://x' },
      },
    ];
    expect(cityFilmCredits(rows, ['a']).commons[0]?.author).toBe('Unknown author');
  });
});
