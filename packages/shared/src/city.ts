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
 * NO CRIME FIELD, on purpose (owner 2026-11-15: "安全数据先不放"; `lenses.ts`
 * records the fair-housing reason). Do not add one without him.
 *
 * `safety` on the page (phase371) follows the community page's ruling of
 * 2026-11-22 (`community-profile.ts`): facts about the PLACE — the hospital
 * nearest the city's centre, the fire stations around it — and crime figures
 * only as a link out. It is not part of the stored, researched profile.
 */

import type { ReviewDimension } from './review-dimensions';

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
  /** The `cities` row — what a review of the city is filed under. */
  id: string;
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
  /** Facts about the place, never about crime (see the header). */
  safety?: { rows: Array<{ label: string; name: string; note?: string }> };
  /** Approved reviews of the city (phase372). Absent until one is approved. */
  reviews?: {
    count: number;
    avgRating: number;
    dimensionAvgs: Partial<Record<ReviewDimension, number>>;
    items: Array<{
      id: string;
      rating: number;
      dimensions: Partial<Record<ReviewDimension, number>>;
      body: string;
      date: string;
    }>;
  };
  /** A published forecast for the city's county (phase373). */
  forecast?: {
    /** "Forsyth County" */
    area: string;
    year: number;
    value: number;
    baseYear: number;
    baseValue: number;
    /** "+79% from 2020" */
    takeaway: string;
    source: CitySource;
  };
  /**
   * What a month of owning the typical home in the city costs before the
   * mortgage — the block the city's community pages carry
   * (`CommunityProfile.homeValue.holding`), so the two always agree.
   */
  holding?: {
    display: string;
    basis: string;
    rows: Array<{ label: string; usd: number; note?: string }>;
  };
  /** Places to go on from the page, each under a heading. */
  links?: Array<{ label: string; url: string; group?: string }>;
  /**
   * Every scored public school in and around the city, best standing first
   * within each level (phase372). `share` is the community page's "Top N%"
   * among Georgia's schools at that level; `miles` is from the city's centre.
   * The researched `education.schools` are the few a publisher ranked.
   */
  allSchools?: Array<{
    name: string;
    level: 'elementary' | 'middle' | 'high';
    share: number;
    miles?: number;
  }>;
}
