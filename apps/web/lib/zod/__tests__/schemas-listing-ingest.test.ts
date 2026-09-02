import { describe, expect, it } from 'vitest';
import { ListingPhotoIngest } from '../schemas';

describe('ListingPhotoIngest', () => {
  it('accepts an http(s) page URL', () => {
    expect(ListingPhotoIngest.safeParse({ url: 'https://builder.example/home/1' }).success).toBe(
      true,
    );
  });

  it('rejects a non-http scheme — the server is the one making the request', () => {
    expect(ListingPhotoIngest.safeParse({ url: 'file:///etc/passwd' }).success).toBe(false);
    expect(ListingPhotoIngest.safeParse({ url: 'not a url' }).success).toBe(false);
  });

  it('needs no label, unlike the community twin', () => {
    const parsed = ListingPhotoIngest.parse({ url: 'https://builder.example/home/1' });
    expect(parsed).toEqual({ url: 'https://builder.example/home/1' });
  });
});
