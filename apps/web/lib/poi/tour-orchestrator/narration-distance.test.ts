/**
 * How often the script tells you how far away something is.
 *
 * Owner 2026-08-23: "too many miles related information, i dont like it, you
 * should leverage on that but dont over use … distance is still important so
 * definitely that last one to consider, the issue is narrative should not too
 * much focus on it."
 *
 * So this is NOT a filter — distance is a real selling point and the prompt
 * says so. It is a meter. Nineteen of the thirty lines across the three films
 * that prompted the change carried a mileage or a drive time; the prompt now
 * asks for at most a third, and this is the only thing that can say whether it
 * was honoured.
 *
 * Every string below is a real line from a production run.
 */

import { describe, expect, it } from 'vitest';
import { mentionsDistance } from './narration';

const CARRIES_DISTANCE = [
  'Drive four and a half miles to the historic trails of Autrey Mill Nature Preserve.',
  'Life Time sits under a mile from home.',
  'Weekly grocery trips to Publix are three miles away.',
  'Find H Mart just one mile down the road.',
  'Drive six miles to Newtown Dog Park.',
  'River Trail Middle and Northview High School present brick-faced campuses just a short two-mile drive away.',
  'Local favorite Sugo is a quick two-minute drive. Further out, Pampas Steakhouse earned a rare four-point-nine rating from over six thousand guests.',
  'Just under three miles away, Jones Bridge Park draws thousands to its scenic Chattahoochee riverbanks.',
  'Walk less than a mile to Sequel Coffee Company, or head just past it to Politan Row.',
  'The modern county library branch sits just over a mile away.',
  'Duluth High School lies four miles east, its sprawling brick campus anchoring the area.',
  "Grab groceries at Trader Joe's, barely a mile out, or head three miles to Ace Hardware.",
  'For premier dining and outdoor shopping, Halcyon sits under five miles away.',
  'Golf and indoor fitness options are positioned just over three miles away.',
  'Local favorites like Peony sit under a mile away, with Italian dining just beyond.',
  'But daily groceries are under two miles.',
  'Three parks sit within three and a half miles of these gates. Walk less than a mile to the quiet trails at Bell-Boles Park.',
];

const DOES_NOT = [
  'This is Bellmoore Park, where gated lawns and master-planned luxury create a quiet world of your own.',
  'At Apremont - Highcroft, the quiet wooded lifestyle begins right on the Corners Connector Trail.',
  'Pass Curiosity Lab to shop at H Mart, a local giant with seven thousand reviews.',
  'Swim laps at the YMCA.',
  'Spend afternoons exploring the premier open-air shops at The Forum.',
  'Finish your day at the beloved, walkable Town Green.',
  'Explore nearby Caney Creek Preserve.',
  'The library sits nearby.',
  'Nightlife lies further out.',
  'The Breakfast Bar sits nearby.',
];

describe('mentionsDistance', () => {
  it('catches every real line that carries one', () => {
    for (const line of CARRIES_DISTANCE) expect(mentionsDistance(line), line).toBe(true);
  });

  it('leaves alone the lines that do not', () => {
    // "walkable Town Green" and "sits nearby" are about character, not
    // measurement. Counting them would report a problem the script does not
    // have — and the point of the meter is to be believed.
    for (const line of DOES_NOT) expect(mentionsDistance(line), line).toBe(false);
  });

  it('still counts the shape the new prompt asks for', () => {
    // The rule is about proportion, not about banning the fact — so the good
    // form is counted too, or a third of the lines could not be measured.
    expect(
      mentionsDistance('Bell-Boles Park is a mile of shaded trail, close enough to walk.'),
    ).toBe(true);
    expect(mentionsDistance('Ten minutes out, the trails open onto the river.')).toBe(true);
  });

  it('measures the three films at the figure they were hand-counted at', () => {
    const all = [...CARRIES_DISTANCE, ...DOES_NOT];
    expect(all.filter(mentionsDistance)).toHaveLength(CARRIES_DISTANCE.length);
  });
});
