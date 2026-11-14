import { describe, expect, it } from 'vitest';
import { compareIdsSchema } from './compare';

const A = '646ff814-8927-427d-9a7e-43cb1d89d1fe';
const B = 'ef8e204b-fc90-4c6e-a58a-8052c4d1e819';

describe('compareIdsSchema', () => {
  it('splits, trims and dedupes', () => {
    expect(compareIdsSchema.parse(` ${A}, ${B},${A}`)).toEqual([A, B]);
  });

  it('needs at least two distinct communities', () => {
    expect(compareIdsSchema.safeParse(`${A},${A}`).success).toBe(false);
    expect(compareIdsSchema.safeParse('').success).toBe(false);
  });

  it('rejects anything that is not a uuid', () => {
    expect(compareIdsSchema.safeParse(`${A},windward`).success).toBe(false);
  });

  it('caps at five', () => {
    const six = Array.from({ length: 6 }, (_, i) => A.replace(/.$/, String(i))).join(',');
    expect(compareIdsSchema.safeParse(six).success).toBe(false);
  });
});
