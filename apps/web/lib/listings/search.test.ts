import { describe, expect, it } from 'vitest';
import { mobileSearchQuerySchema } from '@/lib/zod/mobile-search';
import { projectSearchCommunities, projectSearchListings } from './search';

describe('mobileSearchQuerySchema', () => {
  it('folds to the ilike-safe alphabet and trims', () => {
    expect(mobileSearchQuerySchema.parse("  Peachtree   Corners' 30092 ")).toBe(
      'peachtree corners 30092',
    );
  });

  it('neutralises wildcard and DSL characters', () => {
    expect(mobileSearchQuerySchema.parse('%_,)(a.b')).toBe('a b');
  });

  it('rejects anything shorter than 2 useful characters', () => {
    expect(mobileSearchQuerySchema.safeParse('a').success).toBe(false);
    expect(mobileSearchQuerySchema.safeParse('%%%').success).toBe(false);
  });

  it('caps the length', () => {
    expect(mobileSearchQuerySchema.parse('x'.repeat(100)).length).toBe(40);
  });
});

describe('projectSearchListings', () => {
  it('omits absent keys and only emits paired coordinates', () => {
    const [a, b] = projectSearchListings([
      {
        id: 'l1',
        slug: 'oak-park',
        address: '3855 Oak Park Dr',
        city: 'Duluth',
        state: null,
        zip: '30096',
        price: 500000,
        beds: 4,
        baths: 3,
        sqft: 0,
        cover_url: 'https://x/cover.jpg',
        lat: 34.03,
        lng: -84.1,
      },
      {
        id: 'l2',
        slug: 'no-coords',
        address: '1 Main St',
        city: 'Atlanta',
        state: 'GA',
        zip: null,
        price: null,
        beds: null,
        baths: null,
        sqft: null,
        cover_url: null,
        lat: 33.7,
        lng: null,
      },
    ]);
    expect(a).toEqual({
      id: 'l1',
      slug: 'oak-park',
      address: '3855 Oak Park Dr',
      city: 'Duluth',
      state: 'GA',
      zip: '30096',
      price: 500000,
      beds: 4,
      baths: 3,
      coverUrl: 'https://x/cover.jpg',
      lat: 34.03,
      lng: -84.1,
    });
    expect(b).toEqual({
      id: 'l2',
      slug: 'no-coords',
      address: '1 Main St',
      city: 'Atlanta',
      state: 'GA',
    });
  });
});

describe('projectSearchCommunities', () => {
  it('builds the public cover URL from the storage path', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://sb.example';
    const [c] = projectSearchCommunities([
      {
        id: 'c1',
        slug: 'windward',
        name: 'Windward',
        city: 'Alpharetta',
        state: 'GA',
        cover_storage_path: 'windward/cover.jpg',
        lat: 34.1,
        lng: -84.25,
      },
    ]);
    expect(c?.heroUrl).toBe(
      'https://sb.example/storage/v1/object/public/community-covers/windward/cover.jpg',
    );
    expect(c?.lat).toBe(34.1);
  });
});
