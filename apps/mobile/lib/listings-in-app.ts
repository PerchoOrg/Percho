/**
 * Whether this build shows home listings at all.
 *
 * Off for v1.0 (owner, 2026-10-24 — DEVLOG phase308): the first App Store
 * release is communities only, and FMLS listings arrive in a later version
 * that goes through App Review with them switched on. A build constant, not a
 * server switch, for two reasons:
 *
 * - App Review Guideline 2.3.1: no hidden or dormant features. A v1.0 binary
 *   that a server flag could later turn into a home-search app is exactly that.
 * - The FMLS agreement's Appendix A names only https://www.percho.co/ as the
 *   Vendor System. The app may not show FMLS data until a signed amendment
 *   adds it.
 *
 * Off means two things. Every listing-bearing request asks the server for no
 * listings (`listings=0`, see `lib/api/base.ts`), so no listing row and no
 * listing photo reaches the phone — the trade-off doors were built from those
 * photos. And every listing surface is hidden or redirected, so a save, a deep
 * link or a recent-strip entry left by an earlier build cannot open one.
 */
export const LISTINGS_IN_APP = false;

/**
 * Test homes (phase404.4), for a development bundle only.
 *
 * Owner, 2026-11-26: 「如果需要房子视频 你找之前的素材测试 不要在正式ios里显示就行
 * 只测试」. The step from a neighbourhood to its homes cannot be tried without
 * homes, and there are none to show until the FMLS feed is live — so a dev
 * bundle started with `EXPO_PUBLIC_TEST_HOMES=1` lets the six FMLS test
 * listings' films stand in for whichever neighbourhood is liked
 * (`lib/feed/test-homes.ts`).
 *
 * `__DEV__` is false in every release bundle — a TestFlight or App Store
 * build cannot turn this on whatever its environment says — so the reasons
 * `LISTINGS_IN_APP` is a constant hold here too. It opens the listing page and
 * nothing else: Search, Saved and You stay as the store build has them.
 */
export const TEST_HOMES =
	typeof __DEV__ !== "undefined" &&
	__DEV__ &&
	process.env.EXPO_PUBLIC_TEST_HOMES === "1";
