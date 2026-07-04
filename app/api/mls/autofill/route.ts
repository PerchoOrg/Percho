/**
 * POST /api/mls/autofill — address → MLS listing lookup.
 *
 * Server-only. The Bridge server-token never crosses the wire to the
 * browser. When credentials are absent (pre-launch) this returns
 * `{ reason: 'no_credentials' }` with a 200 so the client UI can
 * degrade gracefully instead of showing an error toast.
 */

import { autofillListingByAddress } from '@/lib/mls/address-autofill';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';

const AddressSchema = z.object({
  address: z.object({
    street: z.string().min(1).max(200),
    city: z.string().min(1).max(100),
    state: z.string().length(2),
    zip: z.string().min(3).max(10),
  }),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = AddressSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  const result = await autofillListingByAddress(parsed.data.address);
  return NextResponse.json(result);
}
