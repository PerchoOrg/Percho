import type { Amenity } from '@/lib/poi/tour-orchestrator/amenity';
/**
 * A film never opens on houses (phase366.6). Towne Village's first cut opened
 * on its townhomes because a new community has no amenity to lead with.
 */
import { describe, expect, it } from 'vitest';
import { homesLast } from './shots';

const shot = (photo_id: string, sort_order: number) => ({ photo_id, sort_order });
const amenity = (map: Record<string, Amenity>) => (id: string) => map[id];

describe('homesLast', () => {
  it('moves an act of homes alone to the end', () => {
    const out = homesLast(
      [shot('homes', 0), shot('park', 1), shot('school', 2)],
      amenity({ homes: 'streetscape' }),
    );
    expect(out.map((s) => s.photo_id)).toEqual(['park', 'school', 'homes']);
    expect(out.map((s) => s.sort_order)).toEqual([0, 1, 2]);
  });

  it('leaves an act with a real amenity where it is', () => {
    const shots = [shot('pool', 0), shot('homes', 1), shot('park', 2)];
    expect(homesLast(shots, amenity({ pool: 'pool', homes: 'streetscape' }))).toBe(shots);
  });

  it('leaves a film that is nothing but the act alone', () => {
    const shots = [shot('homes', 0)];
    expect(homesLast(shots, amenity({ homes: 'streetscape' }))).toBe(shots);
  });
});
