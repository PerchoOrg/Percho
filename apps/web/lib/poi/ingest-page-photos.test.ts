import { describe, expect, it } from 'vitest';
import { extractImageUrls, isFurniture } from './ingest-page-photos';

const PAGE = 'https://www.aberdeencommunity.org/photo-album/';

describe('extractImageUrls', () => {
  it('resolves relative, root-relative and absolute sources against the page', () => {
    const urls = extractImageUrls(
      `<img src="/grfx/header1a.jpg">
       <img src="photos/pool.jpg">
       <img src="https://cdn.example.com/clubhouse.jpg">`,
      PAGE,
    );
    expect(urls).toContain('https://www.aberdeencommunity.org/grfx/header1a.jpg');
    expect(urls).toContain('https://www.aberdeencommunity.org/photo-album/photos/pool.jpg');
    expect(urls).toContain('https://cdn.example.com/clubhouse.jpg');
  });

  it('follows a link to the full-size file, not just the thumbnail', () => {
    // The Aberdeen album's shape: the <img> is a thumbnail and the real photo
    // is only reachable through the <a href> wrapping it.
    const urls = extractImageUrls(
      `<a href="/editor_upload/docs/photo2/o_1e8t.jpg"><img src="/thumb/o_1e8t_small.jpg"></a>`,
      PAGE,
    );
    expect(urls).toContain(
      'https://www.aberdeencommunity.org/editor_upload/docs/photo2/o_1e8t.jpg',
    );
    expect(urls).toContain('https://www.aberdeencommunity.org/thumb/o_1e8t_small.jpg');
  });

  it('takes every candidate in a srcset, not only the first', () => {
    const urls = extractImageUrls(
      `<img srcset="/a-480.jpg 480w, /a-960.jpg 960w, /a-1920.jpg 1920w" src="/a-480.jpg">`,
      PAGE,
    );
    expect(urls).toContain('https://www.aberdeencommunity.org/a-960.jpg');
    expect(urls).toContain('https://www.aberdeencommunity.org/a-1920.jpg');
  });

  it('collapses one photo served at four widths down to the widest', () => {
    // The Providence Group's shape, and what buried Bellmoore Park's gallery:
    // four variants of one photograph, the 300px one first in document order.
    // Counted as four images they exhausted MAX_IMAGES ten photos in; picked
    // by document order the thumbnail then failed the size floor.
    const urls = extractImageUrls(
      `<img srcset="/p/HbtM3.jpeg?width=300&amp;ois=aaa 300w,
                    /p/HbtM3.jpeg?width=400&amp;ois=bbb 400w,
                    /p/HbtM3.jpeg?width=1920&amp;ois=ccc 1920w"
            src="/p/HbtM3.jpeg?width=300&amp;ois=aaa">`,
      PAGE,
    );
    expect(urls).toEqual(['https://www.aberdeencommunity.org/p/HbtM3.jpeg?width=1920&ois=ccc']);
  });

  it('decodes the entities in an attribute, so the CDN gets its real query', () => {
    // `&amp;` left in place asks for a parameter named `amp;ois` — the resize
    // signature goes missing and a strict CDN answers 403.
    const urls = extractImageUrls(
      `<img src="/p/pool.jpg?width=1600&amp;fit=bounds&amp;ois=7796e8e">`,
      PAGE,
    );
    expect(urls).toEqual([
      'https://www.aberdeencommunity.org/p/pool.jpg?width=1600&fit=bounds&ois=7796e8e',
    ]);
  });

  it('keeps variants that declare no width apart, rather than guessing', () => {
    // `?size=thumb` and `?size=full` are not knowably the same picture, and
    // collapsing them on the path alone would cost whichever one it dropped.
    const urls = extractImageUrls(
      `<img src="/p/pool.jpg?size=thumb"><img src="/p/pool.jpg?size=full">`,
      PAGE,
    );
    expect(urls).toHaveLength(2);
  });

  it('keeps a width-bearing variant from swallowing a different photo', () => {
    const urls = extractImageUrls(
      `<img srcset="/p/pool.jpg?width=1920 1920w"><img srcset="/p/tennis.jpg?width=1920 1920w">`,
      PAGE,
    );
    expect(urls).toHaveLength(2);
  });

  it('ignores inline data URIs and non-image links', () => {
    const urls = extractImageUrls(
      `<img src="data:image/gif;base64,R0lGOD">
       <a href="/about/">About</a>
       <a href="/brochure.pdf">Brochure</a>`,
      PAGE,
    );
    expect(urls).toEqual([]);
  });

  it('returns each URL once however many times the page repeats it', () => {
    const urls = extractImageUrls(
      `<img src="/logo.png"><img src="/logo.png"><a href="/logo.png"></a>`,
      PAGE,
    );
    expect(urls).toEqual(['https://www.aberdeencommunity.org/logo.png']);
  });

  it('still lists site-furniture paths — the ingest, not the parser, drops them', () => {
    // Kept separate on purpose: extraction stays dumb and complete, so the
    // skip shows up in the panel's "why photos were skipped" list rather than
    // vanishing silently.
    const urls = extractImageUrls(
      `<img src="/app/themes/forsyth-county/assets/img/graphics/graphic-boat-launch.png">`,
      PAGE,
    );
    expect(urls).toHaveLength(1);
  });

  it('survives a malformed src rather than throwing the page away', () => {
    const urls = extractImageUrls(`<img src="http://"><img src="/real.jpg">`, PAGE);
    expect(urls).toContain('https://www.aberdeencommunity.org/real.jpg');
  });
});

describe('isFurniture', () => {
  it('rejects an SVG, which could never have become a photo', () => {
    // imageSizeOf reads JPEG and PNG headers only. Thirteen of Bellmoore
    // Park's first forty slots went to icon SVGs that were always going to be
    // thrown away — which is why this is decided before MAX_IMAGES, not inside
    // the capped loop.
    expect(isFurniture('https://static.example.com/providence/images/icon-bed.svg?v=1')).toBe(true);
  });

  it('rejects a themed asset path', () => {
    expect(isFurniture('https://example.org/app/themes/forsyth/assets/img/graphics/boat.png')).toBe(
      true,
    );
  });

  it('keeps a photograph served from a plain media path', () => {
    expect(isFurniture('https://media.example.com/259/2020/9/10/HbtM3.jpeg?width=1920')).toBe(
      false,
    );
  });
});
