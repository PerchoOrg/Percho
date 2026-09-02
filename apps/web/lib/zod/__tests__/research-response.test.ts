import { describe, expect, it } from 'vitest';
import {
  CLOSED_STUDIES,
  RESEARCH_STUDIES,
  isStudyClosed,
  researchResponseSchema,
} from '../research-response';

const good = {
  study: 'atlanta-remote-buyer-v4',
  lang: 'zh',
  answers: { q1_area: 'other', q1_area_other: 'Marietta', q3_sources: ['agent_video', 'street_view'], q7_video: 5 },
  contact: 'wx: buyer',
  durationMs: 420_000,
};

describe('researchResponseSchema', () => {
  it('accepts a single choice, a list, and a 1–5 rating', () => {
    expect(researchResponseSchema.safeParse(good).success).toBe(true);
  });

  it('rejects an unknown study and a filled honeypot', () => {
    expect(researchResponseSchema.safeParse({ ...good, study: 'made-up' }).success).toBe(false);
    expect(researchResponseSchema.safeParse({ ...good, website: 'http://x' }).success).toBe(false);
  });

  it('rejects ratings outside 1–5, bad keys and empty answers', () => {
    expect(researchResponseSchema.safeParse({ ...good, answers: { q7_video: 6 } }).success).toBe(false);
    expect(researchResponseSchema.safeParse({ ...good, answers: { notes: 'x' } }).success).toBe(false);
    expect(researchResponseSchema.safeParse({ ...good, answers: {} }).success).toBe(false);
  });

  it('defaults lang to zh', () => {
    const parsed = researchResponseSchema.parse({ study: good.study, answers: good.answers });
    expect(parsed.lang).toBe('zh');
  });

  it('reports the atlanta study as closed while still parsing its rows', () => {
    expect(isStudyClosed('atlanta-remote-buyer-v4')).toBe(true);
    expect(isStudyClosed('some-future-study')).toBe(false);
    // closing shuts the write path only — old rows must still validate
    expect(researchResponseSchema.safeParse(good).success).toBe(true);
  });

  it('only closes ids that are real studies', () => {
    for (const id of CLOSED_STUDIES) {
      expect(RESEARCH_STUDIES).toContain(id);
    }
  });
});
