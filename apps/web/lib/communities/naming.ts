/**
 * What a community is CALLED, and when two names are the same place.
 *
 * ── Read this before writing anything that creates a community row ─────────
 *
 * Community names arrive from several sources and every one of them names the
 * same place differently: a county plat layer, an MLS/listing import, a
 * builder's own site, an agent typing into the dashboard. Left alone that
 * produces three rows for one neighbourhood, each under a name a buyer would
 * not use. The rules below are the ones the phase191–193 county-plat import
 * arrived at the hard way; apply them at every new entry point rather than
 * re-deriving them.
 *
 * **The owner's principle (2026-09-07):** 「显示的和实际存储的应该一致，更重要的
 * 是他们应该是人们最容易说到的名字，可以口口相传」 — one row per place, its
 * stored name IS its displayed name, and that name is the one people say out
 * loud. Not the most precise one. `2090 Lake Windward Drive` sits inside an
 * 11.5-acre plat called "Neighborhoods of Windward Cove", inside the
 * 1,328-acre "Windward". Its own MLS record says **Windward**. Windward wins.
 *
 * ── The four steps, in order ───────────────────────────────────────────────
 *
 * 1. `cleanName(raw)` — is this a place someone lives, and what is it called
 *    without the recorder's vocabulary? Returns null for offices, apartments,
 *    storage, developer entities and owner plats. Strips phase and unit
 *    numbering, which is the difference between one community and eleven.
 *
 * 2. `unwrap(name)` + `isPodOf(...)` — is this a slice of a bigger place that
 *    is NAMED AFTER it? "Neighborhoods of Windward Cove", "Sweetwater Landing
 *    Townhomes". If so, do not create a row: the parent already covers the
 *    ground, and the parent's name is the sayable one.
 *
 * 3. `squash(name)` — the duplicate key. Two names that differ only in spaces
 *    and punctuation are one place: "SUNVALLEY ESTATES" and "Sun Valley
 *    Estates", "Northfarm" and "North Farm". Merge into the EXISTING row so
 *    its slug (shared links point at it) and its photo survive.
 *
 * 4. `sayable(a, b)` — when merging, which of the two spellings to keep.
 *
 * ── What is deliberately NOT here ──────────────────────────────────────────
 *
 * No rule that classifies a name by its shape. A proposal to reject names
 * ending in `Rd`/`Dr`/`Road`, or equal to their city, was rejected by the
 * owner — 「there is not single rule」 — and the counter-examples are easy:
 * people do say they live off Peachtree Road; Nextdoor's "Alpharetta" is the
 * old town centre and residents do call it that; "River Road Estates" is a
 * real subdivision. Whether a name is said out loud is not visible in its
 * letters.
 *
 * What IS evidence: **independent sources agreeing**. The plat name, the MLS
 * subdivision field, the Nextdoor name residents chose, a sold record. A name
 * two unrelated sources use is one people say. A name only one source has is
 * a candidate, not a fact. When a second source is not available, keep what
 * you have and change nothing — an invented rule is worse than an ugly name.
 *
 * Pure and dependency-free so `scripts/admin/*` can import it too.
 */

/**
 * Names for something other than a home.
 *
 * A county land-use code will not catch these: Gwinnett files "GWINNETT PLACE
 * COMMERCIAL CENTER" and "KILLIAN HILL OFFICE CONDOMINIUMS" under the same
 * code as a subdivision, because the code means "a platted development", not
 * "housing". `LP`/`INC`/`LLC` is the developer entity recorded as the plat
 * name ("GWINRAY LP"). Deliberately narrow — it matches the industrial,
 * retail and office words only, so "Village at …" and "Towne Center …"
 * survive.
 */
const NOT_A_PLACE_TO_LIVE =
  /\b(COMMERCIAL|BUSINESS PARK|SHOPPING|OFFICE|PROFESSIONAL|PRFSNL|INDUSTRIAL|RETAIL|WAREHOUSE|CORPORATE|STORAGE|FLOORS?|BANK|PROPERTY OF|APTS?|APARTMENTS?|LP|INC|LLC|LTD|CORP)\b/;

/**
 * A plat recorded under a person's name — one owner splitting one parcel, not
 * a community. DeKalb is full of them. The tell is a middle initial: a
 * letter, a full stop, a space. "N.DRUID WOODS" survives, because its full
 * stop has no space after it, which is what separates an abbreviation from an
 * initial.
 */
const A_PERSONS_NAME = /\b[A-Z]\.\s|^[A-Z]\.\s?[A-Z]\./;

/**
 * Phase and plat-ese suffixes, stripped off the END of a name.
 *
 * Owner, 2026-09-07: 「我不要期数」. A phase is not a community — "CREEK PARK
 * HILLS UNIT 9" is Creek Park Hills. Six county recorders wrote the same idea
 * six ways, so the number is joined to its keyword by a space, a dot, a hash
 * or a hyphen, and may be a comma-separated list or a roman numeral.
 * `CONDOMINIUM`, `S/D` and `SUB` are the recorder's vocabulary, not the
 * buyer's: nobody says they live in Apple Valley Condominiums.
 */
const SUFFIXES = [
  /\s*\b(?:UNITS?|PHASES?|PH|SECTIONS?|SEC|PODS?|PARCELS?|TRACTS?|REVISIONS?|REV|NO)\b[\s.#-]*[0-9IVX]+[A-Z]?(?:\s*(?:&|AND|-)\s*[0-9IVX]+[A-Z]?)*$/,
  /\s*\b(?:PHASES?|UNITS?|BLKS?|BLOCKS?|SECTIONS?|LOTS?)\b[\s.#-]*[0-9]+(?:\s*[,&]\s*[0-9]+)*[A-Z]?$/,
  /\s*#\s*[0-9]+$/,
  // A bare trailing roman numeral is a phase everywhere in this data
  // ("OAKS ON WOODLAWN II"); a lone "I" is not, so it is left out.
  /\s+(?:II|III|IV|V|VI|VII|VIII|IX|X)$/,
  /\s+(?:A\s+)?CONDOMINIUMS?(?:\s+ASSOC(?:IATION)?)?$/,
  /\s+(?:SUBDIVISION|SUB)$/,
  // Forsyth labels pods with letters ("POD S3 C") and parenthesises the
  // marketing name after them ("(SEVEN OAKS PHASE 2)").
  /\s*\([^)]*\)$/,
  /\s*\bPODS?\b\s*[A-Z0-9][A-Z0-9-]*(?:\s+[A-Z])?$/,
  /\s*\/\s*(?:TWNHS|TH|SFR|CONDOS?)$/,
];

/** Upper-cased, single-spaced. The form every rule here compares against. */
export function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toUpperCase();
}

/**
 * The name as a person would say it, upper-cased — or null when the row names
 * no home at all.
 *
 * Run this BEFORE grouping or de-duplicating: the cleaned form is the
 * identity. "CREEK PARK HILLS UNIT 9" and "CREEK PARK HILLS UNIT 10" have to
 * become one key before their polygons are ever unioned.
 */
export function cleanName(raw: string): string | null {
  let s = normalizeName(raw);
  if (!s || NOT_A_PLACE_TO_LIVE.test(s) || A_PERSONS_NAME.test(s)) return null;
  // DeKalb writes "CREEK PARK HILLS S/D UNIT 5" — the recorder's abbreviation
  // for "subdivision" sits in the middle, not at the end.
  s = s
    .replace(/\bS\s*\/\s*D\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (let pass = 0; pass < 5; pass++) {
    const before = s;
    // Names arrive with trailing debris — "GLYNBROOK UNIT 2,", "BRIARCLIFF
    // WOODS EAST #6 &" — which has to come off before and after each strip,
    // or the next suffix is no longer at the end.
    s = s.replace(/[\s,&.\-#]+$/, '');
    for (const re of SUFFIXES) s = s.replace(re, '');
    if (s === before) break;
  }
  s = s.trim();
  return s.length < 3 ? null : s;
}

/**
 * Punctuation- and space-insensitive key. Two names with the same key are the
 * same place recorded by two different people.
 */
export function squash(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * The inner name a developer's wrapper points at, or null.
 *
 * "Neighborhoods of Windward Cove" → "WINDWARD COVE". "Sweetwater Landing
 * Townhomes" → "SWEETWATER LANDING". The wrapper NAMES ITS PARENT, which is
 * the whole point: the pod is a slice of somewhere that already has a name.
 */
export function unwrap(name: string): string | null {
  const s = normalizeName(name);
  const prefix =
    /^(?:THE\s+)?(?:NEIGHBORHOODS?|ENCLAVE|VILLAS?|TOWNHOMES?|COTTAGES?|RESERVE|RETREAT|MANOR|PARK|POINTE?|LANDING|GROVE|COURTS?|GARDENS?)\s+(?:OF|AT)\s+(.+)$/;
  const suffix = /^(.+?)\s+(?:TOWNHOMES?|VILLAS?|COTTAGES?|CONDOS?|ESTATES\s+CONDOMINIUM)$/;
  const m = s.match(prefix) ?? s.match(suffix);
  return m?.[1]?.trim() || null;
}

/**
 * Is `inner` (from `unwrap`) a slice of the community called `parentName`?
 *
 * Matched on a WORD BOUNDARY, not exact equality: the wrapper leaves
 * "WINDWARD COVE" behind and the community it belongs to is called
 * "Windward". The boundary is what keeps it honest — "WINDWARD COVE" is part
 * of "Windward", but not of a hypothetical "Wind".
 *
 * Only fold when the parent's polygon actually contains the pod. A name match
 * across town is a coincidence, not a parent.
 */
export function isPodOf(inner: string, parentName: string): boolean {
  const p = normalizeName(parentName);
  return inner === p || inner.startsWith(`${p} `);
}

/**
 * Are two names for the same ground the same place?
 *
 * Either the squashed forms are equal, or one is a prefix of the other AND
 * the two shapes are within a factor of two. The area test is what stops
 * "Windward Pointe" being merged into "Windward": a genuinely different
 * subdivision nested inside another is far smaller than its container, while
 * a spelling variant of the same place is the same size.
 *
 * `areaRatio` is candidate ÷ existing, in any unit as long as it is the same
 * one. Pass 1 when you have no geometry to compare — then only the squashed
 * equality can fire, which is the conservative half of this rule.
 */
export function isSamePlace(a: string, b: string, areaRatio: number): boolean {
  const ka = squash(a);
  const kb = squash(b);
  if (ka === kb) return true;
  if (!(ka.startsWith(kb) || kb.startsWith(ka))) return false;
  return areaRatio > 0.5;
}

/**
 * Which of two names for one place to keep.
 *
 * More word breaks wins — "Sun Valley Estates" over "Sunvalley Estates",
 * because the spelling that lost its spaces is the recorder's, not the
 * street's. Then longer wins: "Canterbury Farms" over "Canterbury", since the
 * fuller form is what the entrance sign carries.
 *
 * This is a tie-break between two names already decided to be the same place.
 * It is NOT a judgement about which places are real.
 */
export function sayable(a: string, b: string): string {
  const words = (s: string) => s.trim().split(/\s+/).length;
  if (words(a) !== words(b)) return words(a) > words(b) ? a : b;
  return a.length >= b.length ? a : b;
}

/** `SWEET BOTTOM PLANTATION` → `Sweet Bottom Plantation`. */
const LOWER_WORDS = new Set(['of', 'at', 'the', 'and', 'on', 'in']);
export function titleCaseName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .split(' ')
    .map((w, i) => (i > 0 && LOWER_WORDS.has(w) ? w : w.replace(/^[a-z]/, (c) => c.toUpperCase())))
    .join(' ');
}
