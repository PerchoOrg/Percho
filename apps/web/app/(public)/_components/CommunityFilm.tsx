'use client';

/**
 * The community's film on its web page (phase313) — the same film the iOS
 * community page and feed card play (`fetchVerticalVideos`: the assembled
 * tour, else a bucket video, else the AI tour). Before this the web page
 * showed only uploaded clips, so the six filmed communities played nothing.
 *
 * Portrait at the films' own 1080×1576 (135:197 — what the worker renders for
 * the app's card), with native controls and no autoplay: the film carries
 * narration, and browsers block autoplay with sound — the viewer presses play.
 * The photo credit line is Google's Places rule ("You must always credit the
 * author when displaying photos"), the same line the app prints.
 *
 * The city page plays its film through this too (phase335), so it lives with
 * the public pages rather than under `c/[slug]`.
 *
 * A city film is told in chapters (phase345): given `chapters`, a row of chips
 * under the film names them, the lit one follows playback and a click starts
 * that chapter — the iOS city page's strip, for the web.
 */
import { attachHls } from '@/app/(public)/_components/feed/attach-hls';
import { useEffect, useRef, useState } from 'react';

export type CommunityFilmProps = {
  url: string;
  poster: string | null;
  credits: string[];
  /** A city film's chapters, in film order; `endFraction` is 0..1 of the film. */
  chapters?: ReadonlyArray<{ key: string; label: string; endFraction: number }>;
};

export function CommunityFilm({ url, poster, credits, chapters = [] }: CommunityFilmProps) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [active, setActive] = useState(0);

  const startOf = (index: number) => (index === 0 ? 0 : (chapters[index - 1]?.endFraction ?? 0));
  const play = (index: number) => {
    const el = ref.current;
    if (!el || !Number.isFinite(el.duration)) return;
    el.currentTime = startOf(index) * el.duration;
    setActive(index);
    void el.play();
  };
  const onTime = () => {
    const el = ref.current;
    if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return;
    const at = el.currentTime / el.duration;
    const index = chapters.findIndex((c) => at <= c.endFraction);
    setActive(index < 0 ? chapters.length - 1 : index);
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Bucket and assembled films are HLS manifests; an AI tour is a plain MP4.
    if (url.endsWith('.m3u8')) return attachHls(el, url, { hd: true });
    el.src = url;
  }, [url]);

  return (
    <section className="px-1 pt-4 md:px-1.5">
      <div className="mx-auto w-full max-w-[380px]">
        <video
          ref={ref}
          controls
          playsInline
          preload="metadata"
          poster={poster ?? undefined}
          onTimeUpdate={chapters.length > 0 ? onTime : undefined}
          className="aspect-[135/197] w-full rounded-xl bg-ink object-cover"
        />
        {chapters.length > 0 ? (
          <div className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {chapters.map((c, i) => (
              <button
                key={`${c.key}-${c.endFraction}`}
                type="button"
                onClick={() => play(i)}
                aria-pressed={i === active}
                className={`shrink-0 rounded-full px-3 py-1 text-xs ${
                  i === active ? 'bg-ink text-white' : 'bg-ink/5 text-ink2'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        ) : null}
        {credits.length > 0 ? (
          <p className="mt-2 text-center text-muted text-xs leading-snug">
            Film photos by {credits.join(', ')}, via Google Maps.
          </p>
        ) : null}
      </div>
    </section>
  );
}
