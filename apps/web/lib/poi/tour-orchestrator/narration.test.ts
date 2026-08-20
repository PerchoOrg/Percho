/**
 * The two things narration must never get wrong: WHEN a line is spoken, and
 * what it claims about a school.
 */

import { describe, expect, it } from 'vitest';
import { buildSections, parseNarration } from './narration';
import { findSchoolAssignment } from './school-language';

const clip = (bucket: string, poi_name: string, duration_s: number) => ({
  bucket,
  poi_name,
  duration_s,
});

describe('buildSections', () => {
  it('anchors each section to the run of clips it describes', () => {
    const sections = buildSections([
      clip('amenities', 'Clubhouse', 4),
      clip('amenities', 'Pool', 4),
      clip('schools', 'Sharon Elementary', 6),
      clip('outdoor', 'Sims Lake Park', 5),
    ]);
    expect(sections.map((s) => [s.bucket, s.startS, s.endS])).toEqual([
      ['amenities', 0, 8],
      ['schools', 8, 14],
      ['outdoor', 14, 19],
    ]);
  });

  it('anchors to clip indices, which is what the worker places audio from', () => {
    const sections = buildSections([
      clip('amenities', 'Clubhouse', 4),
      clip('amenities', 'Pool', 4),
      clip('schools', 'Sharon Elementary', 6),
    ]);
    expect(sections.map((s) => [s.startClip, s.endClip])).toEqual([
      [0, 1],
      [2, 2],
    ]);
  });

  it('collects the distinct places on screen in each section', () => {
    const sections = buildSections([
      clip('schools', 'Sharon Elementary', 3),
      clip('schools', 'Sharon Elementary', 3),
      clip('schools', 'Lambert High', 3),
    ]);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.places).toEqual(['Sharon Elementary', 'Lambert High']);
  });

  it('re-opens a section when a bucket recurs later in the cut', () => {
    // Aberdeen does exactly this: shopping appears at Halcyon and again on the
    // closing Publix shot, 60 seconds apart. They are not one section.
    const sections = buildSections([
      clip('shopping', 'Halcyon', 6),
      clip('outdoor', 'Sims Lake Park', 6),
      clip('shopping', 'Publix', 4),
    ]);
    expect(sections).toHaveLength(3);
    expect(sections[2]?.startS).toBe(12);
  });

  it('sizes the word budget from real duration, so a longer cut says more', () => {
    const short = buildSections([clip('amenities', 'Pool', 6)])[0];
    const long = buildSections([clip('amenities', 'Pool', 26)])[0];
    expect(short?.wordBudget).toBe(10);
    expect(long?.wordBudget).toBe(44);
    expect(long?.wordBudget).toBeGreaterThan((short?.wordBudget ?? 0) * 3);
  });
});

describe('parseNarration', () => {
  const sections = buildSections([
    clip('amenities', 'Clubhouse', 10),
    clip('schools', 'Sharon Elementary', 10),
    clip('pets', 'Caney Creek', 2),
  ]);

  it('places each line at its own section start, not at a running total', () => {
    const raw = JSON.stringify({
      lines: [
        { index: 0, text: 'The clubhouse anchors the neighborhood.' },
        { index: 1, text: 'Sharon Elementary sits a mile north.' },
      ],
    });
    const { segments } = parseNarration(raw, sections);
    expect(segments.map((s) => s.startS)).toEqual([0, 10]);
  });

  it('drops a section too short to say anything in', () => {
    const raw = JSON.stringify({ lines: [{ index: 2, text: 'The dog park.' }] });
    expect(parseNarration(raw, sections).segments).toHaveLength(0);
  });

  it('trims an over-budget line by whole sentences, so it stays speakable', () => {
    const long = `${'word '.repeat(30)}. Short tail.`;
    const { segments, warnings } = parseNarration(
      JSON.stringify({ lines: [{ index: 0, text: long }] }),
      sections,
    );
    expect(segments[0]?.words).toBeLessThanOrEqual(sections[0]?.wordBudget ?? 0);
    expect(warnings.join()).toContain('trimmed');
  });

  it('ignores a line pointing at a section that does not exist', () => {
    const raw = JSON.stringify({ lines: [{ index: 47, text: 'Somewhere else entirely.' }] });
    expect(parseNarration(raw, sections).segments).toHaveLength(0);
  });

  it('survives a model that wraps its JSON in prose', () => {
    const raw = `Here you go:\n{"lines":[{"index":0,"text":"The clubhouse anchors it."}]}\nHope that helps.`;
    expect(parseNarration(raw, sections).segments).toHaveLength(1);
  });

  it('strips school-assignment phrasing and says so', () => {
    const raw = JSON.stringify({
      lines: [
        { index: 1, text: 'Homes here are zoned for Sharon Elementary. It sits a mile north.' },
      ],
    });
    const { segments, warnings } = parseNarration(raw, sections);
    expect(segments[0]?.text).toBe('It sits a mile north.');
    expect(warnings.join()).toContain('school-assignment');
  });
});

describe('school progression phrasing', () => {
  it('catches the line the original six patterns let through', () => {
    // Produced verbatim by the narration model on 2026-08-20.
    expect(
      findSchoolAssignment(
        'Sharon Elementary and Riverwatch Middle lead directly to Lambert High School.',
      ),
    ).toContain('progresses_to');
  });

  it('catches the other ways of saying the same thing', () => {
    for (const line of [
      'Riverwatch Middle feeds into Lambert High School.',
      'It is the feeder school for the area.',
      'Students then go on to Lambert.',
      'Kids move straight into Lambert High School from there.',
      'Morning routines here flow smoothly toward Sharon Elementary and Lambert High.',
      'Families walk to school in under ten minutes.',
    ]) {
      expect(findSchoolAssignment(line).length, line).toBeGreaterThan(0);
    }
  });

  it('leaves ordinary location language alone', () => {
    for (const line of [
      'Sharon Elementary, Riverwatch Middle, and Lambert High School stand along South Forsyth.',
      'The trail leads to Sims Lake Park.',
      'Quiet paths wind through the grounds and continue on to the pool.',
      'Lambert High School is two miles east.',
    ]) {
      expect(findSchoolAssignment(line), line).toEqual([]);
    }
  });
});
