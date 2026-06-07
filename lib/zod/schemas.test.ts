import { describe, expect, it } from 'vitest';
import { LeadCreate, ListingCreate } from './schemas';

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
