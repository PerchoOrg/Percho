# Ken Burns slideshow generator

Generates a vertical (1080x1920) MP4 slideshow from a directory of listing
photos, with alternating pan/zoom effects, crossfade transitions, optional
background music, and an optional listing-detail ending card.

Used as the fallback video for a listing when the agent hasn't uploaded a
walkthrough. Also served to the agent as a preview inside the dashboard so
they can decide whether to record their own version.

## Dependencies

- `ffmpeg` and `ffprobe` on `$PATH` (tested with 6.1.1). No pip installs.
- Python 3.10+ (stdlib only).

## Usage

```
python scripts/ken-burns/generate.py \
  --photos ./photos/ \
  --output ./out.mp4 \
  --duration-per-photo 3 \
  --resolution 1080x1920 \
  --bgm ./bgm.mp3 \
  --ending-card ./card.json \
  --transition crossfade \
  --zoom-mode auto
```

Only `--photos` and `--output` are required. `--zoom-mode auto` alternates
`pan-lr → zoom-in → pan-tb → zoom-out` deterministically by photo index.

`--ending-card` JSON:
```json
{
  "price": "$685,000",
  "beds": 4,
  "baths": 3,
  "sqft": "2,800",
  "address": "123 Peachtree Ln, Atlanta GA",
  "agent_name": "Sample Agent"
}
```

## Performance

On a modern laptop, 8 photos × 3s + 4s ending card ≈ 28s output renders in
roughly the same wall time (~30s). The dominant cost is per-photo H.264
encoding of the zoompan output. Rendering is single-process; parallelize by
sharding the photo list across workers if you need higher throughput.

## Invoking from Node

```ts
import { spawn } from 'node:child_process';

const proc = spawn('python3', [
  'scripts/ken-burns/generate.py',
  '--photos', photosDir,
  '--output', outPath,
  '--ending-card', cardJsonPath,
  '--bgm', bgmPath,
]);
proc.stdout.on('data', (d) => console.log(d.toString()));
proc.stderr.on('data', (d) => console.error(d.toString()));
await new Promise((res, rej) =>
  proc.on('exit', (code) => (code === 0 ? res(null) : rej(new Error(`exit ${code}`))))
);
```

## Deploying

Production runs on the EC2 `percho-render-worker` systemd service. See
`scripts/render-worker/README.md` for the worker loop.

## Notes

- ffmpeg's `zoompan` filter operates in integer pixel steps at the OUTPUT
  resolution, which causes visible jitter on slow pans. We work around this
  by upscaling the source 4x before zoompan and letting ffmpeg downsample
  smoothly. This is why input photos should be at least 1080p on the short
  edge; smaller inputs will look soft.
