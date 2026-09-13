/**
 * Zod schema for GET /api/mobile/map?minLat=…&maxLat=…&minLng=…&maxLng=…
 *
 * The viewport query behind the zoom-band map (phase281): the phone sends its
 * visible bounds and gets the communities and homes inside them. The span cap
 * is the server refusing to be a full-table dump — at metro zoom the client
 * has no business asking (its own bands draw nothing that wide), so a huge
 * box is a bug or an abuse, not a use case.
 */
import { z } from 'zod';

/** Wider than any band that draws content (city band ≈ 0.30°), with slack. */
const MAX_SPAN_DEG = 2.0;

const lat = z.coerce.number().gte(-90).lte(90);
const lng = z.coerce.number().gte(-180).lte(180);

export const mobileMapBoundsSchema = z
  .object({ minLat: lat, maxLat: lat, minLng: lng, maxLng: lng })
  .refine((b) => b.minLat < b.maxLat && b.minLng < b.maxLng, {
    message: 'bounds are empty or inverted',
  })
  .refine((b) => b.maxLat - b.minLat <= MAX_SPAN_DEG && b.maxLng - b.minLng <= MAX_SPAN_DEG, {
    message: `bounds span more than ${MAX_SPAN_DEG} degrees`,
  });

export type MobileMapBounds = z.infer<typeof mobileMapBoundsSchema>;
