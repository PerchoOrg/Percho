/**
 * A tiered water bill.
 *
 * Every county that publishes water rates does it the same way — a monthly
 * readiness-to-serve charge per meter size, a ladder of per-1,000-gallon bands
 * for water, and a sewer charge that is usually flat. Only the numbers differ.
 * This is the arithmetic; the numbers live with whichever importer read them.
 *
 * It lived inside `scripts/admin/import-dekalb-water.ts`, where nothing tests
 * it: `scripts/` is not a workspace package, so neither `pnpm test` nor
 * `pnpm lint` reaches it. The only thing checking the band logic was DeKalb's
 * published total at exactly 4,000 gallons — one point on a step function, and
 * the points a step function gets wrong are its edges.
 */

/** `[upToGallons, usdPerThousand]`, ascending. */
export type WaterTier = readonly [number, number];

export interface WaterRates {
  /** Monthly charge for having a water connection at all. */
  waterBase: number;
  /** Monthly charge for having a sewer connection at all. */
  sewerBase: number;
  /** The ladder, ascending. The last band's bound may be `Infinity`. */
  waterTiers: readonly WaterTier[];
  /** Flat, in every county seen so far. */
  sewerPerThousand: number;
}

/**
 * What the volume above the previous band costs, band by band.
 *
 * Bands are cumulative bounds, not widths: `[2000, 2.77], [10000, 3.95]` means
 * the first 2,000 gallons at $2.77 and the NEXT 8,000 at $3.95, which is how
 * every rate sheet states it and is not how it reads at a glance.
 */
export function waterCharge(gallons: number, tiers: readonly WaterTier[]): number {
  let charge = 0;
  let priced = 0;
  for (const [upTo, per] of tiers) {
    if (priced >= gallons) break;
    const inBand = Math.min(gallons, upTo) - priced;
    if (inBand <= 0) continue;
    charge += (inBand / 1000) * per;
    priced = Math.min(gallons, upTo);
  }
  return charge;
}

/** How much of a volume the ladder can actually price. */
export function coveredGallons(tiers: readonly WaterTier[]): number {
  return tiers.reduce((max, [upTo]) => Math.max(max, upTo), 0);
}

/**
 * The monthly bill, or undefined when the ladder does not reach the volume.
 *
 * Undefined rather than a partial total: a ladder that stops at 10,000 gallons
 * charges nothing for the 11th thousand, and the result is a bill that looks
 * complete and is too low. A caller that cannot price the volume it was asked
 * about should say so.
 */
export function monthlyBill(gallons: number, r: WaterRates): number | undefined {
  if (!Number.isFinite(gallons) || gallons < 0) return undefined;
  if (gallons > coveredGallons(r.waterTiers)) return undefined;
  const sewer = (gallons / 1000) * r.sewerPerThousand;
  return r.waterBase + r.sewerBase + waterCharge(gallons, r.waterTiers) + sewer;
}
