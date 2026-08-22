/**
 * PostgREST `or=` filter for the admin community search box.
 *
 * `.or(f)` appends `or=(${f})` — it wraps for you. Handing it a pre-wrapped
 * `(a,b)` ships `or=((a,b))`, which PostgREST refuses to parse (PGRST100,
 * "failed to parse logic tree"), so the query 400s, `data` comes back null and
 * the table renders "No communities found." That is exactly what shipped on
 * 2026-08-22: every search looked like a miss.
 */
export function communitySearchFilter(q: string): string {
  // `.or()` takes one comma-separated list, so a query containing a comma or a
  // paren would otherwise be read as syntax. Double-quoting the value is
  // PostgREST's escape hatch; `%` and `_` stay live wildcards, which on an
  // admin search box is a feature.
  const v = q.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `name.ilike."%${v}%",city.ilike."%${v}%"`;
}
