import { describe, expect, it } from 'vitest';
import { buildPrompt, parseAnswerBatch } from './generate';

const good = {
  id: 'logistics.turn',
  answer: 'Left turns onto 104th Ave NE will wait at 8am.',
  basis: [
    { type: 'road', note: '104th Ave NE is a collector; house is at the corner' },
    {
      type: 'project',
      note: 'Calm Collectors project, construction summer 2027',
      url: 'https://www.bothellwa.gov/2551/Calm-Collectors-Project',
    },
  ],
  verify: 'Stand at the corner, weekday 8:00am',
  decisiveness: 2,
  form: 'text',
};

function reply(answers: unknown[]): string {
  return `Here you go:\n\`\`\`json\n${JSON.stringify({ answers })}\n\`\`\``;
}

describe('parseAnswerBatch — answer or absent', () => {
  it('accepts a well-formed answer and carries the bank scope onto the row', () => {
    const r = parseAnswerBatch(reply([good]));
    expect(r.rejected).toEqual([]);
    expect(r.accepted).toHaveLength(1);
    expect(r.accepted[0]).toMatchObject({
      question_id: 'logistics.turn',
      scope: 'street',
      verify: 'Stand at the corner, weekday 8:00am',
      decisiveness: 2,
    });
    expect(r.accepted[0]?.basis[1]?.url).toBe(
      'https://www.bothellwa.gov/2551/Calm-Collectors-Project',
    );
  });

  it('drops an answer with an empty basis — nothing is repaired', () => {
    const r = parseAnswerBatch(reply([{ ...good, basis: [] }]));
    expect(r.accepted).toEqual([]);
    expect(r.rejected[0]?.reason).toBe('empty basis');
  });

  it('drops a sourced basis type that carries no url', () => {
    const r = parseAnswerBatch(
      reply([{ ...good, basis: [{ type: 'project', note: 'speed cushions 2027' }] }]),
    );
    expect(r.accepted).toEqual([]);
    expect(r.rejected[0]?.reason).toContain('needs a url');
  });

  it("drops a basis type the question's allow-list does not carry", () => {
    const r = parseAnswerBatch(
      reply([{ ...good, basis: [{ type: 'photo', note: 'looks like a corner' }] }]),
    );
    expect(r.rejected[0]?.reason).toContain("'photo' not allowed");
  });

  it('refuses reserved (fh=never) and unknown ids', () => {
    const r = parseAnswerBatch(
      reply([
        {
          ...good,
          id: 'people.demographics',
          basis: [{ type: 'social', note: 'x', url: 'https://a.b' }],
        },
        { ...good, id: 'vibe.made_up' },
      ]),
    );
    expect(r.accepted).toEqual([]);
    expect(r.rejected.map((x) => x.reason)).toEqual([
      'reserved question (fh=never)',
      'unknown question id',
    ]);
  });

  it('keeps the first of a duplicated id and rejects the second', () => {
    const r = parseAnswerBatch(reply([good, { ...good, answer: 'again' }]));
    expect(r.accepted).toHaveLength(1);
    expect(r.rejected[0]?.reason).toBe('duplicate id');
  });

  it("rejects a form that is not the question's own", () => {
    const r = parseAnswerBatch(reply([{ ...good, form: 'map' }]));
    expect(r.rejected[0]?.reason).toContain("'map' is not the question's 'text'");
  });

  it('rejects one malformed item without losing the rest of the batch', () => {
    const { id: _dropped, ...noId } = good;
    const r = parseAnswerBatch(reply([noId, { ...good, id: 'safety.speed', form: 'number' }]));
    expect(r.accepted.map((a) => a.question_id)).toEqual(['safety.speed']);
    expect(r.rejected).toEqual([{ id: '?', reason: 'schema: id Required' }]);
  });

  it('fails closed on a reply with no JSON at all', () => {
    const r = parseAnswerBatch('I could not find anything about this address.');
    expect(r.accepted).toEqual([]);
    expect(r.rejected[0]?.id).toBe('*');
  });
});

describe('buildPrompt', () => {
  it('carries the Fair Housing rule and the reserved questions are NOT in the bank', () => {
    const { system, user } = buildPrompt({ address: '1 Main St', city: 'Duluth', state: 'GA' });
    expect(system).toContain('FAIR HOUSING');
    expect(system).toContain('- logistics.turn [street;');
    expect(system).not.toContain('people.demographics');
    expect(system).not.toContain('identity.first');
    expect(user).toContain('"address": "1 Main St"');
  });
});
