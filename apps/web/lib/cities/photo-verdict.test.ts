import { RELIGIOUS_PHOTO_DROP_REASON } from '@/lib/poi/religious-content';
import { describe, expect, it } from 'vitest';
import {
  type Verdict,
  approvalChanges,
  cityVerdict,
  elsewhereNote,
  isLegalRejection,
} from './photo-verdict';

describe('isLegalRejection', () => {
  it('binds fair-housing and explicit legal rejections only', () => {
    expect(isLegalRejection(RELIGIOUS_PHOTO_DROP_REASON)).toBe(true);
    expect(isLegalRejection('legal — licence is share-alike')).toBe(true);
    expect(isLegalRejection('listing photo — one home, not the community')).toBe(false);
    expect(isLegalRejection('rejected in review')).toBe(false);
    expect(isLegalRejection(null)).toBe(false);
  });
});

describe('cityVerdict', () => {
  const row = (status: string, reason: string | null = null) => ({
    status,
    rejection_reason: reason,
    reviewed_by: null,
  });

  it('is pending when the city has not decided, whatever communities did', () => {
    expect(cityVerdict({ status: 'approved', rejection_reason: null }, undefined).status).toBe(
      'pending',
    );
    expect(
      cityVerdict({ status: 'rejected', rejection_reason: 'tagger-unusable' }, undefined).status,
    ).toBe('pending');
  });

  it("is the city's own verdict, with its reason", () => {
    const v = cityVerdict(
      { status: 'approved', rejection_reason: null },
      row('rejected', 'outdated'),
    );
    expect(v).toMatchObject({ status: 'rejected', reason: 'outdated', everywhere: false });
    expect(cityVerdict({ status: 'pending', rejection_reason: null }, row('approved')).status).toBe(
      'approved',
    );
  });

  it('a legal rejection overrules the city', () => {
    const v = cityVerdict(
      { status: 'rejected', rejection_reason: RELIGIOUS_PHOTO_DROP_REASON },
      row('approved'),
    );
    expect(v).toMatchObject({ status: 'rejected', everywhere: true });
  });
});

describe('elsewhereNote', () => {
  it('names what communities and other cities decided', () => {
    expect(
      elsewhereNote({ status: 'rejected', rejection_reason: 'tagger-unusable' }, [
        { name: 'Duluth', status: 'approved', rejection_reason: null },
        { name: 'Buford', status: 'pending', rejection_reason: null },
      ]),
    ).toBe('communities: rejected — tagger-unusable · Duluth: approved');
    expect(elsewhereNote({ status: 'approved', rejection_reason: null }, [])).toBe(
      'communities: in a film',
    );
  });

  it('is null when nobody else decided, and silent on a legal rejection (the status says it)', () => {
    expect(elsewhereNote({ status: 'pending', rejection_reason: null }, [])).toBeNull();
    expect(
      elsewhereNote({ status: 'rejected', rejection_reason: 'legal — no likeness release' }, []),
    ).toBeNull();
  });
});

describe('approvalChanges', () => {
  it('approves the film and sends any other approval back to pending, never touching rejections', () => {
    const current = new Map<string, Verdict>([
      ['a', 'approved'],
      ['b', 'approved'],
      ['c', 'rejected'],
      ['d', 'pending'],
    ]);
    expect(approvalChanges(current, new Set(['a', 'd', 'e']))).toEqual({
      approve: ['d', 'e'],
      unapprove: ['b'],
    });
  });
});
