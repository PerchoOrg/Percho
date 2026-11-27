/**
 * What a community's explore page says (phase339) — the document stored in
 * `communities.profile`, and the `profile` field of the mobile community
 * detail (`GET /api/mobile/community/<slug>`).
 *
 * Types only. Stored shape and limits are the zod schema in
 * `apps/web/lib/zod/community-profile.ts`, which checks at compile time that
 * what it accepts still fits this.
 *
 * The page it feeds is ONE screen (owner 2026-11-15, on the eight-section
 * draft: "太长了 没人会看这么多"): six verdict lines and a handful of tiles.
 * Each tile is a finding — a figure or a word, one small chart, one line — and
 * the full chart is a tap away. So every block here carries two things: what
 * the tile prints, and what the sheet draws.
 *
 * Every block is optional but the verdict: a community is researched one block
 * at a time, and a tile with nothing behind it is not drawn.
 *
 * NO INCOME OR CRIME FIELD — the rule `communities.avg_income` and `city.ts`
 * already follow. Do not add one without the owner.
 *
 * `safety` (phase370) is not an exception to that. Owner 2026-11-22, asked
 * what the page's safety direction should carry: facts about the PLACE — how
 * far the nearest emergency room and fire station are, the FEMA flood zone —
 * and crime figures only as a link out to the agencies' own map. A crime
 * count, rate or grade still does not go in this document (`lenses.ts`
 * records why).
 */

export interface CommunityProfileSource {
  name: string;
  url?: string;
}

/** One position among peers: a dot on the line of everyone ranked. */
export interface CommunityRank {
  /** Rows are drawn under their group: "Schools", "Homes", "People". */
  group: string;
  /** "Elementary" */
  label: string;
  /** "two zones", "$747K" */
  note?: string;
  /** "#3 · #6" */
  rank: string;
  /** "of 1,220 in GA" */
  of: string;
  /** Share of peers ranked below, 0–100. Where the dot sits. */
  percentile: number;
  /** A second dot, when the row is two things (two school zones). */
  percentile2?: number;
  /** Set on the rows the page's tile shows (it takes the first four): the rank as the tile prints it, "#3–6". */
  tile?: string;
  /** A school row: how far the school is, straight-line, "0.4 mi". */
  distance?: string;
}

export interface CommunityProfile {
  /** The day the figures were gathered, YYYY-MM-DD. */
  asOf: string;
  /** The page's opening lines: what it is good for, what to think twice about. */
  verdict: { good: string[]; watch: string[] };
  ranks?: {
    rows: CommunityRank[];
    /** The schools ranked, as links. */
    schools?: Array<{ name: string; url: string }>;
    note?: string;
  };
  homeValue?: {
    /** What the series measures: "ZIP 30005". */
    area: string;
    /** "$747K" */
    display: string;
    /** The tile's line: "+60% since 2020". */
    change: string;
    /** The sheet's line: "Up 60% since 2020. Flat since 2024." */
    headline: string;
    /** What it is drawn against: "Metro Atlanta". */
    baseline: string;
    /** USD, one point a year, oldest first. */
    series: Array<{ year: number; value: number; baseline: number }>;
    /** What a month of owning costs before the mortgage. */
    holding?: {
      /** "≈ $940" */
      display: string;
      /** "a month to hold a typical 30005 home, before the mortgage" */
      basis: string;
      rows: Array<{ label: string; usd: number; note?: string }>;
    };
  };
  /**
   * What a home in THIS community is worth, until sold prices arrive with the
   * listing feed (phase404.16). `homeValue` above is its city's or ZIP's; a
   * card for one community must not print its city's figure as its own
   * (owner 2026-11-27: 「应该写的是这个小区的price」, then 「先给一个估值 不要
   * 空着」). An estimate, and worded as one.
   */
  estimate?: {
    /** "$1.2M" */
    display: string;
    /** What the figure is, under it: "est. home value", "new homes from". */
    label: string;
    /** How it was arrived at: "Median county appraisal of 393 homes". */
    basis: string;
  };
  dues?: {
    /** "$824" */
    display: string;
    /** "a year" */
    period: string;
    /** "The lake is yours. The pool is a club." */
    headline: string;
    /** The tile's two lines. */
    tile: { included: string; separate: string };
    included: Array<{ title: string; note?: string }>;
    /** What costs extra, each with where to ask. */
    separate: Array<{ title: string; note?: string; url?: string }>;
  };
  /** The words residents use, against how common each is nearby. */
  words?: {
    /** The rarest one — the tile's figure: "Convenient". */
    lead: string;
    /** "1 in 6 communities say it" */
    leadNote: string;
    /** "Alpharetta's 342 communities" */
    scope: string;
    /** Rarest first. `pct` is the share of the scope that says the same word. */
    rows: Array<{ word: string; pct: number }>;
  };
  /** Dated things nearby. The page drops the ones that have passed. */
  events?: Array<{
    /** YYYY-MM-DD */
    date: string;
    /** Last day, for something that runs. */
    until?: string;
    title: string;
    /** "Avalon · 2.9 mi" */
    where: string;
    url?: string;
  }>;
  /** Facts about the place, never about crime (see the header). */
  safety?: {
    rows: Array<{
      /** "Hospital", "Fire station", "Flood zone" */
      label: string;
      /** "Northside Hospital Forsyth", "Minimal flood hazard" */
      name: string;
      /** "2.4 mi", "Zone X" */
      note?: string;
    }>;
  };
  /**
   * Places to go on from the page. `group` is the heading a link sits under
   * ("Community", "Homes", "Schools", "Safety", "City"); a profile stored
   * before phase370 has none.
   */
  links?: Array<{ label: string; url: string; group?: string }>;
  sources: CommunityProfileSource[];
}
