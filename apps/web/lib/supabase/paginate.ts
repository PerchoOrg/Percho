/**
 * Read every row of a query, a page at a time.
 *
 * PostgREST caps each response at 1000 rows, and `.range(0, 9999)` does not
 * lift the cap — it silently returns the first thousand. A whole-table read
 * that skips this looks right until the table grows past it. The caller
 * supplies the query with a stable `.order()`; this supplies the range.
 *
 *   const rows = await readAllPages((from, to) =>
 *     sb.from('listings').select('id, community_id').order('id').range(from, to));
 *
 * Throws on the first failed page: a partial read is worse than none for every
 * caller that needs "all" (a stream cleanup reading a short live set would
 * offer live videos for deletion).
 */
export const PAGE_ROWS = 1000;

export async function readAllPages<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await page(from, from + PAGE_ROWS - 1);
    if (error) throw new Error(`paged read failed at row ${from}: ${error.message}`);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE_ROWS) return out;
  }
}
