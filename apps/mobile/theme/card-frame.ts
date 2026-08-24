/**
 * The swipe feed's ONE card frame height, as a share of the fixed stage.
 *
 * Owner, 2026-08-17: every card kind is the same box. Before this there were
 * three heights — listing 0.95, trade-off 0.62, and area/community sized to
 * `width × 1.2` — so an alternating deck cross-faded the frame height on every
 * commit and the page visibly jumped.
 *
 * 0.78 was the midpoint of the two heights it replaced (0.62 and 0.95 → 0.785,
 * rounded down for a hair more paper): taller than the old trade-off card,
 * shorter than the old listing card, and never the ~2:1 portrait the 0.95
 * listing frame drew on a tall phone.
 *
 * 0.73 since 2026-08-17 (owner: shrink the frame another ~5–8%). The same pass
 * deleted a row from every kind — the city card's vibe line, the listing card's
 * tag pills and hairline — so the shorter frame is not a squeeze: each card
 * carries less content in it than the 0.78 frame did. −6.4% off the height,
 * which on an iPhone SE is ~24pt of paper back around the deck.
 *
 * It is a fraction of the STAGE, not of the card's width, on purpose: the stage
 * is the same box for every card (see `SwipeStack`), so a fixed fraction of it
 * is the only way every kind lands on exactly the same rectangle on every
 * device. A width-derived aspect (what area/community used) does not — it
 * drifts against the stage as the screen gets taller.
 *
 * 0.83 since 2026-08-23 (owner: the cards read small, with spare room around
 * them). This number is NOT a free choice — it is paired with the feed's
 * `GUTTER` of 16 to hold the card's ASPECT where it already was.
 *
 * The card plays its tour with `fit="cover"` against a 1080x1576 canvas
 * (aspect 0.685), so the card's own aspect is what decides how much of the
 * video gets cropped. At 0.73/37 the card measured 0.682-0.693 across the
 * fleet; at 0.83/16 it measures 0.672-0.689 — the same frame, so the crop is
 * unchanged and only the size moved. Widening the card WITHOUT raising this
 * ratio is the thing to avoid: it would push the aspect toward 0.79 and start
 * eating the video's height, which is the whole reason the canvas is 0.685 and
 * not 9:16 in the first place.
 *
 * Leaves ~107pt of stage slack on an iPhone 15 (was ~170), i.e. the card still
 * floats on paper rather than filling the stage.
 *
 * This module is deliberately react-native-free so `theme/listing-layout.test.ts`
 * can compute the real card height from it (the mobile vitest suite imports no
 * RN runtime — see `vitest.config.ts`).
 */
export const CARD_FRAME_RATIO = 0.83;
