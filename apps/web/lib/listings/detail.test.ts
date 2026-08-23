import { describe, expect, it } from 'vitest';
import { projectComps, projectDetail, projectPhotos, projectVideo } from './detail';

const baseListing = {
  id: 'l1',
  slug: '1204-copper-leaf-ct',
  address: '1204 Copper Leaf Ct',
  city: 'Duluth',
  state: 'GA',
  price: 419000,
  beds: 3,
  baths: 3,
  sqft: 1870,
  year_built: 2006,
  hoa: null,
  description: ['A paragraph.'],
  community_id: null,
};

describe('projectDetail — absent means the key is omitted', () => {
  it('carries the real fields through', () => {
    const d = projectDetail(baseListing, [], []);
    expect(d.price).toBe(419000);
    expect(d.sqft).toBe(1870);
    expect(d.yearBuilt).toBe(2006);
    expect(d.city).toBe('Duluth');
  });

  it('has NO daysOnMarket field at all — the schema has no listing date', () => {
    const d = projectDetail(baseListing, [], []);
    expect('daysOnMarket' in d).toBe(false);
  });

  it('omits hoa entirely when the column is null or blank (255 of 265 rows)', () => {
    expect('hoaRaw' in projectDetail(baseListing, [], [])).toBe(false);
    expect('hoaRaw' in projectDetail({ ...baseListing, hoa: '   ' }, [], [])).toBe(false);
  });

  it('passes hoa through RAW so one client parser owns the ambiguity', () => {
    expect(projectDetail({ ...baseListing, hoa: ' $85/mo ' }, [], []).hoaRaw).toBe('$85/mo');
  });

  it('omits a zero or null price rather than emitting 0', () => {
    expect('price' in projectDetail({ ...baseListing, price: null }, [], [])).toBe(false);
    expect('price' in projectDetail({ ...baseListing, price: 0 }, [], [])).toBe(false);
  });

  it('omits sqft when zero — a $/sqft of Infinity is worse than no row', () => {
    expect('sqft' in projectDetail({ ...baseListing, sqft: 0 }, [], [])).toBe(false);
  });

  it('omits an empty description instead of shipping an empty array', () => {
    expect('description' in projectDetail({ ...baseListing, description: [] }, [], [])).toBe(false);
    expect('description' in projectDetail({ ...baseListing, description: null }, [], [])).toBe(
      false,
    );
  });

  it('defaults only state, which is non-null in every production row', () => {
    expect(projectDetail({ ...baseListing, state: null }, [], []).state).toBe('GA');
  });
});

describe('projectPhotos', () => {
  const photo = (id: string, sort: number | null, tagged = false) => ({
    id,
    storage_path: `fmls-import/1/${id}.jpg`,
    sort_order: sort,
    ai_tags: tagged ? { room_type: 'kitchen', caption: 'A kitchen' } : null,
  });

  it('orders by sort_order', () => {
    const out = projectPhotos([photo('c', 2), photo('a', 0), photo('b', 1)]);
    expect(out.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('sorts null sort_order LAST and deterministically, not to position 0', () => {
    // `?? 0` would put untagged photos in front of the hero shot and let the
    // database's arbitrary order decide the gallery.
    const out = projectPhotos([photo('z', null), photo('a', 5), photo('y', null)]);
    expect(out.map((p) => p.id)).toEqual(['a', 'y', 'z']);
  });

  it('omits `tags` for an untagged photo instead of sending {}', () => {
    const [untagged, tagged] = projectPhotos([photo('a', 0), photo('b', 1, true)]);
    expect('tags' in (untagged ?? {})).toBe(false);
    expect(tagged?.tags?.room_type).toBe('kitchen');
  });

  it('builds a bucket URL for the storage path', () => {
    // Asserted on the path tail, not the host: `photoPublicUrl` falls back to a
    // relative `/storage/<bucket>/…` when NEXT_PUBLIC_SUPABASE_URL is unset,
    // which is exactly the case under vitest. Pinning the absolute form here
    // would make this test pass or fail on env, not on behaviour.
    const [p] = projectPhotos([photo('a', 0)]);
    expect(p?.url).toContain('listing-photos/fmls-import/1/a.jpg');
  });
});

describe('projectComps', () => {
  it('names the cohort it actually measured', () => {
    expect(projectComps([], 'Duluth').cohortLabel).toBe('Duluth');
  });

  it('keeps only real prices', () => {
    const c = projectComps(
      [
        { price: 400000, sqft: 2000 },
        { price: null, sqft: 1800 },
        { price: 0, sqft: 1800 },
      ],
      'Duluth',
    );
    expect(c.pricesUsd).toEqual([400000]);
  });

  it('emits a $/sqft median at 5 samples and not at 4', () => {
    const rows = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ price: 400000 + i * 1000, sqft: 2000 }));
    expect(projectComps(rows(4), 'Duluth').medianPricePerSqft).toBeUndefined();
    const five = projectComps(rows(5), 'Duluth');
    expect(five.medianPricePerSqft).toBe(201);
    expect(five.medianPricePerSqftSampleSize).toBe(5);
  });

  it('ignores rows missing either half of the ratio', () => {
    const c = projectComps(
      [
        { price: 400000, sqft: 2000 },
        { price: 400000, sqft: null },
        { price: 400000, sqft: 0 },
        { price: null, sqft: 2000 },
        { price: 420000, sqft: 2100 },
        { price: 430000, sqft: 2150 },
        { price: 440000, sqft: 2200 },
        { price: 450000, sqft: 2250 },
      ],
      'Duluth',
    );
    expect(c.medianPricePerSqftSampleSize).toBe(5);
  });
});

describe('projectDetail — phase119 enrichments (MLS mirror + walkthrough video)', () => {
  const mls = { days_on_market: 23, lot_size_acres: 0.31, listing_key: '7382914' };

  it('omits every enrichment when there is no mirror row and no video', () => {
    const d = projectDetail(baseListing, [], []);
    for (const key of ['daysOnMarket', 'lotSizeRaw', 'lotSizeAcres', 'mlsNumber', 'video']) {
      expect(key in d, key).toBe(false);
    }
  });

  it('carries daysOnMarket / lot / mls number from the mirror', () => {
    const d = projectDetail(baseListing, [], [], { mls });
    expect(d.daysOnMarket).toBe(23);
    expect(d.lotSizeAcres).toBe(0.31);
    expect(d.mlsNumber).toBe('7382914');
  });

  it('prefers listings.lot_size over the mirror acres — one lot figure only', () => {
    const d = projectDetail({ ...baseListing, lot_size: '0.31 acres' }, [], [], { mls });
    expect(d.lotSizeRaw).toBe('0.31 acres');
    expect('lotSizeAcres' in d).toBe(false);
  });

  it('drops a negative days_on_market instead of rendering nonsense', () => {
    const d = projectDetail(baseListing, [], [], {
      mls: { ...mls, days_on_market: -1 },
    });
    expect('daysOnMarket' in d).toBe(false);
  });

  it('resolves the video square-first and carries duration only when real', () => {
    const d = projectDetail(baseListing, [], [], {
      video: {
        cf_video_id: null,
        cf_video_id_landscape: 'land1',
        cf_video_id_square: 'sq1',
        duration_sec: 42,
      },
    });
    expect(d.video?.url).toContain('sq1');
    expect(d.video?.posterUrl).toContain('sq1');
    expect(d.video?.durationSec).toBe(42);
  });

  it('projectVideo returns null when no uid survives the fallback chain', () => {
    expect(projectVideo(null)).toBeNull();
    expect(
      projectVideo({
        cf_video_id: null,
        cf_video_id_landscape: null,
        cf_video_id_square: null,
        duration_sec: 10,
      }),
    ).toBeNull();
  });
});

describe('projectDetail — IDX display gate (phase119.1)', () => {
  const mls = { days_on_market: 23, lot_size_acres: 0.31, listing_key: '7382914' };

  it('projects nothing from a mirror row the MLS forbids displaying', () => {
    const d = projectDetail(baseListing, [], [], {
      mls: { ...mls, internet_entire_listing_display_yn: false },
    });
    for (const key of ['daysOnMarket', 'lotSizeAcres', 'mlsNumber']) {
      expect(key in d, key).toBe(false);
    }
  });

  it('treats a null/absent flag as displayable', () => {
    const d = projectDetail(baseListing, [], [], {
      mls: { ...mls, internet_entire_listing_display_yn: null },
    });
    expect(d.daysOnMarket).toBe(23);
  });
});
