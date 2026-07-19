import { extractJsonObject } from '@/lib/ai/anthropic';
import { describe, expect, it } from 'vitest';

function parse(raw: string): unknown {
  const s = extractJsonObject(raw);
  if (s === null) throw new Error('extractJsonObject returned null');
  return JSON.parse(s);
}

describe('extractJsonObject', () => {
  it('returns plain JSON unchanged', () => {
    expect(parse('{"a":1,"b":"x"}')).toEqual({ a: 1, b: 'x' });
  });

  it('strips ```json fences', () => {
    expect(parse('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('handles missing closing fence (the failure mode we hit in prod)', () => {
    expect(parse('```json\n{"facebook":"hi","instagram":"yo"}')).toEqual({
      facebook: 'hi',
      instagram: 'yo',
    });
  });

  it('handles pre/post chatter', () => {
    expect(parse('Sure! Here\'s the JSON:\n```json\n{"a":1}\n```\nHope it helps!')).toEqual({
      a: 1,
    });
  });

  it('respects nested braces', () => {
    expect(parse('{"a":{"b":2},"c":3}')).toEqual({ a: { b: 2 }, c: 3 });
  });

  it('respects braces inside strings', () => {
    expect(parse('{"msg":"hello {world}","n":1}')).toEqual({
      msg: 'hello {world}',
      n: 1,
    });
  });

  it('respects escaped quotes inside strings', () => {
    expect(parse('{"msg":"she said \\"hi\\"","n":1}')).toEqual({
      msg: 'she said "hi"',
      n: 1,
    });
  });

  it('returns null when no object present', () => {
    expect(extractJsonObject('no json here')).toBeNull();
  });
});
