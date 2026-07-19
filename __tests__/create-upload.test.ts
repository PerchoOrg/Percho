import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock collaborators BEFORE importing the route handler.
vi.mock('@/lib/cloudflare/stream', () => ({
  createDirectUpload: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { POST } from '@/app/api/video/create-upload/route';
import { createDirectUpload } from '@/lib/cloudflare/stream';
import { createClient } from '@/lib/supabase/server';

const mockedCreateDirectUpload = vi.mocked(createDirectUpload);
const mockedCreateClient = vi.mocked(createClient);

interface FakeBuilderOpts {
  listing?: { id: string } | null;
  insertRow?: { id: string } | null;
  insertError?: unknown;
  listingError?: unknown;
}

function buildSupabase(user: { id: string } | null, b: FakeBuilderOpts = {}) {
  const listingsBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi
      .fn()
      .mockResolvedValue({ data: b.listing ?? null, error: b.listingError ?? null }),
  };
  const insertBuilder = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: b.insertRow ?? null, error: b.insertError ?? null }),
  };
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
    from: vi.fn((table: string) => {
      if (table === 'listings') return listingsBuilder;
      if (table === 'listing_videos') return insertBuilder;
      throw new Error(`unexpected table ${table}`);
    }),
  };
}

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/video/create-upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const validBody = {
  scope: 'listing',
  parent_id: '11111111-1111-1111-1111-111111111111',
  kind: 'walkthrough',
  upload_length: 50_000_000,
  title: 'front yard',
};

describe('POST /api/video/create-upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test-only fake supabase client
    mockedCreateClient.mockResolvedValue(buildSupabase(null) as any);
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid JSON', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test-only fake supabase client
    mockedCreateClient.mockResolvedValue(buildSupabase({ id: 'u1' }) as any);
    const res = await POST(makeReq('not-json{'));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'invalid_json' });
  });

  it('returns 400 on zod failure (missing fields)', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test-only fake supabase client
    mockedCreateClient.mockResolvedValue(buildSupabase({ id: 'u1' }) as any);
    const res = await POST(makeReq({ scope: 'listing' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'invalid_input' });
  });

  it('rejects upload_length exceeding 2 GB', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test-only fake supabase client
    mockedCreateClient.mockResolvedValue(buildSupabase({ id: 'u1' }) as any);
    const oversize = { ...validBody, upload_length: 3 * 1024 * 1024 * 1024 };
    const res = await POST(makeReq(oversize));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'invalid_input' });
    expect(mockedCreateDirectUpload).not.toHaveBeenCalled();
  });

  it('returns 404 when listing is missing or not owned (RLS-fenced)', async () => {
    mockedCreateClient.mockResolvedValue(
      // biome-ignore lint/suspicious/noExplicitAny: test-only fake supabase client
      buildSupabase({ id: 'u1' }, { listing: null }) as any,
    );
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(404);
    expect(mockedCreateDirectUpload).not.toHaveBeenCalled();
  });

  it('happy path returns uploadUrl, videoId, rowId', async () => {
    mockedCreateClient.mockResolvedValue(
      buildSupabase(
        { id: 'u1' },
        { listing: { id: validBody.parent_id }, insertRow: { id: 'row-123' } },
        // biome-ignore lint/suspicious/noExplicitAny: test-only fake supabase client
      ) as any,
    );
    mockedCreateDirectUpload.mockResolvedValue({
      uploadUrl: 'https://upload.cloudflarestream.com/tus/abc',
      videoId: 'cf-vid-abc',
    });

    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      uploadUrl: 'https://upload.cloudflarestream.com/tus/abc',
      videoId: 'cf-vid-abc',
      rowId: 'row-123',
    });
    expect(mockedCreateDirectUpload).toHaveBeenCalledWith(
      expect.objectContaining({ uploadLength: validBody.upload_length, maxDurationSeconds: 600 }),
    );
  });

  it('returns 502 when Cloudflare API fails', async () => {
    mockedCreateClient.mockResolvedValue(
      // biome-ignore lint/suspicious/noExplicitAny: test-only fake supabase client
      buildSupabase({ id: 'u1' }, { listing: { id: validBody.parent_id } }) as any,
    );
    mockedCreateDirectUpload.mockRejectedValue(new Error('cf 500'));
    // Silence expected error log.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: 'upload_provider_failed' });
    errSpy.mockRestore();
  });
});
