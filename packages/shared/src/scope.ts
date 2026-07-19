/**
 * Scope strip state — hierarchical yes/no filters that ride above the feed.
 *
 * Ported from vibe scope-narrowing funnel (see paginated-feed-and-swipe-ui
 * skill § "Hierarchical scope-narrowing cards (funnel-in-feed)").
 *
 * TODO(mobile-ios-bootstrap): port the full ask-card sequence from
 * vibe/_data.js when tunnel-hosted prototype is reachable. For now this
 * exposes the shape and the add/remove semantics; the ask-card catalogue
 * itself lives in mobile until we can port it here.
 */

import type { ScopeChip, ScopeLayer } from './types';

export const SCOPE_LAYERS: readonly ScopeLayer[] = [
  'intent',
  'region',
  'metro',
  'culture',
] as const;

export function addChip(current: readonly ScopeChip[], chip: ScopeChip): ScopeChip[] {
  // At most one chip per layer — new chip on same layer replaces prior.
  return [...current.filter((c) => c.layer !== chip.layer), chip];
}

export function removeChip(current: readonly ScopeChip[], layer: ScopeLayer): ScopeChip[] {
  return current.filter((c) => c.layer !== layer);
}

export function hasLayer(current: readonly ScopeChip[], layer: ScopeLayer): boolean {
  return current.some((c) => c.layer === layer);
}
