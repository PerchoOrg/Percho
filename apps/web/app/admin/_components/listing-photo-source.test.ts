import { describe, expect, it } from 'vitest';
import { parseSourceUrls } from './ListingPhotoSourcePanel';

describe('parseSourceUrls', () => {
  it('reads one URL per line, in order', () => {
    expect(parseSourceUrls('https://a.example/one\nhttps://b.example/two')).toEqual([
      'https://a.example/one',
      'https://b.example/two',
    ]);
  });

  it('tolerates blank lines and stray whitespace from a paste', () => {
    expect(parseSourceUrls('  https://a.example/one  \n\n\thttps://b.example/two\n')).toEqual([
      'https://a.example/one',
      'https://b.example/two',
    ]);
  });

  it('drops a page listed twice — fetching it again only yields skips', () => {
    expect(parseSourceUrls('https://a.example/x\nhttps://a.example/x')).toEqual([
      'https://a.example/x',
    ]);
  });

  it('is empty for an empty box, so the button stays disabled', () => {
    expect(parseSourceUrls('   \n  ')).toEqual([]);
  });
});
