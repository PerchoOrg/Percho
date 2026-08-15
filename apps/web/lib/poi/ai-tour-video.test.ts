import { GenerateAiTourVideos } from '@/lib/zod/ai-tour-video';
import { describe, expect, it } from 'vitest';
import { MAX_PHOTOS_PER_BATCH, clipPrompt, defaultTourPrompt } from './ai-tour-video';

const UUID = '11111111-1111-1111-1111-111111111111';
const OK_PROMPT = 'A cinematic clip of the neighborhood.';

describe('defaultTourPrompt', () => {
  it('includes the community and its city/state', () => {
    const p = defaultTourPrompt({ name: 'Waterside', city: 'Frisco', state: 'TX' });
    expect(p).toContain('Waterside');
    expect(p).toContain('Frisco, TX');
  });

  it('omits the place clause when city/state are missing', () => {
    const p = defaultTourPrompt({ name: 'Waterside', city: null, state: null });
    expect(p).toContain('Waterside');
    expect(p).not.toContain(' in ,');
  });
});

describe('clipPrompt', () => {
  it('appends the POI so two clips in one batch differ', () => {
    expect(clipPrompt('Base prompt.', 'Wade Park')).toBe(
      'Base prompt. Featured location: Wade Park.',
    );
  });

  it('leaves the base alone when the photo has no POI name', () => {
    expect(clipPrompt('  Base prompt.  ', null)).toBe('Base prompt.');
    expect(clipPrompt('Base prompt.', '   ')).toBe('Base prompt.');
  });
});

describe('GenerateAiTourVideos', () => {
  it('accepts a well-formed request', () => {
    const res = GenerateAiTourVideos.safeParse({
      photoIds: [UUID],
      prompt: OK_PROMPT,
      durationS: 8,
    });
    expect(res.success).toBe(true);
  });

  it('rejects a batch over the paid-call cap', () => {
    const res = GenerateAiTourVideos.safeParse({
      photoIds: Array.from({ length: MAX_PHOTOS_PER_BATCH + 1 }, () => UUID),
      prompt: OK_PROMPT,
      durationS: 8,
    });
    expect(res.success).toBe(false);
  });

  it('rejects an empty selection, a non-uuid id and an unsupported duration', () => {
    expect(
      GenerateAiTourVideos.safeParse({ photoIds: [], prompt: OK_PROMPT, durationS: 8 }).success,
    ).toBe(false);
    expect(
      GenerateAiTourVideos.safeParse({ photoIds: ['nope'], prompt: OK_PROMPT, durationS: 8 })
        .success,
    ).toBe(false);
    expect(
      GenerateAiTourVideos.safeParse({ photoIds: [UUID], prompt: OK_PROMPT, durationS: 3 }).success,
    ).toBe(false);
    expect(
      GenerateAiTourVideos.safeParse({ photoIds: [UUID], prompt: OK_PROMPT, durationS: 16 })
        .success,
    ).toBe(false);
  });
});
