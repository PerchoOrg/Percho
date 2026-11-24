/**
 * What the feed prints above a card (phase378): one line for the place and up
 * to three figures the film cannot show.
 *
 * Built by the server for every filmed community and city on
 * `/api/mobile/feed` (`apps/web/lib/feed/glance.ts`) and drawn as sent, so
 * which figures a card carries, and how each is worded, changes without an app
 * release.
 *
 * A figure is real or absent. A card whose profile lacks one carries fewer
 * cells — never a placeholder.
 */

/**
 * The part of the place's Explore page a figure opens, named as the page's
 * tiles are (owner 2026-11-22: "safety, schools, convenience, potential, cost").
 */
export type GlanceTopic = 'safety' | 'schools' | 'convenience' | 'potential' | 'cost';

export const GLANCE_TOPICS: readonly GlanceTopic[] = [
  'safety',
  'schools',
  'convenience',
  'potential',
  'cost',
];

export interface GlanceCell {
  /** The figure as printed: "$747K", "Top 1–7%", "26 mi". */
  value: string;
  /** What it is a figure of, in a few words: "ZIP 30005 homes". */
  label: string;
  /** Absent → the figure is text, not a way in. */
  topic?: GlanceTopic;
}

export interface PlaceGlance {
  /** "Alpharetta" · "Fulton County" — the second half is absent when unknown. */
  place: { lead: string; rest?: string };
  /** Three at most, in the order they are drawn. */
  cells: GlanceCell[];
}

export const GLANCE_MAX_CELLS = 3;
