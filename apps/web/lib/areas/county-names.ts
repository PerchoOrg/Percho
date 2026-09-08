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
  const l = label.trim().toLowerCase().replace(/\s+/g, ' ');
  const c = county.trim().toLowerCase();
  if (!l.startsWith(`${c} county`)) return false;
  const rest = l.slice(`${c} county`.length);
  // Exactly the county, or the county followed by a separator — never another
  // word character, so "Cherokee Countyside" is not Cherokee County.
  return rest === '' || /^[\s\-,–—]/.test(rest);
}
