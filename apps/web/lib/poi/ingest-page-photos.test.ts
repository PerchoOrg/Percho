import { describe, expect, it } from 'vitest';
import { extractImageUrls } from './ingest-page-photos';

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
