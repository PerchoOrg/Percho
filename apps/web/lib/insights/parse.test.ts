import { describe, expect, it } from 'vitest';
import { parseInsightBatch } from './parse';
import { buildInsightsPrompt } from './prompt';

const good = {
  headline: 'Public record is 546 square feet smaller',
  detail:
    'FMLS markets 2,366 sqft and three bedrooms; public record lists 1,820 sqft, four bedrooms, and 2.5 baths.',
  kind: 'watch',
  theme: 'house',
  basis: [
    {
      note: 'FMLS vs public record',
      url: 'https://www.redfin.com/GA/Alpharetta/2895-Shurburne-Dr-30022/home/24555066',
    },
  ],
  decisiveness: 3,
};

function reply(cards: unknown[]): string {
  return `Sure —\n\`\`\`json\n${JSON.stringify({ cards })}\n\`\`\``;
}

describe('parseInsightBatch — a card with no source does not exist', () => {
  it('accepts a well-formed card and nulls an absent verify', () => {
    const r = parseInsightBatch(reply([good]));
    expect(r.rejected).toEqual([]);
    expect(r.accepted).toEqual([
      {
        headline: good.headline,
        detail: good.detail,
        kind: 'watch',
        theme: 'house',
        verify: null,
        basis: good.basis,
        decisiveness: 3,
      },
    ]);
  });

  it('rejects an empty basis and a basis without a url', () => {
    expect(parseInsightBatch(reply([{ ...good, basis: [] }])).rejected[0]?.reason).toBe(
      'no source',
    );
    expect(
      parseInsightBatch(reply([{ ...good, basis: [{ note: 'x' }] }])).rejected[0]?.reason,
    ).toContain('basis.0.url');
  });

  it('rejects a kind or theme outside the shared vocabulary', () => {
    expect(parseInsightBatch(reply([{ ...good, kind: 'warning' }])).rejected[0]?.reason).toContain(
      'kind',
    );
    expect(parseInsightBatch(reply([{ ...good, theme: 'traffic' }])).rejected[0]?.reason).toContain(
      'theme',
    );
  });

  it('rejects one malformed card without losing the rest of the batch', () => {
    const r = parseInsightBatch(
      reply([
        { ...good, headline: '' },
        { ...good, headline: 'Second card', kind: 'plus' },
      ]),
    );
    expect(r.accepted.map((c) => c.headline)).toEqual(['Second card']);
    expect(r.rejected).toHaveLength(1);
  });

  it('keeps the first of two identical headlines', () => {
    const r = parseInsightBatch(reply([good, { ...good, detail: 'again' }]));
    expect(r.accepted).toHaveLength(1);
    expect(r.rejected[0]?.reason).toBe('duplicate headline');
  });

  it('fails closed on a reply with no JSON at all', () => {
    const r = parseInsightBatch('I could not find anything about this address.');
    expect(r.accepted).toEqual([]);
    expect(r.rejected[0]?.headline).toBe('*');
  });
});

describe('buildInsightsPrompt', () => {
  it('carries the home, the Fair Housing rule and the card count', () => {
    const p = buildInsightsPrompt({
      address: '2895 Shurburne Drive',
      city: 'Alpharetta',
      state: 'GA',
      zip: '30022',
      yearBuilt: 1983,
      beds: 4,
      baths: 3,
      price: 500000,
      description: ['Fixer, sold as-is.'],
    });
    expect(p).toContain('Address: 2895 Shurburne Drive, Alpharetta, GA 30022');
    expect(p).toContain('Built 1983 · 4 bed / 3 bath · asking $500,000');
    expect(p).toContain('Listing says: Fixer, sold as-is.');
    expect(p).toContain('WRITE 8 INSIGHT CARDS');
    expect(p).toContain('Fair Housing');
    expect(p).toContain('{"cards":[...]}');
  });

  it('omits fact lines it does not have rather than printing blanks', () => {
    const p = buildInsightsPrompt({ address: '1 Main St', city: 'Duluth', state: 'GA' });
    expect(p).toContain('Address: 1 Main St, Duluth, GA\n\nRESEARCH FIRST');
  });
});
