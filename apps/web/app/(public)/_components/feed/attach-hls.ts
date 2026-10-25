import Hls from 'hls.js';

/**
 * Point a `<video>` at an HLS stream and return the teardown for the effect
 * that called it. Native HLS where the browser has it (Safari, iOS), hls.js
 * where it has Media Source Extensions, and a plain `src` as the last resort.
 *
 * `hd` is for the full-screen players: no cap at the player's pixel size (a
 * desktop letterbox renders smallish but should still get HD), and the first
 * playback starts on the top rung instead of the lowest — ABR can still step
 * down on real network pressure. The carousels keep hls.js's defaults.
 *
 * Written four times before this (VideoCard, CommunityVideoFeed and the two
 * carousels), each with its own `hlsRef` torn down at the top of the effect
 * and again in its cleanup. React already runs the previous cleanup before the
 * next effect, so the returned function is the only teardown needed.
 */
export function attachHls(video: HTMLVideoElement, src: string, { hd = false } = {}): () => void {
  if (video.canPlayType('application/vnd.apple.mpegurl') || !Hls.isSupported()) {
    video.src = src;
    return () => {};
  }
  const hls = new Hls(
    hd
      ? { maxBufferLength: 20, maxMaxBufferLength: 30, capLevelToPlayerSize: false }
      : { maxBufferLength: 20 },
  );
  if (hd) {
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (hls.levels.length > 0) hls.nextLevel = hls.levels.length - 1;
    });
  }
  hls.loadSource(src);
  hls.attachMedia(video);
  return () => hls.destroy();
}
