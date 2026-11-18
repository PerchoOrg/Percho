/**
 * A city film is told in CHAPTERS that stand alone (phase345). PURE.
 *
 * Owner 2026-11-16: "一个city视频很长 不是所有人都对历史或者前面的介绍感兴趣 比如
 * 有人只想看不同城市的学区部分 … 模块化内容 可以让人自主选择", then "每一个章节可以
 * 做得独立一些可以单独拉出来看 … 每个city尽量覆盖". So every city draws on one
 * list of chapters, a viewer jumps to the one they came for, and the four a
 * buyer compares cities by are in every film.
 *
 * The schema (`lib/zod/city-profile.ts`) only knows the chapter names. These
 * rules are checked when a profile is WRITTEN (`upsert-city-profile.ts`), not
 * when it is read: a stored film from before the list must still parse, or its
 * city page disappears.
 */
import type { CityFilmChapter, CityFilmLine } from '@/lib/zod/city-profile';

/**
 * The few SECTIONS a viewer navigates by (phase348). Twelve chapters is how a
 * film is WRITTEN; eleven names on a phone card is a wall — owner 2026-11-17:
 * "不要太多太密 大致的划分几个就好". So the card's bar, its row of names and the
 * city page's chips show these five, each a run of chapters.
 */
export const CITY_FILM_SECTIONS = [
  {
    key: 'about',
    label: 'Overview',
    chapters: ['overview', 'signature', 'history', 'growth', 'future'],
  },
  { key: 'schools', label: 'Schools', chapters: ['schools'] },
  { key: 'homes', label: 'Homes', chapters: ['homes'] },
  { key: 'commute', label: 'Commute', chapters: ['commute'] },
  { key: 'life', label: 'Life', chapters: ['daily', 'outdoor', 'downtown', 'events'] },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  chapters: readonly CityFilmChapter[];
}>;

/**
 * The least of the film a section may take (phase354).
 *
 * The card draws the sections as a timeline: a dot where one hands over to the
 * next and each section's name under its own stretch (owner 2026-11-18: "把字放
 * 到对应的区间下面 … 确定一个区间最少时长 不完全均匀可以接受 但是某个太短不好看").
 * A name needs room: 15% of the narrowest card (343 pt) is 51 pt, which the
 * longest name, "Commute", fits at a point under full size. Below that the
 * names collide — Alpharetta's Homes was 9% and Commute 8%.
 */
export const MIN_SECTION_SHARE = 0.15;

/**
 * The sections that take less of the film than a section may, as problems.
 * `parts` is the film in order: each line's chapter and how long it runs.
 */
export function shortSections(
  parts: ReadonlyArray<{ chapter: string | undefined; seconds: number }>,
): string[] {
  const total = parts.reduce((a, p) => a + p.seconds, 0);
  if (total <= 0) return [];
  const bySection = new Map<string, number>();
  for (const part of parts) {
    const section = part.chapter ? sectionOf(part.chapter) : null;
    if (section) bySection.set(section.label, (bySection.get(section.label) ?? 0) + part.seconds);
  }
  const need = Math.ceil(total * MIN_SECTION_SHARE);
  return [...bySection]
    .filter(([, seconds]) => seconds / total < MIN_SECTION_SHARE)
    .map(
      ([label, seconds]) =>
        `the "${label}" section runs ${Math.round(seconds)}s, ${Math.round((seconds / total) * 100)}% of the film — a section needs ${Math.round(MIN_SECTION_SHARE * 100)}% (about ${need}s here) so its name fits under its stretch of the bar; give it another line, or shorten the others`,
    );
}

/** The section a chapter belongs to; null for a key that is not a chapter. */
export function sectionOf(chapter: string): { key: string; label: string } | null {
  const section = CITY_FILM_SECTIONS.find((s) =>
    (s.chapters as readonly string[]).includes(chapter),
  );
  return section ? { key: section.key, label: section.label } : null;
}

/**
 * A film's segments, re-filed under their SECTION — what the card and the
 * pages group by. A segment whose bucket is not a chapter is left as it is.
 */
export function bySection<T extends { bucket?: string; bucketLabel?: string }>(
  segments: readonly T[],
): T[] {
  return segments.map((segment) => {
    const section = segment.bucket ? sectionOf(segment.bucket) : null;
    return section ? { ...segment, bucket: section.key, bucketLabel: section.label } : segment;
  });
}

/** In every city's film — what a buyer compares cities by. */
export const REQUIRED_CHAPTERS: readonly CityFilmChapter[] = [
  'overview',
  'schools',
  'homes',
  'commute',
];

/**
 * Why the script is not a film of chapters, one line per problem; empty when
 * it is. What it checks is what makes a chapter something a viewer can jump
 * to: every line is in one, each is ONE unbroken block, the four required are
 * there, the film opens on the overview, and a `signature` chapter has a name —
 * and that each SECTION's chapters sit together, since a section is one stretch
 * of the bar.
 */
export function chapterProblems(lines: readonly CityFilmLine[], signature?: string): string[] {
  const problems: string[] = [];
  const blocks: CityFilmChapter[] = [];
  lines.forEach((line, i) => {
    if (!line.chapter) {
      problems.push(`line ${i + 1} ("${line.say.slice(0, 40)}…") has no chapter`);
      return;
    }
    if (blocks[blocks.length - 1] !== line.chapter) blocks.push(line.chapter);
  });

  const seen = new Set<CityFilmChapter>();
  for (const chapter of blocks) {
    if (seen.has(chapter)) {
      problems.push(
        `"${chapter}" is told in two places — a chapter is one block, so it can be watched alone`,
      );
    }
    seen.add(chapter);
  }

  const sections: string[] = [];
  for (const chapter of blocks) {
    const label = sectionOf(chapter)?.label ?? chapter;
    if (sections[sections.length - 1] !== label) sections.push(label);
  }
  for (const label of new Set(sections.filter((l, i) => sections.indexOf(l) !== i))) {
    const members = CITY_FILM_SECTIONS.find((s) => s.label === label)?.chapters.join(', ');
    problems.push(`the "${label}" section is split — keep its chapters together (${members})`);
  }

  for (const required of REQUIRED_CHAPTERS) {
    if (!seen.has(required)) problems.push(`no "${required}" chapter — every city has one`);
  }
  if (blocks.length > 0 && blocks[0] !== 'overview') {
    problems.push('the film opens on the overview');
  }
  if (seen.has('signature') && !signature) {
    problems.push('the "signature" chapter needs its name — set film.signature ("Golf")');
  }
  return problems;
}
