/**
 * The four things a resident rates, and what each is called on screen.
 *
 * Split out of `reviews.ts` in phase261, and not as tidying: that module opens
 * with `import { supabase }`, which reaches `lib/supabase.ts` and through it
 * `react-native-url-polyfill/auto`. So these four strings — pure data, no
 * runtime — could not be read by anything in the pure-TS vitest suite (see
 * `vitest.config.ts`: "Keep RN-dependent code out of this include glob").
 *
 * `compare-communities.ts` is what found it. The alternatives were both worse:
 * copying the label table into the compare would have been a second source of
 * truth for what "friendly" is called, and mocking Supabase in the test of a
 * pure table builder would have made the test lie about what the module needs.
 *
 * Mirrors `apps/web/lib/communities/reviews.ts` — keep the keys in step; the
 * server drops any dimension it does not know.
 */

export const REVIEW_DIMENSIONS = [
	"quiet",
	"walkable",
	"friendly",
	"value",
] as const;

export type ReviewDimension = (typeof REVIEW_DIMENSIONS)[number];

export const REVIEW_DIMENSION_LABELS: Record<ReviewDimension, string> = {
	quiet: "Quiet",
	walkable: "Walkable",
	friendly: "Neighbourly",
	value: "Value",
};
