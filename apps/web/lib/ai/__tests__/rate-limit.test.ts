import { describe, expect, it, vi } from 'vitest';
import { RATE_LIMIT_PER_MIN, checkAndRecord } from '../rate-limit';

/**
 * Pure-logic tests for `checkAndRecord`. We stub the supabase client with the
 * minimum shape the function consumes — chainable .from().select()/.insert()
 * with the eq/gt/head modifiers — and assert decisions, not SQL.
 */

interface FakeOutcome {
  count?: number;
  countError?: { message: string };
  insertError?: { message: string };
}

function fakeSupabase(out: FakeOutcome) {
  const insert = vi.fn().mockResolvedValue({ error: out.insertError ?? null });

  const selectChain = {
    eq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockResolvedValue({
      count: out.count ?? 0,
      error: out.countError ?? null,
    }),
  };
  const select = vi.fn().mockReturnValue(selectChain);
  const from = vi.fn().mockReturnValue({ select, insert });

  return { from, _spies: { insert, select, selectChain } };
}

const AGENT = '11111111-1111-1111-1111-111111111111';

describe('checkAndRecord', () => {
  it('passes and inserts when no recent rows', async () => {
    const sb = fakeSupabase({ count: 0 });
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    const res = await checkAndRecord(sb as any, AGENT, 'listing_copy');
    expect(res).toEqual({ ok: true });
    expect(sb._spies.insert).toHaveBeenCalledWith({
      agent_id: AGENT,
      kind: 'listing_copy',
    });
  });

  it('rejects with rate_limited at the cap', async () => {
    const sb = fakeSupabase({ count: RATE_LIMIT_PER_MIN });
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    const res = await checkAndRecord(sb as any, AGENT, 'social_copy');
    expect(res).toEqual({ ok: false, reason: 'rate_limited' });
    expect(sb._spies.insert).not.toHaveBeenCalled();
  });

  it('rejects with rate_limited above the cap', async () => {
    const sb = fakeSupabase({ count: RATE_LIMIT_PER_MIN + 5 });
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    const res = await checkAndRecord(sb as any, AGENT, 'listing_copy');
    expect(res.ok).toBe(false);
  });

  it('returns internal when count query errors', async () => {
    const sb = fakeSupabase({ countError: { message: 'boom' } });
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    const res = await checkAndRecord(sb as any, AGENT, 'listing_copy');
    expect(res).toEqual({ ok: false, reason: 'internal' });
    expect(sb._spies.insert).not.toHaveBeenCalled();
  });

  it('returns internal when insert errors', async () => {
    const sb = fakeSupabase({ count: 3, insertError: { message: 'fk' } });
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    const res = await checkAndRecord(sb as any, AGENT, 'listing_copy');
    expect(res).toEqual({ ok: false, reason: 'internal' });
  });
});
