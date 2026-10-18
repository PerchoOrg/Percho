/**
 * FMLS IDX display rules — the text both apps must show next to FMLS
 * listings, so web and mobile cannot drift apart.
 *
 * Source: FMLS Data Services, 2026-10-12, in the licence thread ("FMLS
 * License Content using the Bridge API"); on 2026-10-15 they made approval
 * conditional on seeing it live. The owner chose rule 13.7(e), "only FMLS
 * IDX Content is used", on 2026-10-18. The disclosure sentences below are
 * FMLS's wording, VERBATIM. Do not edit them for tone or length; a changed
 * word is a compliance question for FMLS, not a copy edit.
 *
 *   13.7.b   the FMLS listing number with each FMLS listing  → `fmlsNumberLabel`
 *   13.7(e)i results / thumbnail / preview views            → `FMLS_RESULTS_DISCLOSURE`
 *   13.7(e)2 the bottom of every listing detail view        → `fmlsDetailDisclosure`
 *   13.8     who runs and supports the display              → `TECHNICAL_ENTITY_STATEMENT`
 *
 * Each disclosure is split around the words FMLS links ("click here") so a
 * renderer can make exactly those words the link to `FMLS_DMCA_URL`.
 */

/**
 * FMLS's DMCA policy page. Their email said to link "false.com/dmca", which
 * is a broken placeholder; this is the live page on fmls.com. Confirm it with
 * FMLS when replying.
 */
export const FMLS_DMCA_URL = 'https://www.fmls.com/dmca';

export interface LinkedText {
  before: string;
  link: string;
  after: string;
}

/** 13.7(e)i — any page showing listing results, thumbnails or previews. */
export const FMLS_RESULTS_DISCLOSURE: LinkedText = {
  before:
    'Information Deemed Reliable But Not Guaranteed. If you believe any FMLS Listing contains material that infringes your copyrighted work, please ',
  link: 'click here',
  after: ' to review our DMCA policy and learn how to submit a takedown request. © FMLS',
};

/** 13.7(e)2 — the bottom of every listing detail view. `year` is the current year. */
export function fmlsDetailDisclosure(year: number): LinkedText {
  return {
    before:
      'Listings on this website come from the FMLS IDX Compilation and may be held by brokerage firms other than the owner of this website. The listing brokerage is identified in any listing details. Information is deemed reliable but is not guaranteed. If you believe any FMLS Listing contains material that infringes your copyrighted work, please ',
    link: 'click here',
    after: ` to review our DMCA policy and learn how to submit a takedown request. © ${year} FMLS.`,
  };
}

/**
 * 13.8 — the identity and contact of the "Technical Entity": the company that
 * handles the FMLS content shown and supports it. That is Percho itself (the
 * licensee). Email only: the contact page publishes no mailing address.
 */
export const TECHNICAL_ENTITY_STATEMENT =
  'Technical entity: Percho, Inc. provides and supports this website and app, including the FMLS listing content shown. Contact: hello@percho.co';

/** 13.7.b — "FMLS #7404568". Undefined when the listing has no FMLS number. */
export function fmlsNumberLabel(mlsNumber: string | null | undefined): string | undefined {
  const n = mlsNumber?.trim();
  return n ? `FMLS #${n}` : undefined;
}
