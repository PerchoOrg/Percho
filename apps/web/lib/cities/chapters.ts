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
 * there, the film opens on the overview, and a `signature` chapter has a name.
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
