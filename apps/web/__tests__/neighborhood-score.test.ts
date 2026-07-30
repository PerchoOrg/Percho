import { describe, expect, it } from "vitest";
import {
  DIMENSION_ORDER,
  type ScorablePoi,
  scoreNeighborhood,
} from "../lib/feed/neighborhood-score";

/**
 * The expectations here are pinned to REAL rows from the sample listing
 * (5122 Lower Creek Street, listing c7435419-…), read out of Supabase on
 * 2026-07-30. If the formula changes, these numbers should be re-derived from
 * the database rather than adjusted to whatever the code now returns.
 */
const poi = (
  bucket: string,
  distanceM: number,
  rating: number | null = null,
  ratingCount: number | null = null,
): ScorablePoi => ({ bucket, distanceM, rating, ratingCount });

describe("scoreNeighborhood", () => {
  it("reports safety and potential as unscored, not zero", () => {
    const { dims } = scoreNeighborhood([poi("schools", 300, 5, 80)]);
    const safety = dims.find((d) => d.key === "safety");
    const potential = dims.find((d) => d.key === "potential");

    // null, NOT 0 — "we have no crime feed" and "this is a bad area" are
    // different claims and the card must not conflate them.
    expect(safety?.score).toBeNull();
    expect(potential?.score).toBeNull();
    expect(safety?.reason).toBe("no data source");
  });

  it("keeps the four dimensions in a fixed order", () => {
    const { dims } = scoreNeighborhood([]);
    expect(dims.map((d) => d.key)).toEqual(DIMENSION_ORDER);
    expect(dims.map((d) => d.label)).toEqual([
      "Safety",
      "Schools",
      "Convenience",
      "Potential",
    ]);
  });

  it("averages only the dimensions that have data", () => {
    // These rows mirror the live sample listing's actual distribution, verified
    // against Supabase on 2026-07-30:
    //   Schools     — 11 POIs, nearest 307m, 2 "good" inside 2km
    //                 → 6 (proximity) + 2.5 (2 good) = 8.5
    //   Convenience — 64 POIs, nearest 1232m, 9 "good" inside 2km
    //                 → 6*(3000-1232)/2600 = 4.08 + 4 (4+ good) = 8.1
    // A naive average treating the two unscored dims as 0 would give 4.15.
    const pois: ScorablePoi[] = [
      // Schools: 307m unrated (counts, <1km) + 1792m ★5.0/80 (counts) = 2 good.
      poi("schools", 307, null, null),
      poi("schools", 762, 4.2, 6), // too few reviews to count
      poi("schools", 1591, null, null), // unrated and >1km → no credit
      poi("schools", 1792, 5, 80),
      poi("schools", 2408, null, null),
      // Convenience: 4+ good inside 2km saturates the density term.
      poi("dining", 1232, 5, 1), // 1 review → noise, no credit
      poi("shopping", 1828, 4.4, 21),
      poi("dining", 1844, 4.6, 456), // Henri's Bakery
      poi("daily_errands", 1850, 4.4, 1303), // Ingles Market
      poi("dining", 1855, 4.7, 50),
    ];
    const { overall, dims } = scoreNeighborhood(pois);
    const schools = dims.find((d) => d.key === "schools");
    const convenience = dims.find((d) => d.key === "convenience");

    expect(schools?.score).toBe(8.5);
    expect(schools?.nearestM).toBe(307);
    expect(convenience?.score).toBe(8.1);
    expect(overall).toBe(8.3);
  });

  it("gives a full proximity score inside 400m and none beyond 3km", () => {
    const near = scoreNeighborhood([poi("schools", 120, 4.5, 100)]);
    const far = scoreNeighborhood([poi("schools", 3200, 4.5, 100)]);

    // 6 (proximity) + 1.5 (one good POI) = 7.5
    expect(near.dims.find((d) => d.key === "schools")?.score).toBe(7.5);
    // Beyond 3km proximity is 0, and the POI is outside the 2km density
    // radius too, so the dimension scores 0 — which is a real measurement,
    // unlike the nulls above.
    expect(far.dims.find((d) => d.key === "schools")?.score).toBe(0);
  });

  it("credits an unrated POI only when it is genuinely close", () => {
    // Schools frequently have no Google rating. A school 500m away should still
    // count toward density; the same school 1.5km away should not.
    const close = scoreNeighborhood([poi("schools", 500, null, null)]);
    const distant = scoreNeighborhood([poi("schools", 1500, null, null)]);

    const closeScore = close.dims.find((d) => d.key === "schools")?.score ?? 0;
    const distantScore =
      distant.dims.find((d) => d.key === "schools")?.score ?? 0;
    expect(closeScore).toBeGreaterThan(distantScore);
  });

  it("ignores a highly-rated POI with too few reviews", () => {
    // A brand-new 5.0 with 3 reviews is noise, not signal.
    const thin = scoreNeighborhood([poi("schools", 1500, 5, 3)]);
    const solid = scoreNeighborhood([poi("schools", 1500, 5, 40)]);
    expect(thin.dims.find((d) => d.key === "schools")?.score).toBeLessThan(
      solid.dims.find((d) => d.key === "schools")?.score ?? 0,
    );
  });

  it("returns a null overall when nothing is scorable", () => {
    const { overall, dims } = scoreNeighborhood([]);
    expect(overall).toBeNull();
    expect(dims.every((d) => d.score === null)).toBe(true);
    expect(dims.find((d) => d.key === "schools")?.reason).toBe("no POIs");
  });

  it("caps a dimension at 10", () => {
    const pois = Array.from({ length: 12 }, () => poi("schools", 100, 4.8, 500));
    expect(
      scoreNeighborhood(pois).dims.find((d) => d.key === "schools")?.score,
    ).toBe(10);
  });

  it("survives a POI with a non-finite distance", () => {
    const { dims } = scoreNeighborhood([
      poi("schools", Number.NaN, 5, 100),
      poi("schools", 300, 5, 100),
    ]);
    const schools = dims.find((d) => d.key === "schools");
    // The NaN row is dropped, not allowed to poison the sort or the score.
    expect(schools?.count).toBe(1);
    expect(schools?.score).toBe(7.5);
  });
});
