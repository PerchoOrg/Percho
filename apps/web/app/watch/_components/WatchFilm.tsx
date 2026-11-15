'use client';

/**
 * What a shared link opens on the web (phase336): the film and nothing else,
 * then the app.
 *
 * Owner on phase335, where a shared link opened the full web page:
 * "分享链接直接打开了web页面 不好 打开应该只有视频 然后想要看更多就go to or
 * download app". So the screen is the film, full height, playing — muted,
 * because a browser blocks autoplay with sound; the speaker turns the
 * narration on. Over its foot: what it is, and one button to the app. The
 * button goes to the App Store, which says Open when the app is installed and
 * Get when it is not; Safari's banner at the top does the same.
 *
 * The credit line stays: Google's Places terms ask for the author wherever
 * their photos are shown, and the film is cut from them.
 */
import { attachHls } from '@/app/(public)/_components/feed/attach-hls';
import { useEffect, useRef, useState } from 'react';

export type WatchFilmProps = {
  /** "COMMUNITY" / "CITY", then where it is. */
  eyebrow: string;
  name: string;
  line: string | null;
  film: { url: string; poster: string | null } | null;
  credits: string[];
  appStoreUrl: string;
};

export function WatchFilm({ eyebrow, name, line, film, credits, appStoreUrl }: WatchFilmProps) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [muted, setMuted] = useState(true);
  /**
   * The browser refused to start the film (phase336.1, owner: "链接视频没有自动
   * 播放"). The `autoplay muted` attributes are not enough on an iPhone in Low
   * Power Mode, nor in the in-app browsers chat apps open links in (WeChat's
   * among them), which all want a tap first. So the film is started
   * explicitly, and when that is refused the whole screen becomes one play
   * button — and since that tap IS the gesture, it plays with sound.
   */
  const [blocked, setBlocked] = useState(false);
  /** Paused by the viewer (phase336.3, owner: "不能暂停") — tap the film to toggle. */
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !film) return;
    // Bucket and assembled films are HLS manifests; an AI tour is a plain MP4.
    let detach = () => {};
    if (film.url.endsWith('.m3u8')) detach = attachHls(el, film.url, { hd: true });
    else el.src = film.url;
    el.muted = true;
    el.play().then(
      () => setBlocked(false),
      () => setBlocked(true),
    );
    return detach;
  }, [film]);

  const playWithSound = () => {
    const el = ref.current;
    if (!el) return;
    el.muted = false;
    setMuted(false);
    void el.play().then(
      () => setBlocked(false),
      () => {
        // Some browsers refuse even a tapped play with sound; try it silent.
        el.muted = true;
        setMuted(true);
        void el.play().then(
          () => setBlocked(false),
          () => {},
        );
      },
    );
  };

  /** A tap on the film: the first one after a refused autoplay plays with sound. */
  const togglePlay = () => {
    const el = ref.current;
    if (!el) return;
    if (blocked) return playWithSound();
    if (el.paused) void el.play().catch(() => {});
    else el.pause();
  };

  const toggleSound = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) return playWithSound();
    el.muted = !el.muted;
    setMuted(el.muted);
  };

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-black text-white">
      {film ? (
        <video
          ref={ref}
          autoPlay
          muted
          loop
          playsInline
          poster={film.poster ?? undefined}
          // Whatever started it, a film that is playing needs no play button.
          onPlaying={() => {
            setBlocked(false);
            setPaused(false);
          }}
          onPause={() => setPaused(true)}
          // The whole film, from the top (phase336.3, owner: "左边被truncate了
          // 一部分"). A phone screen is far narrower than the film's 135:197,
          // so `cover` cut its sides — and the figures are drawn from the left
          // edge. Shown whole, it leaves black below, where the name and the
          // button sit; the figures end at 74.5% of its height, clear of them.
          className="absolute inset-0 h-full w-full object-contain object-top"
        />
      ) : null}

      {film ? (
        <button
          type="button"
          onClick={togglePlay}
          aria-label={blocked || paused ? 'Play the film' : 'Pause the film'}
          className={`absolute inset-0 z-10 flex items-center justify-center ${
            blocked || paused ? 'bg-black/20' : ''
          }`}
        >
          {blocked || paused ? (
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white/90 text-3xl text-ink">
              <span aria-hidden="true" className="ml-1.5">
                ▶
              </span>
            </span>
          ) : null}
        </button>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-24 bg-gradient-to-b from-black/50 to-transparent" />
      <p className="pointer-events-none absolute left-4 top-4 z-20 font-semibold text-lg tracking-tight">
        Percho
      </p>
      {film ? (
        <button
          type="button"
          onClick={toggleSound}
          aria-label={muted ? 'Turn sound on' : 'Mute'}
          className="absolute right-4 top-3 z-20 rounded-full bg-white/90 px-3 py-1.5 font-medium text-ink text-xs"
        >
          {muted ? 'Sound on' : 'Mute'}
        </button>
      ) : null}

      <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black via-black/70 to-transparent px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-24">
        <p className="font-medium text-white/70 text-xs uppercase tracking-[0.14em]">{eyebrow}</p>
        <h1 className="mt-1 font-semibold text-3xl tracking-tight">{name}</h1>
        {line ? <p className="mt-1 text-sm text-white/85 leading-snug">{line}</p> : null}
        <a
          href={appStoreUrl}
          className="mt-4 block rounded-full bg-white py-3 text-center font-semibold text-ink"
        >
          See more in the Percho app
        </a>
        {credits.length > 0 ? (
          <p className="mt-3 line-clamp-2 text-[10px] text-white/50 leading-snug">
            Film photos by {credits.join(', ')}.
          </p>
        ) : null}
      </div>
    </div>
  );
}
