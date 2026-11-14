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
 */
import { attachHls } from '@/app/(public)/_components/feed/attach-hls';
import { useEffect, useRef } from 'react';

export type CommunityFilmProps = {
  url: string;
  poster: string | null;
  credits: string[];
};

export function CommunityFilm({ url, poster, credits }: CommunityFilmProps) {
  const ref = useRef<HTMLVideoElement | null>(null);

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
          className="aspect-[135/197] w-full rounded-xl bg-ink object-cover"
        />
        {credits.length > 0 ? (
          <p className="mt-2 text-center text-muted text-xs leading-snug">
            Film photos by {credits.join(', ')}, via Google Maps.
          </p>
        ) : null}
      </div>
    </section>
  );
}
