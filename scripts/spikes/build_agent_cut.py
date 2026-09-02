#!/usr/bin/env python3
"""
build_agent_cut — cut the agent's own phone footage into one home tour.

Spike, 2026-09-02. Owner picked option 1: the Chinese-language cut IS the
listing's main film. The four clips Vivian recorded are already a coherent
tour with her narration over it, so the shortest path to a watchable artefact
is to concatenate them and put music under her voice — no planner, no photo
clips, no model calls.

The audio chain is `worker.py: mux_audio` verbatim, with her real voice in the
slot the TTS wavs normally occupy: her track is loudnorm'd to VO level, the
music sits at bed level, and `sidechaincompress` ducks the music under her.
That is deliberate — if this is worth productionising, the assembler already
does the hard part.

ORDER comes from what she says, not from filenames: the kitchen piece to
camera opens with 「跟着小云一起来看房」, the exterior ends with 「我们进去
看一下」, and the upstairs clip opens with 「好，我们去楼上看下」.

Usage:
    python3 scripts/spikes/build_agent_cut.py <out.mp4> <clip1> <clip2> ...
"""
from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

# iOS canvas — SURFACE_CANVAS["ios"] in worker.py / shared.ts.
CW, CH = 1080, 1576

# worker.py's audio constants, quoted rather than reinvented.
VO_LOUDNORM = "loudnorm=I=-14:TP=-1.5:LRA=11"
MUSIC_BED_LOUDNORM = "loudnorm=I=-26:TP=-6:LRA=11"
STEREO_48K = "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo"

BGM = (Path.home() / "Workspace/Percho/scripts/render-worker/bgm"
       / "piano/ai-luxury-20260820-3318.mp3")


def duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True, timeout=30,
    )
    return float(out.stdout.strip())


def main() -> None:
    out_path = Path(sys.argv[1])
    clips = [Path(p) for p in sys.argv[2:]]
    work = Path(tempfile.mkdtemp(prefix="agentcut-"))

    # 1. Normalise every clip onto the canvas. Hard cuts, not crossfades: her
    #    sentences run to the edge of each clip and a 0.5s audio crossfade
    #    eats words. The pipeline crossfades stills because stills have no
    #    audio to protect.
    normed: list[Path] = []
    for i, clip in enumerate(clips):
        dest = work / f"{i:02d}.mp4"
        subprocess.run([
            "ffmpeg", "-y", "-v", "error", "-i", str(clip),
            "-vf", f"fps=30,scale={CW}:{CH}:force_original_aspect_ratio=increase,"
                   f"crop={CW}:{CH},setsar=1,format=yuv420p",
            "-af", STEREO_48K,
            "-c:v", "libx264", "-preset", "medium", "-crf", "18",
            "-c:a", "aac", "-b:a", "192k",
            str(dest),
        ], check=True, timeout=900)
        normed.append(dest)
        print(f"  normalised {clip.name[:8]} → {duration(dest):.1f}s")

    # 2. Concat.
    listing = work / "list.txt"
    listing.write_text("".join(f"file '{p}'\n" for p in normed))
    joined = work / "joined.mp4"
    subprocess.run([
        "ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0",
        "-i", str(listing), "-c", "copy", str(joined),
    ], check=True, timeout=900)
    total = duration(joined)
    print(f"  concatenated → {total:.1f}s")

    # 3. Music under the voice — mux_audio's filter graph, her track as [vo].
    fade_start = max(0.0, total - 2.0)
    filters = [
        f"[0:a]{VO_LOUDNORM},{STEREO_48K}[vo]",
        f"[1:a]atrim=0:{total:.3f},{MUSIC_BED_LOUDNORM},"
        f"afade=t=out:st={fade_start:.3f}:d=2,{STEREO_48K}[bg]",
        "[vo]asplit=2[vo1][vosc]",
        "[bg][vosc]sidechaincompress=threshold=0.03:ratio=12:attack=15:"
        f"release=350,apad=whole_dur={total:.3f}[duck]",
        "[duck][vo1]amix=inputs=2:duration=first:normalize=0,"
        "alimiter=limit=0.95[a]",
    ]
    subprocess.run([
        "ffmpeg", "-y", "-v", "error",
        "-i", str(joined), "-stream_loop", "-1", "-i", str(BGM),
        "-filter_complex", ";".join(filters),
        "-map", "0:v:0", "-map", "[a]", "-t", f"{total:.3f}",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart", str(out_path),
    ], check=True, timeout=900)
    print(f"  {out_path} — {duration(out_path):.1f}s, "
          f"{out_path.stat().st_size / 1e6:.1f} MB, music: {BGM.name}")


if __name__ == "__main__":
    main()
