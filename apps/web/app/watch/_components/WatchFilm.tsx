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

  useEffect(() => {
    const el = ref.current;
    if (!el || !film) return;
    if (film.url.endsWith('.m3u8')) return attachHls(el, film.url, { hd: true });
    el.src = film.url;
  }, [film]);

  const toggleSound = () => {
    const el = ref.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
    // A browser that refused autoplay starts the film on this tap.
    if (el.paused) void el.play().catch(() => {});
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
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/50 to-transparent" />
      <p className="absolute left-4 top-4 font-semibold text-lg tracking-tight">Percho</p>
      {film ? (
        <button
          type="button"
          onClick={toggleSound}
          aria-label={muted ? 'Turn sound on' : 'Mute'}
          className="absolute right-4 top-3 rounded-full bg-white/90 px-3 py-1.5 font-medium text-ink text-xs"
        >
          {muted ? 'Sound on' : 'Mute'}
        </button>
      ) : null}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-24">
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
