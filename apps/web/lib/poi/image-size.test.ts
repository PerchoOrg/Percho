/**
 * Header parsing, checked against real files rather than against the spec I
 * think the spec says.
 *
 * Every hex string below is the first 32 bytes of an image fetched from
 * Google's own WebP gallery, and every expected dimension is what macOS `sips`
 * reports for that same file. The parser was run over the four whole files and
 * agreed with `sips` on all of them (2026-08-23); these truncated headers are
 * committed instead of ~500 KB of fixtures, because the header is all this
 * function ever reads.
 */

import { describe, expect, it } from 'vitest';
import { imageSizeOf } from './image-size';

/** A header, padded out to a length a real file would plausibly have. */
function header(hex: string, totalBytes = 4096): Buffer {
  const head = Buffer.from(hex, 'hex');
  return Buffer.concat([head, Buffer.alloc(totalBytes - head.length)]);
}

describe('imageSizeOf — WebP', () => {
  // gstatic.com/webp/gallery/1.webp — lossy, the common case.
  it('reads a VP8 (lossy) canvas', () => {
    const bytes = header('524946466876000057454250565038205c760000d2be019d012a260270013ed5');
    expect(imageSizeOf(bytes)).toEqual({ width: 550, height: 368 });
  });

  // gstatic.com/webp/gallery3/1_webp_ll.webp — lossless. Packs both edges into
  // the 28 bits after the 0x2f signature, which is the one layout that looks
  // nothing like the others.
  it('reads a VP8L (lossless) canvas', () => {
    const bytes = header('52494646a43f0100574542505650384c983f01002f8f014b104d486cdb489024');
    expect(imageSizeOf(bytes)).toEqual({ width: 400, height: 301 });
  });

  // gstatic.com/webp/gallery3/1_webp_a.webp — VP8X, here because it has alpha.
  it('reads a VP8X canvas (alpha)', () => {
    const bytes = header('52494646ce46000057454250565038580a000000100000008f01002c0100414c');
    expect(imageSizeOf(bytes)).toEqual({ width: 400, height: 301 });
  });

  // gstatic.com/webp/animated/1.webp — also VP8X. An animation still has one
  // canvas size, so it reads like any other photo; whether the tour should USE
  // an animated WebP is the vision tagger's problem, not this function's.
  it('reads a VP8X canvas (animated)', () => {
    const bytes = header('52494646aacf050057454250565038580a000000120000002b0100e00000414e');
    expect(imageSizeOf(bytes)).toEqual({ width: 300, height: 225 });
  });

  it('returns null for a RIFF container that is not WebP', () => {
    // "RIFF" + size + "WAVE" — a sound file, not an image.
    const bytes = header('524946462400000057415645666d7420100000000100020044ac0000');
    expect(imageSizeOf(bytes)).toBeNull();
  });

  it('returns null for a WebP whose chunk type it cannot read', () => {
    // Same container, an invented FourCC where VP8/VP8L/VP8X would be.
    const bytes = header('5249464668760000574542505A5A5A5A5c760000d2be019d012a260270013ed5');
    expect(imageSizeOf(bytes)).toBeNull();
  });
});

describe('imageSizeOf — PNG and JPEG still work', () => {
  it('reads a PNG IHDR', () => {
    // 8-byte signature, then a 13-byte IHDR whose width/height are u32 BE.
    const bytes = header('89504e470d0a1a0a0000000d494844520000027d0000019b0802000000');
    expect(imageSizeOf(bytes)).toEqual({ width: 637, height: 411 });
  });

  it('reads a JPEG SOF0 past a variable-length APP0', () => {
    // SOI, an APP0/JFIF segment of 16 bytes, then SOF0 with height then width.
    const bytes = header('ffd8ffe000104a46494600010100000100010000ffc0001108019b027d03');
    expect(imageSizeOf(bytes)).toEqual({ width: 637, height: 411 });
  });

  it('returns null for something that is not an image at all', () => {
    expect(imageSizeOf(header('3c21444f43545950452068746d6c3e0a3c68746d6c3e'))).toBeNull();
  });
});
