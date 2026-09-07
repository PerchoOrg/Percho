#!/usr/bin/env python3
"""Build a page-curl flipbook video by:
1. Rendering each clip's motion segment (ken-burns) individually with a small
   safety extension so the transition frame can be extracted.
2. For each pair of consecutive clips, generate N page-curl transition frames
   using the LAST frame of clip i and the FIRST frame of clip i+1.
3. Interleave: clip0 (minus xfade tail) + transition01 + clip1 (minus tail) + ...
4. Concat with concat demuxer, then mux BGM.

Reuses ~/Percho/scripts/ken-burns/generate.py to render individual clips
by driving it with a 1-photo shot plan per clip (hacky but avoids
duplicating the ken-burns filter code).
"""
import argparse, json, os, subprocess, sys, tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import page_curl as pc
from PIL import Image

FPS = 30
TRANSITION_FRAMES = 12   # 0.4s at 30fps


def run(cmd):
    print("$", " ".join(str(c) for c in cmd), flush=True)
    subprocess.run([str(c) for c in cmd], check=True)


def ffprobe_duration(path):
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True, check=True)
    return float(r.stdout.strip())


def extract_frame(video, out_img, at_time):
    run(["ffmpeg", "-y", "-ss", f"{at_time:.3f}", "-i", str(video),
         "-frames:v", "1", "-q:v", "2", str(out_img)])


def render_single_clip(shot_plan_entry, listing_meta, photo_dir, out_mp4, w, h, generator_py):
    """Render one clip by invoking generate.py with a 1-entry shot plan.
    Skips crossfade (single clip = shutil copy)."""
    with tempfile.TemporaryDirectory() as td:
        tdp = Path(td)
        plan = {"listing": listing_meta, "style": "modern", "plan": [shot_plan_entry]}
        (tdp / "plan.json").write_text(json.dumps(plan))
        run([
            "/usr/bin/python3", str(generator_py),
            "--photos", str(photo_dir),
            "--output", str(out_mp4),
            "--orientation", "portrait" if h > w else "landscape",
            "--shot-plan", str(tdp / "plan.json"),
            "--archetype", "LIFESTYLE",
        ])


def build_transition_clip(prev_video, next_video, out_mp4, w, h, td):
    tdp = Path(td)
    # Extract last frame of prev, first frame of next
    prev_dur = ffprobe_duration(prev_video)
    prev_last = tdp / "prev_last.jpg"
    next_first = tdp / "next_first.jpg"
    extract_frame(prev_video, prev_last, prev_dur - 0.05)
    extract_frame(next_video, next_first, 0.0)
    frames_dir = tdp / "trans_frames"
    frames_dir.mkdir(exist_ok=True)
    pc.render_transition_frames(str(prev_last), str(next_first), frames_dir,
                                 TRANSITION_FRAMES, w, h)
    run([
        "ffmpeg", "-y", "-framerate", str(FPS),
        "-i", str(frames_dir / "trans_%04d.jpg"),
        "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-profile:v", "high", "-level", "4.0", "-pix_fmt", "yuv420p",
        "-color_range", "tv", "-colorspace", "bt709",
        "-color_primaries", "bt709", "-color_trc", "bt709",
        "-r", str(FPS),
        str(out_mp4),
    ])


def concat_all(segments, out_mp4):
    """Concat via demuxer — all segments must share codec params."""
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as f:
        for seg in segments:
            f.write(f"file '{os.path.abspath(seg)}'\n")
        listfile = f.name
    run([
        "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", listfile,
        "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-profile:v", "high", "-level", "4.0", "-pix_fmt", "yuv420p",
        "-color_range", "tv", "-colorspace", "bt709",
        "-color_primaries", "bt709", "-color_trc", "bt709",
        "-r", str(FPS), "-movflags", "+faststart",
        str(out_mp4),
    ])
    os.unlink(listfile)


def mux_bgm(video_in, bgm, out, dur):
    fade_start = max(0.0, dur - 2.0)
    run([
        "ffmpeg", "-y", "-i", str(video_in),
        "-stream_loop", "-1", "-i", str(bgm),
        "-shortest", "-t", f"{dur:.3f}",
        "-af", f"afade=t=out:st={fade_start:.3f}:d=2,volume=0.55",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
        "-map", "0:v:0", "-map", "1:a:0",
        str(out),
    ])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--photos", required=True)
    ap.add_argument("--shot-plan", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--bgm", default=None)
    ap.add_argument("--generator", default=str(Path(__file__).parent / "generate_flipbook.py"))
    ap.add_argument("--orientation", default="portrait", choices=["portrait", "landscape"])
    args = ap.parse_args()

    photo_dir = Path(args.photos)
    plan_data = json.loads(Path(args.shot_plan).read_text())
    plan = plan_data["plan"]
    listing = plan_data.get("listing", {})

    w, h = (1080, 1920) if args.orientation == "portrait" else (1920, 1080)

    workdir = Path(tempfile.mkdtemp(prefix="curl_"))
    print(f"workdir={workdir}")

    # 1. Render each clip
    clip_paths = []
    for i, shot in enumerate(plan):
        clip_out = workdir / f"clip_{i:03d}.mp4"
        render_single_clip(shot, listing, photo_dir, clip_out, w, h, args.generator)
        clip_paths.append(clip_out)

    # 2. Build transitions between adjacent clips
    segments = []
    for i in range(len(clip_paths)):
        segments.append(clip_paths[i])
        if i < len(clip_paths) - 1:
            trans_out = workdir / f"trans_{i:03d}.mp4"
            build_transition_clip(clip_paths[i], clip_paths[i+1], trans_out, w, h, workdir)
            segments.append(trans_out)

    # 3. Concat
    concat_out = workdir / "concat.mp4"
    concat_all(segments, concat_out)

    total = ffprobe_duration(concat_out)
    print(f"[flipbook-curl] concat duration = {total:.2f}s")

    # 4. Mux BGM
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    if args.bgm:
        mux_bgm(concat_out, args.bgm, args.out, total)
    else:
        subprocess.run(["cp", str(concat_out), args.out], check=True)
    print(f"[flipbook-curl] done → {args.out} ({total:.2f}s)")


if __name__ == "__main__":
    main()
