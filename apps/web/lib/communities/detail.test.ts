/**
 * Tests for the explore page's projection — specifically the tour-segments
 * rule added when the page's hero became the feed card's film (2026-08-23).
 * The reason/stat rules are pinned in `community-reasons.test.ts`; what is
 * worth asserting here is that segments never ship without a film to seek.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { projectCommunityDetail } from './detail';

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://test.supabase.co';
});

const ROW = {
  id: 'cc9fc1da-0597-42ed-b71d-5b96b7965303',
  slug: 'aberdeen-2',
  name: 'Aberdeen',
  city: 'Suwanee',
  state: 'GA',
  description: null,
  cover_storage_path: 'nextdoor/aberdeen-2.jpg',
  attributes: null,
  interests: null,
  residents_count: null,
  homeowners_pct: null,
  avg_age: null,
};

const SEGMENTS = [
  { name: 'Aberdeen Grounds', endFraction: 0.4 },
  { name: 'Aberdeen Pool', endFraction: 1 },
];

describe('projectCommunityDetail tour segments', () => {
  it('ships segments alongside the film they index', () => {
    const out = projectCommunityDetail(
      ROW,
      undefined,
      'https://videodelivery.net/uid/manifest/video.m3u8',
      SEGMENTS,
    );
    expect(out?.videoUrl).toContain('manifest/video.m3u8');
    expect(out?.tourSegments).toEqual(SEGMENTS);
  });

  it('never ships segments without a video URL', () => {
    // Segments are an index INTO the film; without one they would render a
    // "tour visits" list whose taps seek nothing.
    const out = projectCommunityDetail(ROW, undefined, null, SEGMENTS);
    expect(out?.videoUrl).toBeUndefined();
    expect(out?.tourSegments).toBeUndefined();
  });

  it('omits an empty segment list rather than sending []', () => {
    const out = projectCommunityDetail(
      ROW,
      undefined,
      'https://videodelivery.net/uid/manifest/video.m3u8',
      [],
    );
    expect(out?.tourSegments).toBeUndefined();
  });
});
