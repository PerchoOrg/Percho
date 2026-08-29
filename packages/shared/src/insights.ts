/**
 * Move-in insights — the vocabulary both apps agree on.
 *
 * An insight is one card on the explore page: what a buyer would only find
 * out after living at this address, written per home by a research job
 * (`scripts/admin/generate-move-in-insights.ts`). There is no fixed question
 * bank any more (phase130 replaced the phase126 bank): the model researches
 * the address and decides what is worth a card. What is shared is only the
 * two closed vocabularies a card is tagged with.
 *
 *   kind  — how the buyer should read it: a warning, an upside, or a fact.
 *   theme — what part of life it is about. Which themes a buyer lingers on
 *           is the profile signal the section produces.
 */

export const INSIGHT_KINDS = ['watch', 'plus', 'know'] as const;
export type InsightKind = (typeof INSIGHT_KINDS)[number];

export const KIND_LABELS: Record<InsightKind, string> = {
  watch: 'to watch',
  plus: 'upside',
  know: 'good to know',
};

export const INSIGHT_THEMES = [
  'vibe',
  'people',
  'culture',
  'kids',
  'pets',
  'body',
  'nature',
  'work',
  'money',
  'safety',
  'logistics',
  'house',
  'sound',
  'future',
] as const;
export type InsightTheme = (typeof INSIGHT_THEMES)[number];

export const THEME_LABELS: Record<InsightTheme, string> = {
  vibe: 'Vibe',
  people: 'People',
  culture: 'Culture',
  kids: 'Kids',
  pets: 'Pets',
  body: 'Body',
  nature: 'Nature',
  work: 'Work',
  money: 'Money',
  safety: 'Safety',
  logistics: 'Logistics',
  house: 'The house',
  sound: 'Sound',
  future: 'Future',
};

/** How many cards the research job asks for per home. */
export const CARDS_PER_HOME = 8;
