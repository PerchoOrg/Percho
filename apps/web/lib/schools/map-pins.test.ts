import { describe, expect, it } from 'vitest';
import { type SchoolRow, projectSchoolPins } from './map-pins';

function row(over: Partial<SchoolRow> = {}): SchoolRow {
  return {
    id: 'a1',
    name: 'Milton High School',
    level: 'high',
    lat: 34.13,
    lng: -84.3,
    district: 'Fulton County',
    test_scores: { ga_milestones: { year: '2024-25', proficientPct: 67.4 } },
    ...over,
  };
}

describe('projectSchoolPins', () => {
  it('carries the state’s own proficiency figure, rounded', () => {
    const [pin] = projectSchoolPins([row()]);
    expect(pin?.proficiencyPct).toBe(67);
    expect(pin?.name).toBe('Milton High School');
    expect(pin?.district).toBe('Fulton County');
  });

  it('keeps a school GOSA never scored', () => {
    // Suppressed cells (too few tested students) and schools that opened last
    // year both land here. An unrated school is still on the map — dropping it
    // would draw a neighbourhood as emptier than it is.
    const [pin] = projectSchoolPins([row({ test_scores: {} })]);
    expect(pin).toBeDefined();
    expect(pin?.proficiencyPct).toBeUndefined();
  });

  it('skips a school with no coordinate', () => {
    // The CCD directory carries schools the EDGE geocode file never matched.
    expect(projectSchoolPins([row({ lat: null })])).toHaveLength(0);
    expect(projectSchoolPins([row({ lng: null })])).toHaveLength(0);
  });

  it('skips a level the map has no rung for', () => {
    expect(projectSchoolPins([row({ level: 'k8' })])).toHaveLength(0);
    expect(projectSchoolPins([row({ level: null })])).toHaveLength(0);
  });

  it('does not invent a rating out of the jsonb', () => {
    // GA does not publish CCRPI as a flat file; the only number here is the
    // Milestones figure, and a differently-shaped payload yields none.
    const [pin] = projectSchoolPins([
      row({ test_scores: { gs_rating: 9, ga_milestones: { year: '2024-25' } } }),
    ]);
    expect(pin?.proficiencyPct).toBeUndefined();
    expect(pin).not.toHaveProperty('rating');
  });

  it('leaves out the district key when the row has none', () => {
    const [pin] = projectSchoolPins([row({ district: null })]);
    expect(pin).not.toHaveProperty('district');
  });
});
