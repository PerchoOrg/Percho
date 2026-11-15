import { describe, expect, it } from 'vitest';
import { commonsLicenceOk, commonsSearchUrl, parseCommonsPages } from './commons';

describe('commonsLicenceOk', () => {
  it('accepts public domain, CC0 and CC BY', () => {
    for (const l of [
      'CC0',
      'Public domain',
      'CC BY 4.0',
      'CC BY 3.0',
      'CC BY 2.0',
      'CC BY 3.0 us',
    ]) {
      expect(commonsLicenceOk(l), l).toBe(true);
    }
  });

  it('refuses share-alike — a film is a derivative work', () => {
    for (const l of ['CC BY-SA 4.0', 'CC BY-SA 3.0', 'CC-BY-SA-2.5']) {
      expect(commonsLicenceOk(l), l).toBe(false);
    }
  });

  it('refuses non-commercial, no-derivatives, and anything it does not know', () => {
    for (const l of ['CC BY-NC 2.0', 'CC BY-ND 4.0', 'GFDL', 'Copyrighted free use', '', null]) {
      expect(commonsLicenceOk(l), String(l)).toBe(false);
    }
  });
});

describe('parseCommonsPages', () => {
  const page = (over: Record<string, unknown>) => ({
    title: 'File:Suwanee Caboose, Suwanee GA.jpg',
    index: 1,
    imageinfo: [
      {
        url: 'https://upload.wikimedia.org/a.jpg',
        thumburl: 'https://upload.wikimedia.org/thumb/a.jpg/1920px-a.jpg',
        descriptionurl: 'https://commons.wikimedia.org/wiki/File:a.jpg',
        width: 4032,
        height: 3024,
        extmetadata: {
          LicenseShortName: { value: 'CC BY 4.0' },
          Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:X">John &amp; Co</a>' },
        },
      },
    ],
    ...over,
  });

  it('reads the rendition to download, the page, the licence and a plain author', () => {
    const [file] = parseCommonsPages({ query: { pages: { '1': page({}) } } });
    expect(file).toEqual({
      title: 'File:Suwanee Caboose, Suwanee GA.jpg',
      downloadUrl: 'https://upload.wikimedia.org/thumb/a.jpg/1920px-a.jpg',
      pageUrl: 'https://commons.wikimedia.org/wiki/File:a.jpg',
      width: 4032,
      height: 3024,
      licence: 'CC BY 4.0',
      author: 'John & Co',
    });
  });

  it('keeps search order and drops what is not a photograph', () => {
    const files = parseCommonsPages({
      query: {
        pages: {
          '9': page({ title: 'File:B.jpg', index: 2 }),
          '3': page({ title: 'File:A.png', index: 1 }),
          '5': page({ title: 'File:Seal.svg', index: 0 }),
          '7': page({ title: 'File:Topo.pdf', index: 3 }),
        },
      },
    });
    expect(files.map((f) => f.title)).toEqual(['File:A.png', 'File:B.jpg']);
  });

  it('is empty for an empty or malformed response', () => {
    expect(parseCommonsPages(null)).toEqual([]);
    expect(parseCommonsPages({ batchcomplete: '' })).toEqual([]);
  });
});

describe('commonsSearchUrl', () => {
  it('asks for a standard thumbnail width, which is the only kind Commons serves', () => {
    expect(commonsSearchUrl('Suwanee Georgia')).toContain('iiurlwidth=1920');
    expect(commonsSearchUrl('Suwanee Georgia')).toContain('gsrsearch=Suwanee%20Georgia');
  });
});
