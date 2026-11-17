/**
 * A city, as the apps read it (phase327) — the wire shape of
 * `GET /api/mobile/city/<slug>`.
 *
 * Types only. The server builds it in `apps/web/lib/cities/detail.ts` from
 * `cities.profile`, whose own shape is the zod schema in
 * `apps/web/lib/zod/city-profile.ts`; that file checks at compile time that a
 * stored profile still fits `CityFundamentals`, so the two cannot drift.
 *
 * A city is not a community with a bigger boundary. Its page answers "what is
 * this place as a whole" — rankings, how it compares, where it came from, how
 * fast it grew, its schools, getting around, what is planned — and every figure
 * names its source.
 *
 * NO SAFETY OR CRIME FIELD, on purpose (owner 2026-11-15: "安全数据先不放";
 * `lenses.ts` records the fair-housing reason). Do not add one without him.
 */

export interface CitySource {
  name: string;
  year?: string;
  url?: string;
}

export interface CityFundamentals {
  /** One line for the card face. */
  tagline: string;
  /** The page's opening paragraph. */
  summary: string;
  /** "33 mi northeast of downtown Atlanta" */
  locationNote: string;
  /** Only where a named publisher made the ranking. */
  rankings: Array<{
    /** "#1" */
    rank: string;
    /** "in Georgia" */
    scope: string;
    title: string;
    detail: string;
    source: CitySource;
  }>;
  stats: Array<{ label: string; value: string; note?: string }>;
  compare: {
    /** What the city is measured against: "Georgia". */
    against: string;
    rows: Array<{
      label: string;
      city: { value: number; display: string };
      state: { value: number; display: string };
      /** "1.3× the state" */
      takeaway: string;
    }>;
    source: CitySource;
  };
  history: Array<{ year: string; short?: string; text: string }>;
  growth: {
    series: Array<{ label: string; value: number }>;
    takeaway: string;
    source: CitySource;
  };
  education: {
    /** Named schools at every level, each ranking with its publisher. */
    schools: Array<{
      level: 'elementary' | 'middle' | 'high' | 'college';
      name: string;
      rank?: string;
      scope?: string;
      detail: string;
      source: CitySource;
    }>;
    measure: string;
    rows: Array<{ label: string; pct: number; display: string; baseline?: boolean }>;
    note: string;
  };
  gettingAround: Array<{
    label: string;
    value: string;
    /** Off-peak to rush, in minutes. */
    minutes?: { min: number; max: number };
  }>;
  planning: Array<{ title: string; text: string }>;
  sources: CitySource[];
}

/** Who made the photographs the city's film is cut from. */
export interface CityFilmCredits {
  /** Google Maps contributors, by display name. */
  google: string[];
  /** Wikimedia Commons files: a CC BY licence asks for all three. */
  commons: Array<{ author: string; licence: string; url: string }>;
}

export interface CityDetailDTO extends CityFundamentals {
  slug: string;
  name: string;
  state: string;
  county?: string;
  /** The feed's id for this city ("city:suwanee-ga") — what a save is keyed on. */
  geoUnitId?: string;
  /** HLS manifest of the city's film. Absent until one is assembled. */
  videoUrl?: string;
  posterUrl?: string;
  /**
   * The film's places in play order, each with its chapter as `bucket` — the
   * city page's hero groups them into the community page's chip strip.
   */
  tourSegments: Array<{
    name: string;
    endFraction: number;
    bucket?: string;
    /** The city's own name for its `signature` chapter. */
    bucketLabel?: string;
  }>;
  credits: CityFilmCredits;
}
