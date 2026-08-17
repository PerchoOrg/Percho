import { describe, expect, it } from 'vitest';
import { GOLDEN_ANNOTATIONS, GOLDEN_PHOTOS } from './fixtures/peachtree-corners';
import { guardClips } from './guard';
import { scheduleClips } from './scheduler';
import {
  BANNED_WORDS,
  CLAUSE_NO_PEOPLE,
  CLAUSE_RIGID_GEOMETRY,
  CLAUSE_SIGNAGE,
  SEEDANCE_CAMERA,
  SeedancePromptError,
  buildSeedancePrompt,
  genericScene,
  seedanceSeed,
} from './seedance-prompt';

const base = {
  photoId: 'c0579670-304f-46b8-9c56-8700d9b6bf12',
  poiName: 'Corners Connector Trail',
  description: 'A tranquil view of a lake surrounded by dense green forest.',
  motionHint: 'ripples across the lake',
  dominantSubject: 'nature' as const,
  move: 'camera_fixed',
  constraints: [CLAUSE_NO_PEOPLE, CLAUSE_SIGNAGE],
};

describe('buildSeedancePrompt', () => {
  it('assembles scene, motion, camera and constraints in that order', () => {
    const prompt = buildSeedancePrompt(base);
    expect(prompt).toContain('lake surrounded by dense green forest');
    expect(prompt).toContain('The only movement is ripples across the lake');
    expect(prompt).toContain(SEEDANCE_CAMERA.camera_fixed);
    expect(prompt.endsWith(CLAUSE_SIGNAGE)).toBe(true);
    expect(prompt.indexOf(CLAUSE_NO_PEOPLE)).toBeGreaterThan(
      prompt.indexOf(SEEDANCE_CAMERA.camera_fixed!),
    );
  });

  it('refuses a prompt with no signage clause', () => {
    expect(() => buildSeedancePrompt({ ...base, constraints: [CLAUSE_NO_PEOPLE] })).toThrow(
      SeedancePromptError,
    );
  });

  it('refuses a prompt without exactly one people clause', () => {
    expect(() => buildSeedancePrompt({ ...base, constraints: [CLAUSE_SIGNAGE] })).toThrow(
      /people clause/,
    );
  });

  it('refuses an unknown clause or an unknown move', () => {
    expect(() =>
      buildSeedancePrompt({ ...base, constraints: [...base.constraints, 'Keep it pretty.'] }),
    ).toThrow(/unknown constraint/);
    expect(() => buildSeedancePrompt({ ...base, move: 'barrel_roll' })).toThrow(/camera clause/);
  });

  it('throws when a banned word reaches the prompt', () => {
    for (const word of BANNED_WORDS) {
      expect(() => buildSeedancePrompt({ ...base, motionHint: `${word} moving water` })).toThrow(
        /banned word/,
      );
    }
  });

  it('keeps the mandatory clauses byte-identical', () => {
    const prompt = buildSeedancePrompt({
      ...base,
      constraints: [CLAUSE_NO_PEOPLE, CLAUSE_RIGID_GEOMETRY, CLAUSE_SIGNAGE],
    });
    expect(prompt).toContain('No people appear in the frame.');
    expect(prompt).toContain(
      'Straight lines and repeating structures stay straight and evenly spaced.',
    );
    expect(prompt).toContain('Storefront signage stays unchanged.');
  });
});

describe('genericScene', () => {
  it('drops the POI name, possessive included', () => {
    expect(
      genericScene(
        "Norcross High School's Blue Devil Stadium, including the track.",
        'Norcross High School',
      ),
    ).toBe('Blue Devil Stadium, including the track.');
    expect(
      genericScene(
        'A lake surrounded by forest, part of the Corners Connector Trail.',
        'Corners Connector Trail',
      ),
    ).toBe('A lake surrounded by forest.');
  });

  it('scrubs banned words that came in with the tagger prose', () => {
    expect(genericScene('A dramatic view of a dynamic plaza.', 'Plaza')).not.toMatch(
      /dramatic|dynamic/i,
    );
  });

  it('never returns an empty scene', () => {
    expect(genericScene("Trader Joe's", "Trader Joe's")).toBe('The scene in the frame.');
  });
});

describe('seedanceSeed', () => {
  it('is stable per photo and differs across photos', () => {
    expect(seedanceSeed('abc')).toBe(seedanceSeed('abc'));
    expect(seedanceSeed('abc')).not.toBe(seedanceSeed('abd'));
    expect(seedanceSeed('abc')).toBeGreaterThanOrEqual(0);
  });
});

describe('every Seedance prompt in the golden plan', () => {
  it('builds, carries its clauses, and has no banned word', () => {
    const { clips } = guardClips(
      scheduleClips(GOLDEN_ANNOTATIONS, GOLDEN_PHOTOS).clips,
      GOLDEN_ANNOTATIONS,
      GOLDEN_PHOTOS,
    );
    const seedance = clips.filter((c) => c.engine === 'seedance');
    expect(seedance.length).toBeGreaterThan(0);
    for (const c of seedance) {
      expect(c.prompt).toBeTruthy();
      for (const clause of c.constraints) expect(c.prompt).toContain(clause);
      for (const word of BANNED_WORDS) {
        expect(c.prompt!.toLowerCase()).not.toContain(word);
      }
      expect(Object.keys(SEEDANCE_CAMERA)).toContain(c.move);
    }
  });
});
