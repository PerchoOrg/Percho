import { describe, expect, it } from 'vitest';
import { webPhotoStoragePath } from './ingest-listing-page-photos';
import { extensionFor } from './ingest-page-photos';

const LISTING = '4159c606-71ed-46d5-b612-306277f3f05e';
const HASH = 'a'.repeat(64);

describe('webPhotoStoragePath', () => {
  it('puts the listing id first, which is what storage RLS scopes on', () => {
    expect(webPhotoStoragePath(LISTING, HASH, 'image/jpeg').split('/')[0]).toBe(LISTING);
  });

  it('is content-addressed, so re-fetching the same bytes lands on the same object', () => {
    const a = webPhotoStoragePath(LISTING, HASH, 'image/jpeg');
    const b = webPhotoStoragePath(LISTING, HASH, 'image/jpeg');
    expect(a).toBe(b);
    expect(webPhotoStoragePath(LISTING, 'b'.repeat(64), 'image/jpeg')).not.toBe(a);
  });

  it('carries the extension the bytes actually are', () => {
    expect(webPhotoStoragePath(LISTING, HASH, 'image/png')).toMatch(/\.png$/);
    expect(webPhotoStoragePath(LISTING, HASH, 'image/webp')).toMatch(/\.webp$/);
    expect(webPhotoStoragePath(LISTING, HASH, 'image/jpeg')).toMatch(/\.jpg$/);
  });
});

describe('extensionFor', () => {
  it('falls back to .jpg for a content type it does not recognise', () => {
    expect(extensionFor('application/octet-stream')).toBe('.jpg');
    expect(extensionFor('image/jpeg; charset=binary')).toBe('.jpg');
  });

  it('reads the type out of a full header value', () => {
    expect(extensionFor('image/webp; charset=binary')).toBe('.webp');
  });
});
