/**
 * Evidence profile helpers — per-dim counters + WHY / insight logic.
 *
 * Ported (immutable) from
 * `percho-prototypes/discovery-v3-snapshot/_data.js`
 *   bumpDim, topDims, whyDimFor, whyLine, pickInsight.
 *
 * All functions return NEW arrays; nothing mutates the input profile.
 */

import { DIMS } from './dims';
import type { DimKey, EvidenceProfile } from './types';

export function bumpDim(
  profile: EvidenceProfile,
  dim: DimKey,
  delta = 1,
): EvidenceProfile {
  const idx = profile.findIndex((e) => e.dim === dim);
  if (idx === -1) {
    return [...profile, { dim, count: delta }];
  }
  const next = [...profile];
  next[idx] = { dim, count: next[idx].count + delta };
  return next;
}

export function topDims(profile: EvidenceProfile, n = 3): EvidenceProfile {
  return [...profile]
    .filter((e) => e.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

/** Intersection of item dims × top profile dims. */
export function whyDimFor(
  profile: EvidenceProfile,
  dims: readonly DimKey[],
): DimKey | null {
  const top = new Set(topDims(profile, 5).map((e) => e.dim));
  const hit = dims.find((d) => top.has(d));
  return hit ?? dims[0] ?? null;
}

export function whyLine(
  profile: EvidenceProfile,
  dims: readonly DimKey[],
): string {
  const dim = whyDimFor(profile, dims);
  if (!dim)
    return "New to Percho — swipe a few more and we'll personalize the WHY.";
  const entry = profile.find((e) => e.dim === dim);
  const count = entry ? entry.count : 0;
  if (count >= 2) {
    return `Because you've picked ${count} places with ${DIMS[dim].label} — this one has it too.`;
  }
  return `Featuring ${DIMS[dim].label} — a dimension you've started to signal interest in.`;
}

export interface InsightPick {
  dim: DimKey;
  text: string;
  evidence: string;
}

/**
 * Fires only when at least one dim has count >= 3 and hasn't been fired
 * yet in this session. Returns null if none eligible.
 */
export function pickInsight(
  profile: EvidenceProfile,
  fired: readonly DimKey[],
): InsightPick | null {
  const firedSet = new Set(fired);
  const eligible = profile
    .filter((e) => e.count >= 3 && !firedSet.has(e.dim))
    .sort((a, b) => b.count - a.count);
  if (!eligible.length) return null;
  const e = eligible[0];
  return {
    dim: e.dim,
    text: DIMS[e.dim].obs,
    evidence: `${e.count} signals so far.`,
  };
}
