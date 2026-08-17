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

/** The six patterns the owner froze. Do not relax before the data is verified. */
export const SCHOOL_ASSIGNMENT_PATTERNS: readonly SchoolPattern[] = [
  { code: 'zoned_for', re: /\bzoned\s+for\b/i },
  { code: 'your_children', re: /\byour\s+(kid|kids|child|children)\b/i },
  { code: 'will_attend', re: /\bwill\s+attend\b/i },
  { code: 'assigned_to', re: /\bassigned\s+to\b/i },
  { code: 'school_district_is', re: /\bschool\s+district\s+is\b/i },
  { code: 'feeds_into', re: /\bfeeds\s+into\b/i },
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
