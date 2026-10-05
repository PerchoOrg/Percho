import { describe, expect, it } from 'vitest';
import { PAGE_ROWS, readAllPages } from './paginate';

function table(n: number) {
  const rows = Array.from({ length: n }, (_, i) => ({ i }));
  const calls: Array<[number, number]> = [];
  const page = async (from: number, to: number) => {
    calls.push([from, to]);
    // PostgREST's cap: never more than PAGE_ROWS, whatever range was asked.
    return { data: rows.slice(from, Math.min(to + 1, from + PAGE_ROWS)), error: null };
  };
  return { page, calls };
}

describe('readAllPages', () => {
  it('reads past the 1000-row cap', async () => {
    const { page, calls } = table(2500);
    const rows = await readAllPages(page);
    expect(rows).toHaveLength(2500);
    expect(rows[2499]).toEqual({ i: 2499 });
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it('asks once more when the last page is exactly full', async () => {
    const { page, calls } = table(PAGE_ROWS);
    expect(await readAllPages(page)).toHaveLength(PAGE_ROWS);
    expect(calls).toHaveLength(2);
  });

  it('throws instead of returning a partial read', async () => {
    let n = 0;
    await expect(
      readAllPages(async () =>
        n++ === 0
          ? { data: Array.from({ length: PAGE_ROWS }, () => ({})), error: null }
          : { data: null, error: { message: 'timeout' } },
      ),
    ).rejects.toThrow(/row 1000: timeout/);
  });
});
