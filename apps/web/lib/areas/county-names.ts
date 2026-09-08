/**
 * Telling a Georgia county from the city that shares its name.
 *
 * Georgia has a city of Forsyth (in Monroe County), a city of Jackson (in
 * Butts County), a city of Douglas (in Coffee County), a city of Dawson (in
 * Terrell County) and a city of Morgan (in Calhoun County) — and a Forsyth,
 * Jackson, Douglas, Dawson and Morgan County, none of which contain them.
 *
 * Any dataset keyed by place NAME therefore has a trap in it, and a prefix or
 * `includes` match walks straight into it: matching "Forsyth" against a rate
 * survey finds the city first and prices a county eighty miles away. This is
 * the name-based cousin of the collision `locate.ts` avoids geometrically, and
 * it cost five wrong counties in a draft of the water import before the strict
 * form replaced it.
 */

/**
 * True when `label` names `county` AS A COUNTY.
 *
 * The label must say so — "Cobb County", "Cherokee County Water and Sewerage
 * Authority" — rather than merely beginning with the name. A bare "Forsyth"
 * is the city and is rejected.
 */
export function namesCounty(label: string, county: string): boolean {
  const l = label.trim().replace(/\s+/g, ' ');
  const c = county.trim();
  // "<name> County" as whole words, ANYWHERE in the label.
  //
  // Not just at the start, because joint city-county authorities put the city
  // first: "Douglasville-Douglas County Water and Sewer Authority" serves
  // 109,694 of Douglas County's 140,733 people, and a leading-anchor rule
  // dropped it — a county of 141,000 kept an invented water figure because its
  // utility is named after its largest city.
  //
  // Widening this was measured before it was made. Across all 29 counties the
  // rule newly matches exactly TWO labels, both joint authorities for the
  // county in question, and no city. The word boundaries are what keep it
  // safe: a bare "Douglas" has no "County" in it, "Jacksonville County" does
  // not match Jackson because "Jackson" is not followed by whitespace, and
  // "Cherokee Countyside" does not match because "County" is not followed by a
  // word boundary.
  return new RegExp(`\\b${escapeRegExp(c)}\\s+County\\b`, 'i').test(l);
}

/** So a county name with punctuation cannot become a pattern. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
