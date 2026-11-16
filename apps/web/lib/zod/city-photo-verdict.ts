/** Inputs of the city photo review actions (phase343). */
import { z } from 'zod';

export const cityPhotoVerdictSchema = z.object({
  cityId: z.string().uuid(),
  photoId: z.string().uuid(),
  status: z.enum(['approved', 'rejected', 'pending']),
});

/** A rejection that binds every place — legal reasons only. */
export const legalRejectionSchema = z.object({
  photoId: z.string().uuid(),
  reason: z.string().trim().min(3).max(200),
});
