import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The rules CLAUDE.md §2.2 states for RELEASE.md, as a step rather than a
 * belief.
 *
 * I have broken two of these and fixed them by hand twice. phase227 found the
 * day's entries contradicting each other; phase248 found the same in the
 * handoff notes; **phase249 found that I had re-broken this very file one day
 * after fixing it** — five bullets from 2026-09-09 filed under the 2026-09-08
 * heading, because that was the heading already there.
 *
 * Each of those was individually a correct edit. That is what makes the failure
 * survive knowing about it: the drift is in the whole, and nothing looks at the
 * whole unless something is made to. Knowing the failure mode does not prevent
 * it; only re-reading does — so this re-reads.
 *
 * What it deliberately cannot check: whether the prose is TRUE, or whether a
 * shipped change was written down at all. Those need a person. These are the
 * mechanical parts, which are the parts that drifted.
 */

const RELEASE = readFileSync(new URL('../../../../RELEASE.md', import.meta.url), 'utf8');

/** Everything under one `## v…` heading, excluding the template at the end. */
function versions(): { heading: string; body: string }[] {
  const out: { heading: string; body: string }[] = [];
  const parts = RELEASE.split(/^## (?=v)/m).slice(1);
  for (const p of parts) {
    const nl = p.indexOf('\n');
    const heading = p.slice(0, nl).trim();
    // The file ends with a worked template; it is documentation of the format,
    // not an entry, and its placeholders are meant to look like placeholders.
    if (heading.startsWith('vX.Y')) continue;
    out.push({ heading, body: p.slice(nl) });
  }
  return out;
}

const datesIn = (body: string) =>
  [...body.matchAll(/^### (\d{4}-\d{2}-\d{2})\s*$/gm)].map((m) => m[1] as string);

describe('RELEASE.md follows its own rules', () => {
  it('has versions to check', () => {
    expect(versions().length).toBeGreaterThan(3);
  });

  it('numbers versions v<major>.<minor>, with no patch', () => {
    // CLAUDE.md: "No patch numbers. No v0.x." Bug fixes are dated bullets under
    // the current version; they do not bump anything.
    for (const v of versions()) {
      expect(v.heading, v.heading).toMatch(/^v[1-9]\d*\.\d+ — \S/);
    }
  });

  it('dates each day once per version', () => {
    // Appending under a heading that is already there is exactly how five
    // bullets from the 9th ended up under the 8th.
    for (const v of versions()) {
      const dates = datesIn(v.body);
      expect(new Set(dates).size, `${v.heading} repeats a date`).toBe(dates.length);
    }
  });

  it('orders days newest first', () => {
    // CLAUDE.md §2.2: reverse chronological, like DEVLOG.
    for (const v of versions()) {
      const dates = datesIn(v.body);
      expect(dates, v.heading).toEqual([...dates].sort().reverse());
    }
  });

  it('names no file, module or phase', () => {
    // §2.2: "No code/file/library/SHA names. Write what a user would say."
    // Vivian reads this; "added a debounced useEffect in EditListingForm.tsx"
    // is the example the rule gives of what not to do.
    for (const v of versions()) {
      const banned = [
        /\b\w+\.tsx?\b/,
        /\bphase\d+/i,
        /\b(?:apps|packages|scripts)\//,
        /\b[0-9a-f]{7,40}\b/,
      ];
      for (const re of banned) {
        const hit = re.exec(v.body);
        expect(hit?.[0], `${v.heading} names ${hit?.[0]}`).toBeUndefined();
      }
    }
  });
});
