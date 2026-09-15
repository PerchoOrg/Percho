/**
 * Item-item collaborative filtering over the swipe log — "buyers who liked
 * these homes also liked". The first cross-user signal in the ranking; the
 * client-side `swipeScore` can only ever see one buyer's own history.
 *
 * Deliberately the simplest thing that is honest at our scale: co-occurrence
 * counts damped by candidate popularity (`co / sqrt(pop)`, the classic
 * item-item cosine shortcut), normalised to 0..1. With a handful of installs
 * the scores are weak and sparse — which is correct, and why the client
 * treats them as one bounded term among several rather than the ranking.
 * A learned model replaces this when the swipe volume can support one; the
 * (features, label) extraction it needs is what `mobile_events`' generated
 * swipe columns exist for.
 *
 * Pure — the route owns the query, this owns the arithmetic.
 */

export interface CoLikeRow {
  install_id: string;
  card_id: string | null;
}

/** At most this many scored neighbours come back. */
export const CO_LIKE_CAP = 50;

export function coLikeScores(
  rows: readonly CoLikeRow[],
  likedIds: readonly string[],
  cap: number = CO_LIKE_CAP,
): Record<string, number> {
  const seeds = new Set(likedIds);

  // One buyer = one install's set of liked listings. A re-sent or re-swiped
  // like must not count twice.
  const byInstall = new Map<string, Set<string>>();
  for (const row of rows) {
    if (row.card_id === null) continue;
    const set = byInstall.get(row.install_id) ?? new Set<string>();
    set.add(row.card_id);
    byInstall.set(row.install_id, set);
  }

  // Popularity over every install, co-counts over the installs that share at
  // least one seed like with this buyer.
  const pop = new Map<string, number>();
  const co = new Map<string, number>();
  for (const likes of byInstall.values()) {
    for (const id of likes) pop.set(id, (pop.get(id) ?? 0) + 1);
    let overlap = false;
    for (const id of likes) {
      if (seeds.has(id)) {
        overlap = true;
        break;
      }
    }
    if (!overlap) continue;
    for (const id of likes) {
      if (seeds.has(id)) continue;
      co.set(id, (co.get(id) ?? 0) + 1);
    }
  }

  const raw = [...co.entries()]
    .map(([id, n]) => [id, n / Math.sqrt(pop.get(id) ?? 1)] as const)
    .sort((a, b) => b[1] - a[1])
    .slice(0, cap);
  const top = raw[0]?.[1];
  if (top === undefined || top === 0) return {};

  const out: Record<string, number> = {};
  for (const [id, s] of raw) out[id] = Number((s / top).toFixed(3));
  return out;
}
