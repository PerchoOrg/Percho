/**
 * Events are excluded as a subject, and that is also what closes the hole the
 * religious-content filter cannot reach — see isEventPhoto's doc comment.
 */

import { describe, expect, it } from 'vitest';
import { isEventPhoto } from './shots';

describe('isEventPhoto', () => {
  it('catches the gymnasium event that survived the religious filter', () => {
    expect(
      isEventPhoto({
        description:
          'Interior of a school gymnasium during an organized cultural event with many attendees.',
        tags: ['school', 'community-event', 'gymnasium', 'cultural-gathering'],
      }),
    ).toBe(true);
  });

  it('catches it from the tags when the description is bland', () => {
    expect(isEventPhoto({ description: 'A large hall', tags: ['parade'] })).toBe(true);
  });

  it('keeps an ordinary photo of the same building', () => {
    expect(
      isEventPhoto({
        description: 'Exterior facade of Riverwatch Middle School with the flagpole and entrance.',
        tags: ['school', 'exterior', 'daytime'],
      }),
    ).toBe(false);
  });

  it('keeps a photo with incidental people, which the owner asked for', () => {
    expect(
      isEventPhoto({
        description: 'A shaded walking trail with two people walking a dog.',
        tags: ['trail', 'nature', 'walking'],
      }),
    ).toBe(false);
  });

  it('is false for an empty annotation rather than throwing', () => {
    expect(isEventPhoto({})).toBe(false);
    expect(isEventPhoto({ description: null, tags: null })).toBe(false);
  });
});
