/**
 * Pixel dimensions from an image's file header.
 *
 * The Scheduler drops a photo that would need too much upscaling for the 9:16
 * canvas (see `isTooLowRes`), so every ingest path has to record real
 * dimensions rather than guess. The pipeline only ever stores JPEG and PNG,
 * and both encode their size at a fixed place in the header — not worth a
 * dependency.
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
