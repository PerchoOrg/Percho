import { describe, expect, it } from 'vitest';
import {
  CURATOR_PROMPT,
  CuratorParseError,
  buildCuratorPrompt,
  extractJsonArray,
  parseCuratorResponse,
  renderPhotoBatch,
} from './curator';
import type { CuratorPhoto } from './curator';
import { GOLDEN_ANNOTATIONS, GOLDEN_PHOTOS } from './fixtures/peachtree-corners';

const photos: CuratorPhoto[] = GOLDEN_PHOTOS.slice(0, 3).map((p) => ({
  photo_id: p.photo_id,
  poi_name: p.poi_name,
  bucket: p.bucket,
  width_px: p.width_px,
  height_px: p.height_px,
  bytes: new Uint8Array([0xff, 0xd8, 0xff]),
  mime_type: 'image/jpeg',
}));

describe('buildCuratorPrompt', () => {
  it('substitutes the batch and leaves no placeholder', () => {
    const prompt = buildCuratorPrompt(photos);
    expect(prompt).not.toContain('{{PHOTO_BATCH}}');
    for (const p of photos) expect(prompt).toContain(p.photo_id);
    expect(prompt).toContain('3072x4080');
  });

  it('keeps the hard school constraint in the prompt', () => {
    expect(CURATOR_PROMPT).toContain('never state or imply school assignment');
    expect(CURATOR_PROMPT).toContain('Assign at most ONE opener and at most ONE closer');
  });

  it('lists photos in order with poi and bucket context', () => {
    const batch = renderPhotoBatch(photos);
    expect(batch.split('\n')).toHaveLength(3);
    expect(batch).toContain('1. photo_id:');
    expect(batch).toContain('poi_name: Corners Connector Trail');
    expect(batch).toContain('bucket: outdoor');
  });
});

describe('extractJsonArray', () => {
  it('survives markdown fences and chatter', () => {
    expect(extractJsonArray('Here you go:\n```json\n[{"a":1}]\n```\nHope that helps')).toBe(
      '[{"a":1}]',
    );
    expect(extractJsonArray('[1,2,3]')).toBe('[1,2,3]');
  });

  it('returns null when there is no array', () => {
    expect(extractJsonArray('I cannot help with that.')).toBeNull();
    expect(extractJsonArray('{"a":1}')).toBeNull();
  });
});

describe('parseCuratorResponse', () => {
  const ids = GOLDEN_ANNOTATIONS.map((a) => a.photo_id);

  it('round-trips a well-formed batch', () => {
    const raw = JSON.stringify(GOLDEN_ANNOTATIONS);
    const out = parseCuratorResponse(raw, ids);
    expect(out.annotations).toEqual(GOLDEN_ANNOTATIONS);
    expect(out.missing).toEqual([]);
    expect(out.unknown).toEqual([]);
    expect(out.warnings).toEqual([]);
  });

  it('drops invented photo ids and reports the ones never answered', () => {
    const raw = JSON.stringify([
      ...GOLDEN_ANNOTATIONS.slice(0, 2),
      { ...GOLDEN_ANNOTATIONS[0], photo_id: 'not-a-real-photo' },
    ]);
    const out = parseCuratorResponse(raw, ids);
    expect(out.unknown).toEqual(['not-a-real-photo']);
    expect(out.annotations).toHaveLength(2);
    expect(out.missing).toHaveLength(ids.length - 2);
  });

  it('applies the same coercions the Scheduler relies on', () => {
    const raw = JSON.stringify([
      { ...GOLDEN_ANNOTATIONS[0], dominant_subject: 'drone_shot' },
      { ...GOLDEN_ANNOTATIONS[1], narrative_role: 'opener' },
    ]);
    const out = parseCuratorResponse(raw, ids);
    expect(out.annotations[0]!.dominant_subject).toBe('interior_close');
    expect(out.annotations.filter((a) => a.narrative_role === 'opener')).toHaveLength(1);
    expect(out.warnings.map((w) => w.code)).toContain('annotation_enum_coerced');
  });

  it('throws a parse error the caller can retry on', () => {
    expect(() => parseCuratorResponse('sorry, no', ids)).toThrow(CuratorParseError);
    expect(() => parseCuratorResponse('[{"photo_id": ', ids)).toThrow(CuratorParseError);
    expect(() => parseCuratorResponse('{"photo_id":"x"}', ids)).toThrow(CuratorParseError);
  });
});
