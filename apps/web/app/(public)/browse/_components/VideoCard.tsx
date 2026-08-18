'use client';
import { hlsUrl, thumbnailUrl } from '@/lib/cloudflare/stream';
import { type BrowseCard, type Source, pickVideo } from '@/lib/feed/browse-card';
import Hls from 'hls.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PlayIcon } from '../../_components/feed/icons';
import { CaptionCard } from './CaptionCard';

interface CardProps {
  card: BrowseCard;
  source: Source;
  cycleIdx: number;
  shouldMount: boolean;
  isActive: boolean;
  cardRef: (el: HTMLElement | null) => void;
  setPaused: (b: boolean) => void;
  onSwipe: (delta: 1 | -1) => void;
  poolSize: number;
  /** Global mute state from parent feed — propagated to <video> on every render. */
  muted: boolean;
  /** Called if the browser blocks autoplay-with-sound and we fall back to muted. */
  onAutoplayBlocked?: () => void;
}

export function VideoCard({
  card,
  source,
  cycleIdx,
  shouldMount,
  isActive,
  cardRef,
  setPaused,
  onSwipe,
  poolSize,
  muted,
  onAutoplayBlocked,
}: CardProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // in-page fullscreen for the landscape variant.
  // Only exposed when the current selection carries a `cfVideoIdLandscape`
  // (populated by the render worker for listings whose photos are ≥80%
  // horizontal). Toggling flips the container to `fixed inset-0 z-[9999]`
  // and swaps the HLS source to the landscape uid — same BGM, same
  // Ken-Burns pass, just letterbox-free horizontal composition.
  //
  // Custom in-page fullscreen (not the native Fullscreen API) because
  // iOS Safari's `webkitEnterFullscreen` on <video> tears down the src
  // and re-attaches at a fixed player, which breaks HLS.js and the
  // src-swap trick we depend on. A plain overlay div works everywhere.
  const [isFullscreen, setIsFullscreen] = useState(false);

  // measure the actual `<section>` element's
  // bounding rect instead of window.innerWidth/innerHeight. On iPhone Plus /
  // Pro Max models (428×926), `window.innerHeight` reports the *small*
  // viewport (~781, URL bar visible) while `fixed inset-0` extends into the
  // *layout* viewport (~926 with URL bar hidden). Sizing the rotate-90 box
  // against innerHeight left ~30% black at top+bottom on those phones.
  //
  // Reading the section's live rect via ResizeObserver captures whatever
  // `fixed inset-0` actually resolves to on the current device — no phone
  // hardcoding, no viewport-model guessing. Also listens to
  // window.visualViewport `resize` so URL-bar collapse expansions repaint.
  //
  // 71.14/71.15 history: dvw/dvh (Tailwind arbitrary) was emitted but
  // fallback-substituted; raw px innerWidth/innerHeight was correct on
  // 393×852 devices but wrong on 428×926 due to the small/layout viewport
  // gap above.
  const sectionRef = useRef<HTMLElement | null>(null);
  const [vp, setVp] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  useEffect(() => {
    if (!isFullscreen) return;
    // measure the VIEWPORT, not sectionRef.
    // sectionRef is the feed <section> which keeps its non-fullscreen
    // layout even when the fullscreen `fixed inset-0 z-[9999]` overlay
    // is on top. Measuring section on the isFullscreen effect fired
    // AFTER the tap handler's sync setVp(window inner{Width,Height}),
    // overwriting the correct viewport dims with the smaller section
    // dims → user saw "big → small → big" as ResizeObserver later
    // resettled. window.innerWidth/Height matches the fullscreen
    // container's actual size (fixed inset-0), matches the tap
    // handler, single source of truth.
    function measure() {
      setVp({ w: window.innerWidth, h: window.innerHeight });
    }
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      vv?.removeEventListener('resize', measure);
    };
  }, [isFullscreen]);

  // ESC exits fullscreen — desktop keyboards and iPad Magic Keyboards.
  useEffect(() => {
    if (!isFullscreen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsFullscreen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen]);

  const sel = useMemo(() => pickVideo(card, source, cycleIdx), [card, source, cycleIdx]);

  // local `domPaused` state driven by rAF poll of
  // `videoRef.current.paused`. Play glyph binds to this local state, not the
  // parent-owned `paused` prop. Reason 71.25 didn't fix it: rAF was calling
  // parent's `setPaused` with a value that closes over stale `paused` prop
  // (React doesn't re-invoke the effect between prop syncs), so the parent
  // ping-pong never converged. Local state is authoritative and re-renders
  // only this card.
  const [domPaused, setDomPaused] = useState<boolean>(true);
  useEffect(() => {
    if (!shouldMount) return;
    let raf = 0;
    function tick() {
      const v = videoRef.current;
      if (v) setDomPaused(v.paused);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [shouldMount]);

  // poster-attribute anti-pattern (skill ref §1).
  // Symptom: on first swipe to a card, iOS Safari flashes the <video>
  // poster with the system big-play-button overlay for ~200-500ms before
  // the video actually starts. Root cause: `<video poster=…>` renders
  // that placeholder until `.play()` is called, and the browser's HLS
  // pipeline needs 200-500ms to decode the first segment before the
  // real frame paints. The CommunityCarousel already fixed this in 74.3
  // via an <img> overlay + hasFirstFrame gate; BrowseFeed drifted.
  //
  // Fix: kill the `poster=` attribute, render the thumbnail as an
  // absolute <img> overlay while !hasFirstFrame, reveal the <video>
  // via opacity on `playing` / `loadeddata`. Reset the flag on src swap.
  const [hasFirstFrame, setHasFirstFrame] = useState(false);

  // pick the effective CF uid based on fullscreen state.
  // `cfVideoIdLandscape` is optional; fullscreen is only enterable when set.
  const hasLandscape = !!sel.cfVideoIdLandscape;
  // use landscape uid whenever available, in
  // BOTH the vertical feed and fullscreen. This is the fundamental
  // architectural fix that makes 74.13-74.16's cascade of overlays and
  // gates unnecessary. Owner report:「刚才修的是横滑的问题 竖滑也会有
  // 黑屏 很快闪现一个小视频带播放键的页面」— that was the iOS Safari
  // native `<video poster>` big-play-button flashing during the
  // portrait→landscape HLS src swap on tap. By using landscape uid
  // from the moment the card mounts, tapping fullscreen does NOT
  // re-attach HLS (effectiveCfId doesn't change), so there is no
  // src-swap window, no black frame, no poster flash, no overlays
  // needed. The feed shows the landscape video with `object-contain`
  // (letterbox top/bottom is acceptable per phase65 rule); fullscreen
  // just rotates + sizes the same <video> element to fill the
  // horizontal viewport. Owner: "有没有可能就一个横屏视频 竖屏播放
  // 就上下空着保证视频质量,如果是横屏播放就全屏,因为本身就是横屏视频,
  // 这样不用多个视频 节省成本 避免黑屏".
  const effectiveCfId = sel.cfVideoIdLandscape ?? sel.cfVideoId;

  // /71.14: aggressively play on fullscreen. iOS Safari native
  // HLS (Apple HLS via <video src>) reloads the media pipeline on src
  // change; the play() call from the shared effect (line ~660) can race
  // and silently no-op. Retry on multiple lifecycle events, muted (which
  // always satisfies autoplay policy under playsInline).
  //
  // stop retrying once we've observed a play/
  // playing event, and abort if user pauses. Previously canplay/loadeddata
  // kept firing during playback → racing with user's tap-to-pause: the
  // audio track would resume but the video texture stayed frozen.
  useEffect(() => {
    if (!isFullscreen) return;
    const v = videoRef.current;
    if (!v) return;
    let cancelled = false;
    let started = false;
    let attempts = 0;
    function markStarted() {
      started = true;
    }
    function tryPlay() {
      if (cancelled || started || !v || attempts > 6) return;
      // If user has actively paused, do NOT force-resume.
      if (v.paused && attempts > 0 && v.currentTime > 0) return;
      attempts += 1;
      v.muted = true;
      const p = v.play();
      if (p && typeof p.then === 'function') {
        p.then(() => setPaused(false)).catch(() => {});
      }
    }
    tryPlay();
    v.addEventListener('loadedmetadata', tryPlay);
    v.addEventListener('canplay', tryPlay);
    v.addEventListener('loadeddata', tryPlay);
    v.addEventListener('playing', markStarted);
    return () => {
      cancelled = true;
      v.removeEventListener('loadedmetadata', tryPlay);
      v.removeEventListener('canplay', tryPlay);
      v.removeEventListener('loadeddata', tryPlay);
      v.removeEventListener('playing', markStarted);
    };
  }, [isFullscreen, effectiveCfId, setPaused]);

  // sustained play retry after fullscreen enter.
  //
  // Diagnosis history:
  //   - 74.21: setTimeout(200) + `currentTime += 0.001` micro-seek — no effect
  //   - 74.22: double rAF + seek(-0.05) + 300ms fallback pause+play — no effect
  //   - 74.22 HUD proved `p=T` (paused=true) for the full 3s sample window
  //     with `ct=3.075` frozen and `r=4` (HAVE_ENOUGH_DATA). So decoder is
  //     ready and buffered, but every `.play()` we issue silently no-ops.
  //   - Meanwhile owner said "按两次才能播放". Turns out tap 1 landed on our
  //     own centre play glyph (74.20 gate `shouldMount && domPaused`),
  //     which mounted because domPaused stayed true throughout. See
  // BrowseFeed.tsx gate — glyph now hidden in fullscreen.
  //
  // With the glyph gone, we need play to actually start on its own. Since
  // one-shot `.play()` calls in the tap handler + one delayed kick both
  // no-op, the working theory is that iOS Safari's user activation from
  // the tap handler expires during the CSS rotate/layout commit window.
  // Solution: keep re-issuing `.play()` on a 200ms interval until either
  // `!v.paused` (success) or 5s elapse (giving up — user can tap the
  // video area to trigger native play as a last resort).
  useEffect(() => {
    if (!isFullscreen) return;
    const v = videoRef.current;
    if (!v) return;
    const t0 = performance.now();
    let iv = 0;
    const attempt = () => {
      if (!v.paused) {
        window.clearInterval(iv);
        return;
      }
      if (performance.now() - t0 > 5000) {
        window.clearInterval(iv);
        return;
      }
      const p = v.play();
      if (p && typeof p.then === 'function') {
        p.catch(() => {
          // Fallback: try muted. Autoplay policy allows muted play
          // without user gesture; the parent onAutoplayBlocked already
          // handles UI mute state elsewhere.
          if (!v.muted) {
            v.muted = true;
            void v.play().catch(() => {});
          }
        });
      }
    };
    // First attempt immediately (still inside the tap-handler activation
    // frame in most cases), then poll.
    attempt();
    iv = window.setInterval(attempt, 200);
    return () => {
      window.clearInterval(iv);
    };
  }, [isFullscreen]);

  const isExternal = !!sel.externalUrl;
  let poster: string | null = null;
  if (isExternal) {
    poster = card.heroPhotoUrl ?? null;
  } else {
    try {
      poster = thumbnailUrl(effectiveCfId);
    } catch {
      poster = null;
    }
  }

  // landscape poster URL for fullscreen preload +
  // overlay. When the card has a landscape companion, we compute the poster
  // for that separate uid too, independently of `effectiveCfId`. The
  // non-fullscreen render preloads it (hidden <link>/<img>) so the poster is
  // in cache the moment the user taps fullscreen — kills the "black frame"
  // gap while the landscape HLS pipeline re-attaches. The fullscreen branch
  // uses this in a rotated <img> overlay with objectFit: cover, because
  // native `<video poster>` letterboxes to the box's aspect (CSS
  // object-fit does NOT apply to the poster attribute on iOS Safari) —
  // that letterbox is what owner saw as "小图" in "黑屏 → 小图 → 大播放".
  let _landscapePoster: string | null = null;
  if (!isExternal && sel.cfVideoIdLandscape) {
    try {
      _landscapePoster = thumbnailUrl(sel.cfVideoIdLandscape);
    } catch {
      _landscapePoster = null;
    }
  }

  // (Re)attach HLS when mount or selected video changes.
  useEffect(() => {
    if (!shouldMount) return;
    const video = videoRef.current;
    if (!video) return;

    // hide <video> layer behind poster overlay until the
    // first real frame paints on this new src.
    setHasFirstFrame(false);

    // Tear down previous HLS attachment.
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    video.removeAttribute('src');
    video.load();

    // external mp4 path — set video.src directly, skip HLS.
    if (isExternal && sel.externalUrl) {
      video.src = sel.externalUrl;
      return () => {
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
      };
    }

    let src: string;
    try {
      src = hlsUrl(effectiveCfId);
    } catch {
      return;
    }

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
    } else if (Hls.isSupported()) {
      // capLevelToPlayerSize:false → don't cap quality to the player's pixel
      //   size (desktop letterbox renders smallish but we still want HD).
      // MANIFEST_PARSED → jump to the top level for first playback so users
      //   don't see the lowest-bitrate ladder rung. ABR can still downgrade
      //   on real network pressure afterwards.
      const hls = new Hls({
        maxBufferLength: 20,
        maxMaxBufferLength: 30,
        capLevelToPlayerSize: false,
      });
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (hls.levels.length > 0) {
          hls.nextLevel = hls.levels.length - 1;
        }
      });
      hls.loadSource(src);
      hls.attachMedia(video);
      hlsRef.current = hls;
    } else {
      video.src = src;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [shouldMount, effectiveCfId, sel.externalUrl, isExternal]);

  // Play/pause on active changes.
  // Try with current mute state first; if browser blocks autoplay-with-sound
  // (no sticky activation), fall back to muted and signal parent to flip
  // the global mute state so the Sound button reflects reality.
  // re-run when effectiveCfId flips too — entering
  // fullscreen swaps the HLS source to the landscape uid; without this the
  // <video> stays paused after the src attach and the centre play glyph
  // sticks around.
  // biome-ignore lint/correctness/useExhaustiveDependencies: effectiveCfId triggers replay after source switch
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isActive && shouldMount) {
      v.muted = muted;
      v.play()
        .then(() => setPaused(false))
        .catch(() => {
          // Autoplay-with-sound was blocked. Retry muted — this always works.
          if (!v.muted) {
            v.muted = true;
            onAutoplayBlocked?.();
            v.play()
              .then(() => setPaused(false))
              .catch(() => setPaused(true));
          } else {
            setPaused(true);
          }
        });
    } else {
      v.pause();
      setPaused(true);
    }
  }, [isActive, shouldMount, setPaused, effectiveCfId, sel.externalUrl]);

  // Keep <video>.muted in sync with the global mute toggle while the card
  // is mounted (parent flips it from the Sound button).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted;
  }, [muted]);

  // keep React `paused` state in sync with the
  // actual <video> pause/play events. Previously we only set paused via
  // `.play()` / `.pause()` promise callbacks, which missed cases where
  // iOS Safari internally paused the media (buffer stall, src-swap
  // reload) — audio continued but UI showed play glyph, or vice versa.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    function onPlay() {
      setPaused(false);
    }
    function onPause() {
      setPaused(true);
    }
    v.addEventListener('play', onPlay);
    v.addEventListener('playing', onPlay);
    v.addEventListener('pause', onPause);
    return () => {
      v.removeEventListener('play', onPlay);
      v.removeEventListener('playing', onPlay);
      v.removeEventListener('pause', onPause);
    };
  }, [setPaused, shouldMount]);

  // reveal <video> layer only after the first
  // real frame paints. `playing` fires post-decode+composite; `loadeddata`
  // is a defensive fallback for paused-preload siblings.
  useEffect(() => {
    if (!shouldMount) return;
    const v = videoRef.current;
    if (!v) return;
    const reveal = () => setHasFirstFrame(true);
    v.addEventListener('playing', reveal);
    v.addEventListener('loadeddata', reveal);
    return () => {
      v.removeEventListener('playing', reveal);
      v.removeEventListener('loadeddata', reveal);
    };
  }, [shouldMount, effectiveCfId]);

  const onTap = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      // restore audio state that 71.22 zeroed on last pause.
      // Without this, resuming plays silent.
      try {
        v.volume = 1;
      } catch {}
      v.muted = muted;
      const p = v.play();
      if (p && typeof p.then === 'function') {
        p.then(() => setPaused(false)).catch(() => {});
      } else {
        setPaused(false);
      }
    } else {
      // `v.pause()` alone doesn't stop audio on iOS Safari when
      // HLS.js is driving the media pipeline — the audio buffer keeps
      // flushing. Belt-and-suspenders: pause + mute + zero-volume every
      // <video> on the page. Any element (current or preloaded neighbor)
      // that was still emitting sound goes silent. `onTap` play branch
      // above restores volume/muted on resume.
      try {
        const all = Array.from(document.querySelectorAll('video')) as HTMLVideoElement[];
        for (const av of all) {
          try {
            av.pause();
          } catch {}
          try {
            av.muted = true;
          } catch {}
          try {
            av.volume = 0;
          } catch {}
        }
      } catch {}
      setPaused(true);
    }
  };

  return (
    <section
      ref={(el) => {
        cardRef(el);
        sectionRef.current = el;
      }}
      // hoist `touch-none` from the inner div to the
      // <section> root in Nearby mode. `touch-action` is NOT inherited — it's
      // resolved per-element by the browser. With it only on the inner div,
      // touches that landed on the <video> element (its default
      // `touch-action: auto` wins) leaked vertical pans to the outer snap-y
      // scroller and skipped to the next listing — exactly the bug the
      // 28.1 commit thought it had fixed. Putting it on the section means
      // the entire subtree (video + img poster + overlays) opts out of
      // native scrolling while in Nearby mode, so the JS swipe handler
      // owns vertical gestures uncontested.
      className={`${isFullscreen ? 'fixed inset-0 z-[9999]' : 'relative h-[100dvh] w-full snap-start snap-always'} overflow-hidden bg-black ${source === 'nearby' ? 'touch-none' : ''}`}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: tap-to-play */}
      <div
        // Hero mode keeps `touch-pan-y` so vertical pans pass through to the
        // snap-y listing scroller, and only horizontal swipes (heroVideos
        // pool) are intercepted here. Nearby's `touch-none` lives on the
        // section above (see comment).
        className={`absolute inset-0 ${source === 'nearby' ? '' : 'touch-pan-y'}`}
        onClick={onTap}
        onTouchStart={(e) => {
          if (e.touches.length !== 1) return;
          const t = e.touches[0];
          if (t) touchStartRef.current = { x: t.clientX, y: t.clientY };
        }}
        onTouchEnd={(e) => {
          const start = touchStartRef.current;
          touchStartRef.current = null;
          if (!start) return;
          const t = e.changedTouches[0];
          if (!t) return;
          const dx = t.clientX - start.x;
          const dy = t.clientY - start.y;
          if (source === 'nearby') {
            // Vertical swipe cycles within the nearby pool — same gesture as
            // moving between listings, so the pool feels like a feed.
            if (Math.abs(dy) > 50 && Math.abs(dy) > Math.abs(dx) * 1.5) {
              e.preventDefault();
              e.stopPropagation();
              onSwipe(dy < 0 ? 1 : -1);
            }
            return;
          }
          // Hero: horizontal swipe cycles heroVideos (when present); vertical
          // pans fall through to the outer snap scroller for next listing.
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            e.preventDefault();
            e.stopPropagation();
            onSwipe(dx < 0 ? 1 : -1);
          }
        }}
      >
        {/* Desktop blurred backdrop — Douyin-style. Fills the letterbox
         * gutters on md+ where the video is object-contain (9:16 inside 16:9).
         * Uses the poster as a still backdrop (zero extra bandwidth: poster
         * is already loaded by the <video> tag below). Hidden on mobile where
         * object-cover already fills the viewport. */}
        {poster && (
          <img
            src={poster}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 hidden h-full w-full scale-110 object-cover opacity-60 blur-2xl md:block"
          />
        )}
        {shouldMount ? (
          <>
            <video
              ref={videoRef}
              // NO native poster attribute
              // on any branch. Skill §1 canonical (iOS Safari) — the
              // poster attribute renders the native big-play-button
              // synchronously on <video> mount. The 74.7 <img> overlay
              // below (gated on !hasFirstFrame) covers the vertical-feed
              // first-swipe gap in a way iOS actually respects. Since
              // 74.17 uses landscape uid in BOTH feed and fullscreen,
              // fullscreen tap does NOT re-attach HLS, so no separate
              // fullscreen poster/overlay machinery is needed.
              poster={undefined}
              style={
                // rotate-90 fullscreen — measure the visual
                // viewport in JS and set width/height as raw pixels. Setting
                // `width = viewportHeight` and `height = viewportWidth`
                // BEFORE rotate-90 means after the CSS rotate lands the box
                // occupies exactly viewportWidth × viewportHeight — zero
                // black bars on any phone aspect ratio.
                isFullscreen && hasLandscape && vp.w > 0
                  ? {
                      position: 'fixed',
                      top: '50%',
                      left: '50%',
                      width: `${vp.h}px`,
                      height: `${vp.w}px`,
                      // Tailwind Preflight injects
                      // `img,video { max-width: 100%; height: auto; }` globally,
                      // which was clamping our 781×428 rotate box back down to
                      // the parent's 428px width — leaving a 428×428 <video>
                      // and ~20% top/bottom black bars after rotate. Explicit
                      // maxWidth/maxHeight/minWidth/minHeight none overrides
                      // Preflight so our JS-measured px sizes actually win.
                      maxWidth: 'none',
                      maxHeight: 'none',
                      minWidth: 0,
                      minHeight: 0,
                      transform: 'translate(-50%, -50%) rotate(90deg)',
                      objectFit: 'cover',
                      zIndex: 10000,
                      // video was intercepting taps because its
                      // `position:fixed` at zIndex 10000 sat above the parent
                      // div that owns onTap. `pointer-events: none` lets taps
                      // pass through to the transparent inner div below,
                      // which has onClick={onTap} for pause/play. The X and
                      // play glyph are separately positioned above with
                      // their own hit boxes so they still receive clicks.
                      pointerEvents: 'none',
                      // NO opacity gate in fullscreen. The
                      // gate was pointless here (video is already playing
                      // before entering fullscreen) and its interaction
                      // with poster overlay + rotate-90 was the root
                      // cause of every 74.8-74.12 regression.
                    }
                  : {
                      // opacity gate — video stays
                      // hidden behind the <img> poster overlay below until
                      // the first real frame paints. Only applied to the
                      // non-fullscreen branch (first-swipe portrait tile),
                      // which is the actual bug 74.7 was solving.
                      // asymmetric transition — smooth
                      // fade-in on first frame, instant on hide.
                      opacity: hasFirstFrame ? 1 : 0,
                      transition: hasFirstFrame ? 'opacity 150ms' : 'none',
                      // same Preflight override as
                      // the 71.19 fullscreen branch. Tailwind Preflight
                      // injects `video { max-width: 100%; height: auto }`
                      // globally, which beats our `h-full w-full` on
                      // landscape sources — a 1920×1080 video ends up
                      // rendered as a small 16:9 box centered inside the
                      // 9:19.5 viewport instead of letterboxing across
                      // the full viewport width. Explicit none/0
                      // overrides let the className sizing actually win.
                      // Portrait videos are unaffected (their height:auto
                      // already exceeds the viewport). Only relevant
                      // since put landscape videos directly in
                      // the vertical feed with object-contain.
                      maxWidth: 'none',
                      maxHeight: 'none',
                      minWidth: 0,
                      minHeight: 0,
                    }
              }
              className={
                isFullscreen && hasLandscape
                  ? // styles are inline (see `style`
                    // above). Keep className empty for the fullscreen branch
                    // to avoid Tailwind's arbitrary-vw/vh utilities racing
                    // with inline sizing.
                    ''
                  : 'relative h-full w-full object-contain'
              }
              playsInline
              muted
              loop
              preload="auto"
            />
            {/* (skill ref §1): poster overlay covers the <video>
             * until the first real frame paints. Only rendered in the
             * non-fullscreen branch — this is the bug 74.7 was solving
             * (vertical-feed first-swipe poster+play-button flash on iOS
             * Safari). In fullscreen, native `poster=` handles the src-swap
             * transition; no overlay needed (see 74.13 above). */}
            {poster && !hasFirstFrame && !isFullscreen && (
              <img
                src={poster}
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 h-full w-full bg-black object-contain"
              />
            )}
            {/* 74.14 rotated overlay + 74.14
             * hidden preload have both been REMOVED. Since 74.17 uses
             * the landscape uid in the vertical feed too, tapping
             * fullscreen no longer swaps HLS src, so there is no
             * black-frame gap to cover in fullscreen. The 74.7 <img>
             * overlay above still covers the vertical-feed first-swipe
             * mount gap for both landscape and portrait cards. */}
          </>
        ) : poster ? (
          <img src={poster} alt="" className="relative h-full w-full object-contain" />
        ) : null}
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/70 via-black/30 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-black/85 via-black/50 to-transparent" />

      {/* single category pill — ink-on-ink,
       * top-left. Replaces the older dark-card source overlay AND the
       * bottom-caption gold pill that duplicated this same data. Only
       * shown in Nearby mode; hero is unlabelled. Pool counter sits in
       * the same pill so the user knows their position in the feed.
       * the per-category blurb (sel.line2) is
       * dropped — the title alone reads cleaner and the blurb was
       * pushing the pill into a multi-line wrap on long captions.
       * category label removed too. The bottom
       * info card (title / category / distance / drive) already tells
       * the buyer what the video is about; the "EATING OUT" bucket
       * label was boilerplate. The pool counter (N/M) is preserved via
       * the segmented progress bar at the top. Owner: remove the old
       * tag and description on the listing-feed nearby video. */}

      {/* chip finally simplified to a circular
       * ActionButton (matches Like/Save/Contact/Share visually) with the
       * video count as the badge. Owner: "不好看 做成一个圆形加数字 不要文字了".
       * Positioned inline as the first child of the right rail below —
       * this replaces the absolute-positioned chip. See rail block. */}

      {/* desktop nav arrows for the Nearby pool.
       * Touch events don't fire on a Mac mouse, so the vertical-swipe
       * gesture is mobile-only. Up/Down arrows (md:flex) mirror the
       * PhotoCard's left/right arrow pattern. Hidden when pool ≤ 1 or
       * when not in Nearby mode. Stops propagation so the click doesn't
       * also trigger the tap-to-pause handler. */}
      {source === 'nearby' && poolSize > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSwipe(-1);
            }}
            aria-label="Previous nearby video"
            className="-translate-x-1/2 absolute top-20 left-1/2 z-10 hidden h-10 w-10 items-center justify-center rounded-full border border-surface/20 bg-ink/55 text-surface backdrop-blur transition-colors hover:border-surface hover:text-surface md:flex"
            style={{ touchAction: 'manipulation' }}
          >
            ‹
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSwipe(1);
            }}
            aria-label="Next nearby video"
            className="-translate-x-1/2 absolute bottom-32 left-1/2 z-10 hidden h-10 w-10 items-center justify-center rounded-full border border-surface/20 bg-ink/55 text-surface backdrop-blur transition-colors hover:border-surface hover:text-surface md:flex"
            style={{ touchAction: 'manipulation', transform: 'translateX(-50%) rotate(180deg)' }}
          >
            ‹
          </button>
        </>
      )}

      {/* NEVER render our center play glyph
       * during fullscreen. Owner: "全屏后不要有播放键". 74.22 HUD proved
       * `p=T` (paused=true) throughout fullscreen enter — that IS our
       * own domPaused-driven glyph mounting on top of the video. Users
       * had to tap it (pointer-events-none passes through, but iOS
       * treats the tap-through as a user gesture on `<video>`) to get
       * play, hence "按两次". By gating on `!isFullscreen`, the
       * fullscreen overlay renders zero UI over the video besides the
       * X close button; the 74.23 setInterval play retry (see
       * useEffect near line 720) drives play state without user action. */}
      {shouldMount && domPaused && !isFullscreen && (
        <div
          className="pointer-events-none flex items-center justify-center"
          style={
            isFullscreen && hasLandscape
              ? {
                  // play glyph must live above the fullscreen
                  // <video> (zIndex 10000) and rotate 90deg so its
                  // orientation matches the rotated video the user is
                  // watching.
                  position: 'fixed',
                  inset: 0,
                  zIndex: 10001,
                  transform: 'rotate(90deg)',
                }
              : { position: 'absolute', inset: 0 }
          }
        >
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-black/40 text-surface backdrop-blur">
            <PlayIcon />
          </div>
        </div>
      )}

      {/* fullscreen toggle. Shown only when the
       * render worker produced a landscape companion (i.e. ≥80% horizontal
       * source photos). In portrait mode the button sits mid-lower over
       * the letterbox area (below where the horizontal frame ends);
       * tapping enters an in-page fullscreen overlay that swaps the HLS
       * source to the 1920x1080 landscape uid. Uses custom overlay rather
       * than the native Fullscreen API to avoid iOS Safari's
       * webkitEnterFullscreen tearing down HLS.js. */}
      {shouldMount && hasLandscape && !isFullscreen && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            // synchronously measure the viewport
            // BEFORE flipping isFullscreen so the very first fullscreen
            // render already has valid vp.w/vp.h and can apply the
            // rotate-90/px-sized inline style. Without this, the useEffect
            // measure only fires post-render, so the first render's `vp`
            // was still {0,0} → the fullscreen <video> got neither Tailwind
            // sizing (className is '' in fullscreen) nor inline width/height
            // → it collapsed to intrinsic size (a "small" landscape tile)
            // until the effect fired one paint later.
            //
            // 74.10/74.15's sync
            // setHasFirstFrame(false) has been REMOVED. Since 74.17
            // uses the landscape uid in both feed and fullscreen,
            // tapping fullscreen does NOT swap HLS src — the video is
            // already playing with a first frame. Resetting
            // hasFirstFrame here would spuriously mount the 74.7
            // <img> overlay on top of an already-playing fullscreen
            // video for a frame or two.
            // trigger `.play()` synchronously
            // in the tap handler. Owner: "全屏之后流畅 最后有一个问题
            // 还需要解决播放键 一开始还在视频上 我需要自动播放全屏之后
            // 的视频". Because 74.17 uses the same landscape uid in
            // both feed and fullscreen, if the card wasn't the active
            // scroll-snap slide when tapped (the fullscreen button is
            // reachable outside the isActive branch's autoplay logic)
            // the video is still paused. Calling `.play()` in the tap
            // handler leverages the user gesture — iOS Safari treats
            // this as sticky activation, so unmuted play is allowed.
            const v = videoRef.current;
            if (v) {
              v.muted = muted;
              v.play().catch(() => {
                // Same fallback chain as the isActive autoplay effect
                // (see line ~831): retry muted if unmuted was blocked.
                if (!v.muted) {
                  v.muted = true;
                  onAutoplayBlocked?.();
                  v.play().catch(() => {});
                }
              });
            }
            const w = Math.round(window.innerWidth);
            const h = Math.round(window.innerHeight);
            if (w > 0 && h > 0) setVp({ w, h });
            setIsFullscreen(true);
          }}
          aria-label="View landscape fullscreen"
          className="-translate-x-1/2 absolute bottom-[26%] left-1/2 z-20 flex items-center gap-2 rounded-full border border-surface/30 bg-ink/70 px-4 py-2 text-surface text-sm backdrop-blur transition-colors hover:border-surface hover:bg-ink/85"
          style={{ touchAction: 'manipulation' }}
        >
          {/* corner-arrows expand icon */}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 9V4h5" />
            <path d="M20 9V4h-5" />
            <path d="M4 15v5h5" />
            <path d="M20 15v5h-5" />
          </svg>
          <span>Full screen</span>
        </button>
      )}
      {isFullscreen && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsFullscreen(false);
          }}
          aria-label="Exit fullscreen"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-surface/40 bg-ink/80 text-surface backdrop-blur transition-colors hover:border-surface hover:bg-ink/90"
          style={{
            // X button was hidden BEHIND the fullscreen video
            // because the video sits at zIndex 10000 (needed to escape the
            // parent stacking context). Bump X to 10002 (also above the
            // 10001 play glyph). Position via `fixed` so it doesn't inherit
            // the section's stacking-context ceiling.
            position: 'fixed',
            top: 16,
            right: 16,
            zIndex: 10002,
            touchAction: 'manipulation',
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      )}

      {/* Bottom caption — floating glass card
       * with description + agent card in a light bottom sheet (AAA
       * contrast) so nothing overlaps the video. Right rail lives at
       * `right-3`; the card reserves right-20 to clear it.
       * hidden in fullscreen — immersive mode
       * is video-only, price/address/agent card have no place there. */}
      {!isFullscreen && <CaptionCard listing={card.listing} agent={card.agent} />}
    </section>
  );
}

/**
 * DescriptionBlock retired. Description now lives
 * inside the CaptionCard bottom sheet (light surface, AAA contrast), not
 * inline over the media.
 */
