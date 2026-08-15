import { AI_VIDEO_DURATIONS, MAX_PHOTOS_PER_BATCH } from '@/lib/poi/ai-tour-video';
/**
 * Request schema for POST /api/admin/community-tour/[id]/ai-video.
 *
 * The photo cap is enforced here (not only in the UI) because every extra id
 * in the array is another paid provider call.
 */
import { z } from 'zod';

export const GenerateAiTourVideos = z.object({
  // Seedance 2.0 Mini takes up to 9 first-frame reference photos per job; the
  // cap here (also enforced in the UI) bounds the upload+submit cost per click.
  photoIds: z.array(z.string().uuid()).min(1).max(MAX_PHOTOS_PER_BATCH),
  prompt: z.string().trim().min(10).max(2000),
  durationS: z
    .number()
    .int()
    .refine((n): n is (typeof AI_VIDEO_DURATIONS)[number] =>
      (AI_VIDEO_DURATIONS as readonly number[]).includes(n),
    ),
});

export type GenerateAiTourVideos = z.infer<typeof GenerateAiTourVideos>;
