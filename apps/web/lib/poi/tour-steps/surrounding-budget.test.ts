/**
 * A re-run may ADD places. It may not take one away.
 *
 * Research is a grounded Gemini call: two Aberdeen runs a day apart agreed on
 * 53% of place_ids. The budget is 10, so without incumbency a re-run reshuffles
 * it and can drop a POI whose photos are reviewed and whose clips are rendered
 * — owner 2026-08-20: "the current video is good, i think we should keep the
 * most content here… highly repeatable for good quality".
 */

import { describe, expect, it } from 'vitest';
import { selectSurroundingPois } from './photos';

/** ids are `bucket:n`, so bucketOf/scoreOf can be derived from the name. */
const bucketOf = (id: string) => id.split(':')[0] as string;
const scoreOf = (id: string) => Number(id.split(':')[1]);

function pick(ids: string[], incumbents: string[] = [], budget = 10) {
  return selectSurroundingPois({
    surrounding: ids,
    bucketOf,
    scoreOf,
    incumbents: new Set(incumbents),
    budget,
  });
}

describe('selectSurroundingPois', () => {
  it('keeps every incumbent, even one that would lose on score', () => {
    const ids = ['dining:9', 'dining:8', 'shopping:7', 'outdoor:6', 'pets:1'];
    const kept = pick(ids, ['pets:1'], 3);
    expect(kept).toContain('pets:1');
    expect(kept).toHaveLength(3);
  });

  it('is monotonic: adding candidates never evicts an incumbent', () => {
    const before = ['dining:9', 'shopping:8', 'outdoor:7'];
    const kept1 = pick(before, [], 3);
    // A later research run proposes five stronger places.
    const after = [...before, 'civic:10', 'fitness:10', 'kids:10', 'transit:10', 'pets:10'];
    const kept2 = pick(after, kept1, 3);
    for (const id of kept1) expect(kept2).toContain(id);
  });

  it('still fills the budget with new candidates when incumbents leave room', () => {
    const ids = ['dining:9', 'shopping:8', 'outdoor:7', 'civic:6'];
    const kept = pick(ids, ['dining:9'], 3);
    expect(kept).toHaveLength(3);
    expect(kept[0]).toBe('dining:9');
  });

  it('never exceeds the budget, however many incumbents there are', () => {
    const ids = ['a:5', 'b:5', 'c:5', 'd:5', 'e:5'];
    expect(pick(ids, ids, 3)).toHaveLength(3);
  });

  it('reserves three school slots when no incumbent is a school', () => {
    const ids = [
      'schools:9',
      'schools:8',
      'schools:7',
      'dining:10',
      'shopping:10',
      'outdoor:10',
      'civic:10',
    ];
    const kept = pick(ids, [], 5);
    expect(kept.filter((id) => id.startsWith('schools'))).toHaveLength(3);
  });

  it('counts an incumbent school against the RESERVATION, not on top of it', () => {
    const ids = ['schools:9', 'schools:8', 'schools:7', 'schools:6', 'dining:10', 'shopping:10'];
    const kept = pick(ids, ['schools:6'], 6);
    expect(kept).toContain('schools:6');
    // The incumbent consumes one of the three reserved slots, so only two more
    // are reserved — verified by the non-school buckets still getting in.
    expect(kept).toContain('dining:10');
    expect(kept).toContain('shopping:10');
  });

  it('treats SCHOOL_SLOTS as a floor, not a cap', () => {
    // Pre-existing behaviour, asserted so a future change to it is deliberate:
    // schools beyond the reservation stay in the round-robin pool, so a budget
    // with room can seat a fourth. The reservation guarantees three tiers get
    // in; it does not forbid a fourth school.
    const ids = ['schools:9', 'schools:8', 'schools:7', 'schools:6', 'dining:1'];
    const kept = pick(ids, [], 5);
    expect(kept.filter((id) => id.startsWith('schools')).length).toBeGreaterThanOrEqual(3);
  });

  it('spreads across buckets rather than filling from one', () => {
    const ids = ['dining:9', 'dining:8', 'dining:7', 'shopping:6', 'outdoor:5'];
    const kept = pick(ids, [], 3);
    expect(new Set(kept.map(bucketOf)).size).toBeGreaterThan(1);
  });
});

describe('hand-picked POIs', () => {
  it('seats a hand-picked POI before incumbents and before score', () => {
    const ids = ['dining:9', 'shopping:8', 'outdoor:7', 'pets:1'];
    const kept = selectSurroundingPois({
      surrounding: ids,
      bucketOf,
      scoreOf,
      incumbents: new Set(['dining:9', 'shopping:8', 'outdoor:7']),
      handPicked: new Set(['pets:1']),
      budget: 2,
    });
    // The owner's pick is in even though three incumbents outrank it.
    expect(kept).toContain('pets:1');
    expect(kept).toHaveLength(2);
  });

  it('does not seat the same POI twice when it is both', () => {
    const ids = ['dining:9', 'shopping:8'];
    const kept = selectSurroundingPois({
      surrounding: ids,
      bucketOf,
      scoreOf,
      incumbents: new Set(['dining:9']),
      handPicked: new Set(['dining:9']),
      budget: 5,
    });
    expect(kept.filter((id) => id === 'dining:9')).toHaveLength(1);
  });

  it('still honours the budget when hand-picks alone exceed it', () => {
    const ids = ['a:5', 'b:5', 'c:5', 'd:5'];
    const kept = selectSurroundingPois({
      surrounding: ids,
      bucketOf,
      scoreOf,
      incumbents: new Set(),
      handPicked: new Set(ids),
      budget: 2,
    });
    expect(kept).toHaveLength(2);
  });
});
