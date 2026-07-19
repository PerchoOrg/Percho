import { describe, expect, it } from 'vitest';
import { LeadCreate } from './leads';
import { ListingCreate } from './schemas';

describe('zod schemas', () => {
  it('rejects a lead with neither email nor phone', () => {
    const result = LeadCreate.safeParse({
      listing_id: '00000000-0000-0000-0000-000000000000',
      name: 'Alice',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a lead with email only', () => {
    const result = LeadCreate.safeParse({
      listing_id: '00000000-0000-0000-0000-000000000000',
      name: 'Alice',
      email: 'alice@example.com',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a lead with phone only', () => {
    const result = LeadCreate.safeParse({
      listing_id: '00000000-0000-0000-0000-000000000000',
      name: 'Bob',
      phone: '+1 (404) 555-9012',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a lead with garbage phone', () => {
    const result = LeadCreate.safeParse({
      listing_id: '00000000-0000-0000-0000-000000000000',
      name: 'Bob',
      phone: 'not-a-phone-number',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a lead with non-uuid listing_id', () => {
    const result = LeadCreate.safeParse({
      listing_id: 'not-a-uuid',
      name: 'Alice',
      email: 'alice@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a lead with empty name', () => {
    const result = LeadCreate.safeParse({
      listing_id: '00000000-0000-0000-0000-000000000000',
      name: '   ',
      email: 'alice@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('caps message length at 2000 chars', () => {
    const result = LeadCreate.safeParse({
      listing_id: '00000000-0000-0000-0000-000000000000',
      name: 'Alice',
      email: 'alice@example.com',
      message: 'x'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it('rejects a listing slug with uppercase', () => {
    const result = ListingCreate.safeParse({
      slug: 'Buckhead-Manor',
      address: '3450 Tuxedo Rd NW',
      city: 'Atlanta',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a minimal listing', () => {
    const result = ListingCreate.safeParse({
      slug: 'tuxedo-manor',
      address: '3450 Tuxedo Rd NW',
      city: 'Atlanta',
    });
    expect(result.success).toBe(true);
  });
});
