import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  communityProfileResearchSchema,
  communityProfileSchema,
  parseCommunityProfile,
} from '../community-profile';

const dir = join(__dirname, '../../../../../scripts/admin/community-profiles');
const read = (file: string): unknown => JSON.parse(readFileSync(join(dir, file), 'utf8'));
const windward = read('windward.json') as Record<string, unknown>;

describe('community profile', () => {
  it.each(readdirSync(dir).filter((f) => f.endsWith('.json')))('%s is valid research', (file) => {
    const parsed = communityProfileResearchSchema.safeParse(read(file));
    expect(parsed.success ? [] : parsed.error.issues).toEqual([]);
  });

  it('windward is a whole profile on its own', () => {
    const parsed = communityProfileSchema.safeParse(windward);
    expect(parsed.success ? [] : parsed.error.issues).toEqual([]);
  });

  it('is null for an empty column or a document that no longer fits', () => {
    expect(parseCommunityProfile(null)).toBeNull();
    expect(parseCommunityProfile({ asOf: '2026-11-15' })).toBeNull();
  });

  it('refuses a verdict line too long for half a phone', () => {
    const long = {
      ...windward,
      verdict: { good: ['Elementary schools ranked in the top six'], watch: [] },
    };
    expect(parseCommunityProfile(long)).toBeNull();
  });

  it('refuses a link that is not https, and an event that ends before it starts', () => {
    expect(
      parseCommunityProfile({ ...windward, links: [{ label: 'Site', url: 'http://example.com' }] }),
    ).toBeNull();
    expect(
      parseCommunityProfile({
        ...windward,
        events: [{ date: '2026-12-04', until: '2026-12-01', title: 'Lights', where: 'Loop' }],
      }),
    ).toBeNull();
  });

  it('carries no income, safety or crime key', () => {
    expect(JSON.stringify(windward)).not.toMatch(/income|crime|safety/i);
  });
});
