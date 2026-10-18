import {
  FMLS_DMCA_URL,
  FMLS_RESULTS_DISCLOSURE,
  type LinkedText,
  TECHNICAL_ENTITY_STATEMENT,
  fmlsDetailDisclosure,
  fmlsNumberLabel,
} from '@percho/shared/fmls';
import { describe, expect, it } from 'vitest';

const whole = (t: LinkedText) => `${t.before}${t.link}${t.after}`;

// FMLS Data Services, 2026-10-12, rule 13.7(e). Pinned so a copy edit to the
// shared module fails here instead of reaching FMLS's next review.
describe('FMLS IDX disclosures are FMLS’s wording, verbatim', () => {
  it('13.7(e)i — results views', () => {
    expect(whole(FMLS_RESULTS_DISCLOSURE)).toBe(
      'Information Deemed Reliable But Not Guaranteed. If you believe any FMLS Listing contains material that infringes your copyrighted work, please click here to review our DMCA policy and learn how to submit a takedown request. © FMLS',
    );
  });

  it('13.7(e)2 — detail views, with the current year', () => {
    expect(whole(fmlsDetailDisclosure(2026))).toBe(
      'Listings on this website come from the FMLS IDX Compilation and may be held by brokerage firms other than the owner of this website. The listing brokerage is identified in any listing details. Information is deemed reliable but is not guaranteed. If you believe any FMLS Listing contains material that infringes your copyrighted work, please click here to review our DMCA policy and learn how to submit a takedown request. © 2026 FMLS.',
    );
  });

  it('links exactly the words FMLS links, to FMLS’s DMCA page', () => {
    expect(FMLS_RESULTS_DISCLOSURE.link).toBe('click here');
    expect(fmlsDetailDisclosure(2026).link).toBe('click here');
    expect(FMLS_DMCA_URL).toBe('https://www.fmls.com/dmca');
  });

  it('13.8 — names the technical entity and a way to reach it', () => {
    expect(TECHNICAL_ENTITY_STATEMENT).toContain('Percho, Inc.');
    expect(TECHNICAL_ENTITY_STATEMENT).toContain('hello@percho.co');
  });
});

describe('fmlsNumberLabel (13.7.b)', () => {
  it('labels a number and trims it', () => {
    expect(fmlsNumberLabel(' 7404568 ')).toBe('FMLS #7404568');
  });

  it('is undefined for a listing with no FMLS number', () => {
    expect(fmlsNumberLabel(null)).toBeUndefined();
    expect(fmlsNumberLabel(undefined)).toBeUndefined();
    expect(fmlsNumberLabel('   ')).toBeUndefined();
  });
});
