/**
 * School-assignment language filter (pure).
 *
 * Until the Gwinnett attendance-zone data is verified, no generated narration
 * may state or imply which school a home is assigned to. Location phrasing is
 * fine ("sits on the north side"); attendance phrasing is not.
 *
 * Runs twice: once in the Guard on the Curator's draft lines, and again after
 * the VO Pass, which rewrites those lines and can reintroduce the phrasing.
 */

export interface SchoolPattern {
  code: string;
  re: RegExp;
}

/**
 * The six patterns the owner froze. Do not relax before the data is verified.
 *
 * Extended 2026-08-20 with the progression phrasings below, after the timed
 * narration produced "Sharon Elementary and Riverwatch Middle lead directly to
 * Lambert High School" — an attendance claim in everything but vocabulary,
 * which every one of the six sailed past.
 */
export const SCHOOL_ASSIGNMENT_PATTERNS: readonly SchoolPattern[] = [
  { code: 'zoned_for', re: /\bzoned\s+for\b/i },
  { code: 'your_children', re: /\byour\s+(kid|kids|child|children)\b/i },
  { code: 'will_attend', re: /\bwill\s+attend\b/i },
  { code: 'assigned_to', re: /\bassigned\s+to\b/i },
  { code: 'school_district_is', re: /\bschool\s+district\s+is\b/i },
  { code: 'feeds_into', re: /\bfeeds\s+into\b/i },
  { code: 'feeder', re: /\bfeeder\s+(school|pattern|system)\b/i },
  // "leads to" is ordinary English about paths and roads, so it only counts
  // when what it leads to is a school.
  {
    code: 'progresses_to',
    re: /\b(lead|leads|leading|feed|feeding|flow|flows|move|moves|continue|continues|go|goes)\s+(directly\s+|straight\s+|right\s+|on\s+)?(in)?to\b[^.!?]{0,48}?\b(elementary|middle|high\s+school|academy)\b/i,
  },
  { code: 'students_go_on', re: /\bstudents?\s+(then\s+)?(go|move|continue)\s+on\b/i },
  // The school run, described without naming it. "Morning routines here flow
  // smoothly toward Sharon Elementary" says the same thing as "zoned for" and
  // was written on 2026-08-20 by a model that had just been told not to.
  // Only when a SCHOOL is in the same sentence. Unqualified, this fired on
  // "Publix handles the daily run" and deleted a film's closing line — a trip
  // to the shops is not the school run (2026-08-21).
  {
    code: 'school_run',
    re: /\b(?:(?:morning|daily|weekday|school-?day)\s+(?:routine|routines|run|commute|drop-?off)\b[^.!?]{0,70}?\b(?:elementary|middle\s+school|high\s+school|academy|schools?)\b|\b(?:elementary|middle\s+school|high\s+school|academy|schools?)\b[^.!?]{0,70}?(?:morning|daily|weekday|school-?day)\s+(?:routine|routines|run|commute|drop-?off))\b/i,
  },
  {
    code: 'travels_to_class',
    re: /\b(walk|walks|bike|bikes|drive|drives|bus|buses)\s+(to|toward|towards)\s+(class|school)\b/i,
  },
];

/** Which patterns a line trips, in catalogue order. */
export function findSchoolAssignment(text: string): string[] {
  return SCHOOL_ASSIGNMENT_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.code);
}

/**
 * Drop every sentence that trips a pattern, keep the rest.
 *
 * Sentence-level rather than line-level: a two-sentence line usually has one
 * good half worth keeping, and rewriting the bad half is the VO Pass's job,
 * not a regex's.
 */
export function stripSchoolAssignment(text: string): { text: string; codes: string[] } {
  const codes = findSchoolAssignment(text);
  if (codes.length === 0) return { text, codes };
  const kept = text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => findSchoolAssignment(sentence).length === 0)
    .join(' ')
    .trim();
  return { text: kept, codes };
}
