/**
 * Pixel dimensions from an image's file header.
 *
 * The Scheduler drops a photo that would need too much upscaling for the 9:16
 * canvas (see `isTooLowRes`), so every ingest path has to record real
 * dimensions rather than guess.
 *
 * JPEG, PNG and WebP. WebP was added 2026-08-23 because it is not an exotic
 * format any more — a site built this decade serves it as the default, and
 * `ingestPagePhotos` rejects anything this function cannot read with "not a
 * JPEG or PNG". So the whole website-ingest step came back empty-handed on
 * exactly the modern sites whose photos are worth having, and it looked like a
 * page with no images on it rather than a format we could not parse.
 *
 * All three encode their size in the header, so this stays dependency-free —
 * which matters: the alternative is `sharp`, a native binary in a Vercel
 * function, to read six bytes.
 */

export interface ImageSize {
  width: number;
  height: number;
}

export function imageSizeOf(bytes: Buffer): ImageSize | null {
  // PNG: IHDR width/height are big-endian u32 at offsets 16 and 20.
  if (bytes.length > 24 && bytes.readUInt32BE(0) === 0x89504e47) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }

  // WebP: a RIFF container — "RIFF" <u32 size> "WEBP" then one chunk whose
  // FourCC says which of the three encodings it is. All three are in the wild
  // and they store the dimensions differently, so all three are read here.
  if (bytes.length > 30 && bytes.readUInt32BE(0) === 0x52494646 /* RIFF */) {
    if (bytes.readUInt32BE(8) !== 0x57454250 /* WEBP */) return null;
    const chunk = bytes.readUInt32BE(12);
    // VP8 (lossy): a 3-byte start code, then 14-bit width and height as LE
    // u16s at offsets 26 and 28. The top two bits of each are the scale.
    if (chunk === 0x56503820 /* "VP8 " */ && bytes.length > 30) {
      return {
        width: bytes.readUInt16LE(26) & 0x3fff,
        height: bytes.readUInt16LE(28) & 0x3fff,
      };
    }
    // VP8L (lossless): 14-bit width-1 and height-1 packed into the 28 bits
    // after the 0x2f signature byte, little-endian.
    if (chunk === 0x5650384c /* "VP8L" */ && bytes.length > 25) {
      if (bytes[20] !== 0x2f) return null;
      const bits = bytes.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    // VP8X (extended — alpha, animation): canvas size as two 24-bit LE
    // values, each stored minus one, at offsets 24 and 27.
    if (chunk === 0x56503858 /* "VP8X" */ && bytes.length > 30) {
      const le24 = (off: number) => bytes[off]! | (bytes[off + 1]! << 8) | (bytes[off + 2]! << 16);
      return { width: le24(24) + 1, height: le24(27) + 1 };
    }
    return null;
  }

  // JPEG: walk the segment chain to the SOFn frame header, which carries the
  // dimensions. The segments before it (EXIF, quantisation tables) vary in
  // size, so the offset cannot be hardcoded.
  if (bytes.length > 4 && bytes.readUInt16BE(0) === 0xffd8) {
    let off = 2;
    while (off + 9 < bytes.length) {
      if (bytes[off] !== 0xff) return null;
      const marker = bytes[off + 1]!;
      // SOF0..SOF15, minus the three markers in that range that are not frame
      // headers: DHT (c4), JPGA (c8), DAC (cc).
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      ) {
        return { height: bytes.readUInt16BE(off + 5), width: bytes.readUInt16BE(off + 7) };
      }
      off += 2 + bytes.readUInt16BE(off + 2);
    }
  }

  return null;
}
