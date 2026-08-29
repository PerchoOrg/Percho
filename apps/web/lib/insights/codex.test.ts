import { describe, expect, it } from 'vitest';
import { parseCodexStderr } from './codex';

describe('parseCodexStderr', () => {
  it('counts web searches and reads the token total', () => {
    const err = [
      'OpenAI Codex v0.147.0',
      'model: gpt-5.6-sol',
      'web search: "2895 Shurburne Drive" Alpharetta ...',
      'web search: ',
      'web search: site:roswellgov.com Shurburne ...',
      'codex',
      '{"cards":[]}',
      'tokens used',
      '129,942',
    ].join('\n');
    expect(parseCodexStderr(err)).toEqual({ searches: 3, tokens: 129942 });
  });

  it('is honest about missing counters', () => {
    expect(parseCodexStderr('nothing here')).toEqual({ searches: 0, tokens: null });
  });
});
