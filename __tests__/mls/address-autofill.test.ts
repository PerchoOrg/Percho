/**
 * autofillListingByAddress tests. `fetch` stubbed via vi.stubGlobal.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { autofillListingByAddress } from '@/lib/mls/address-autofill';

function makeResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const RAW_LISTING = {
  ListingKey: 'FMLS-1',
  ListPrice: 750000,
  StandardStatus: 'Active',
  PropertyType: 'Residential',
  PropertySubType: 'SingleFamilyResidence',
  StreetNumber: '123',
  StreetName: 'Peachtree St NE',
  StreetSuffix: null,
  City: 'Atlanta',
  StateOrProvince: 'GA',
  PostalCode: '30303',
  Latitude: 33.75,
  Longitude: -84.39,
  BedroomsTotal: 4,
  BathroomsTotalInteger: 3,
  LivingArea: 2400,
  LotSizeAcres: 0.25,
  YearBuilt: 1998,
  PublicRemarks: 'Beautiful home',
  ListOfficeName: 'Vicinity Realty',
  ListAgentFullName: 'Jane Agent',
  ListAgentMlsId: 'A1',
  DaysOnMarket: 5,
  ModificationTimestamp: '2026-07-01T00:00:00Z',
  InternetEntireListingDisplayYN: true,
};

describe('autofillListingByAddress', () => {
  afterEach(() => {
    // biome-ignore lint/performance/noDelete: env cleanup
    delete process.env.BRIDGE_SERVER_TOKEN;
    // biome-ignore lint/performance/noDelete: env cleanup
    delete process.env.BRIDGE_DATASET_ID;
    // biome-ignore lint/performance/noDelete: env cleanup
    delete process.env.BRIDGE_BASE_URL;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns no_credentials when env is missing (no throw)', async () => {
    const result = await autofillListingByAddress({
      street: '123 Peachtree St NE',
      city: 'Atlanta',
      state: 'GA',
      zip: '30303',
    });
    expect(result).toEqual({ reason: 'no_credentials' });
  });

  describe('with credentials', () => {
    beforeEach(() => {
      process.env.BRIDGE_SERVER_TOKEN='***';
      process.env.BRIDGE_DATASET_ID = 'fmls-test';
      process.env.BRIDGE_BASE_URL = 'https://api.example.test/api/v2';
    });

    it('happy path: single hit returns normalized listing + media', async () => {
      const stub = vi
        .fn()
        // /Property call
        .mockResolvedValueOnce(makeResponse({ value: [RAW_LISTING] }))
        // /Media call
        .mockResolvedValueOnce(
          makeResponse({
            value: [
              {
                MediaKey: 'M1',
                ResourceRecordKey: 'FMLS-1',
                MediaURL: 'https://cdn.bridge.test/1.jpg',
                Order: 1,
                MediaCategory: 'Photo',
                ShortDescription: null,
                ModificationTimestamp: null,
              },
            ],
          }),
        );
      vi.stubGlobal('fetch', stub);

      const result = await autofillListingByAddress({
        street: '123 Peachtree St NE',
        city: 'Atlanta',
        state: 'GA',
        zip: '30303',
      });

      expect(result.reason).toBe('found');
      if (result.reason !== 'found') throw new Error('unreachable');
      expect(result.listing.listing_key).toBe('FMLS-1');
      expect(result.listing.list_price).toBe(750000);
      expect(result.listing.photos).toEqual(['https://cdn.bridge.test/1.jpg']);
      expect(result.listing.list_office_name).toBe('Vicinity Realty');
    });

    it('returns not_in_fmls when Bridge returns zero hits', async () => {
      const stub = vi.fn().mockResolvedValue(makeResponse({ value: [] }));
      vi.stubGlobal('fetch', stub);

      const result = await autofillListingByAddress({
        street: '999 Nowhere Ln',
        city: 'Atlanta',
        state: 'GA',
        zip: '30303',
      });
      expect(result).toEqual({ reason: 'not_in_fmls' });
    });

    it('returns ambiguous with multiple candidates', async () => {
      const second = { ...RAW_LISTING, ListingKey: 'FMLS-2' };
      const stub = vi.fn().mockResolvedValue(
        makeResponse({ value: [RAW_LISTING, second] }),
      );
      vi.stubGlobal('fetch', stub);

      const result = await autofillListingByAddress({
        street: '123 Peachtree St NE',
        city: 'Atlanta',
        state: 'GA',
        zip: '30303',
      });
      expect(result.reason).toBe('ambiguous');
      if (result.reason !== 'ambiguous') throw new Error('unreachable');
      expect(result.candidates).toHaveLength(2);
    });

    it('filters out listings with InternetEntireListingDisplayYN=false', async () => {
      const optOut = { ...RAW_LISTING, InternetEntireListingDisplayYN: false };
      const stub = vi.fn().mockResolvedValue(makeResponse({ value: [optOut] }));
      vi.stubGlobal('fetch', stub);

      const result = await autofillListingByAddress({
        street: '123 Peachtree St NE',
        city: 'Atlanta',
        state: 'GA',
        zip: '30303',
      });
      expect(result).toEqual({ reason: 'not_in_fmls' });
    });

    it('returns api_error when Bridge returns 500', async () => {
      const stub = vi.fn().mockResolvedValue(makeResponse({ error: 'boom' }, 500));
      vi.stubGlobal('fetch', stub);

      const result = await autofillListingByAddress({
        street: '123 Peachtree St NE',
        city: 'Atlanta',
        state: 'GA',
        zip: '30303',
      });
      // 500s are retried; after MAX_ATTEMPTS the client throws → api_error.
      expect(result.reason).toBe('api_error');
    }, 60_000);

    it('returns not_in_fmls when street cannot be parsed', async () => {
      // No leading number.
      const result = await autofillListingByAddress({
        street: 'JustAName',
        city: 'Atlanta',
        state: 'GA',
        zip: '30303',
      });
      expect(result).toEqual({ reason: 'not_in_fmls' });
    });
  });
});
