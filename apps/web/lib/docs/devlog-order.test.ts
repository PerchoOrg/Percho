import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * DEVLOG.md is reverse chronological — CLAUDE.md §2.1, rule 2, one of the four
 * the owner calls non-negotiable.
 *
 * I inserted about fifty-five entries into it in one run, each by finding the
 * heading above and writing before it. Every insertion was individually
 * correct and **one of them was still out of order**: phase205 carried 11:20
 * while phase206, which came after it, carried 11:10. Nothing looked at the
 * whole file until this did.
 *
 * ── Why the boundary ───────────────────────────────────────────────────────
 *
 * Three older pairs contradict their own order too — 2026-09-06, -05 and -04,
 * all from earlier sessions. They are left alone on purpose: the timestamps in
 * this file are written by hand, the true times were never recorded anywhere,
 * and "fixing" them would mean inventing four numbers to satisfy a test. That
 * is the thing this codebase spent a day removing.
 *
 * So the check covers entries from 2026-09-08, which is everything written
 * since the file was last known-good in order. It cannot repair history; it can
 * stop it happening again.
 */

const DEVLOG = readFileSync(new URL('../../../../DEVLOG.md', import.meta.url), 'utf8');
/** Entries before this were written in sessions whose clock nobody kept. */
const CHECKED_FROM = '2026-09-08';

interface Entry {
  date: string;
  time: string;
  title: string;
}

function entries(): Entry[] {
  return [...DEVLOG.matchAll(/^## (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})(?: UTC)? — (.+)$/gm)].map(
    (m) => ({ date: m[1] as string, time: m[2] as string, title: m[3] as string }),
  );
}

describe('DEVLOG.md', () => {
  it('has entries to check', () => {
    const recent = entries().filter((e) => e.date >= CHECKED_FROM);
    expect(recent.length).toBeGreaterThan(20);
  });

  it('is reverse chronological', () => {
    // Newest first. An entry inserted above one that is actually newer reads as
    // history in the wrong order, which is the one thing this file is for.
    const recent = entries().filter((e) => e.date >= CHECKED_FROM);
    for (let i = 1; i < recent.length; i++) {
      const above = recent[i - 1] as Entry;
      const below = recent[i] as Entry;
      const a = `${above.date} ${above.time}`;
      const b = `${below.date} ${below.time}`;
      expect(
        b <= a,
        `"${below.title.slice(0, 48)}" (${b}) sits below "${above.title.slice(0, 48)}" (${a})`,
      ).toBe(true);
    }
  });

  it('gives every entry a title after the timestamp', () => {
    for (const e of entries().filter((x) => x.date >= CHECKED_FROM)) {
      expect(e.title.trim().length, `${e.date} ${e.time}`).toBeGreaterThan(8);
    }
  });
});
