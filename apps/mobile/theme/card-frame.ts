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
 * This module is deliberately react-native-free so `theme/listing-layout.test.ts`
 * can compute the real card height from it (the mobile vitest suite imports no
 * RN runtime — see `vitest.config.ts`).
 */
export const CARD_FRAME_RATIO = 0.73;
