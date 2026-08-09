import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Internal — Photo motion prototypes',
  robots: { index: false, follow: false },
};

// Videos live in the public `demo-assets` Storage bucket (never in git —
// see .gitignore). Uploaded via scripts/admin/upload-demo-assets.mjs.
const BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/demo-assets/motion`;

type Clip = { src: string; title: string; note: string };

const FULL_VIDEOS: Clip[] = [
  {
    src: `${BASE}/berkeley-park-da2-small.mp4`,
    title: 'Depth Anything V2 — Small (current default)',
    note: '25M params. Soft object edges; watch trees and cabinet lines during orbits.',
  },
  {
    src: `${BASE}/berkeley-park-da2-large.mp4`,
    title: 'Depth Anything V2 — Large',
    note: '335M params. Slightly cleaner edges, same overall look.',
  },
  {
    src: `${BASE}/berkeley-park-pro.mp4`,
    title: 'Apple Depth Pro',
    note: 'Full-resolution metric depth. Sharpest edges — porch columns, railings, fixtures hold shape in motion.',
  },
];

const SLICES: Clip[] = [
  {
    src: `${BASE}/slice-exterior-1x.mp4`,
    title: 'Exterior — production amplitude',
    note: 'Left: one stretched sheet (current). Right: 4 depth slices, each inpainted so it extends behind the slice in front of it.',
  },
  {
    src: `${BASE}/slice-exterior-2x.mp4`,
    title: 'Exterior — 2x amplitude',
    note: 'Twice the camera travel, where the difference is obvious: roofline, window frames and bushes stay sharp on the right; the left smears.',
  },
  {
    src: `${BASE}/slice-kitchen-1x.mp4`,
    title: 'Interior — production amplitude',
    note: 'Watch the faucet and the countertop edge.',
  },
  {
    src: `${BASE}/slice-kitchen-2x.mp4`,
    title: 'Interior — 2x amplitude',
    note: 'The faucet survives on the right and is smeared away on the left.',
  },
];

const COMPARISONS: Clip[] = [
  {
    src: `${BASE}/compare-depth__small_large_pro.mp4`,
    title: 'Depth model triptych — exterior orbit',
    note: 'Left to right: DA2-Small, DA2-Large, Depth Pro. Same photo, same camera move.',
  },
  {
    src: `${BASE}/compare-fill__stretch_layered_layered2x.mp4`,
    title: 'Disocclusion fill — stretch vs. generated pixels',
    note: 'Left: edge stretch (current). Middle: layered + LaMa inpainting, same amplitude. Right: 2x amplitude — the mailbox leaves the frame and reveals generated lawn behind it.',
  },
  {
    src: `${BASE}/compare-fill-kitchen__stretch_layered_layered2x.mp4`,
    title: 'Disocclusion fill — interior (kitchen)',
    note: 'Same three-way comparison along the countertop edge.',
  },
];

function VideoBlock({ clip }: { clip: Clip }) {
  return (
    <figure className="m-0">
      <h3 className="mb-2 text-sm font-medium">{clip.title}</h3>
      {/* autoPlay + muted so the clips are visibly moving on load — without it
          they sit on frame 1 and read as stills. */}
      <video
        src={clip.src}
        controls
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        className="w-full rounded border border-line bg-black"
      />
      <figcaption className="mt-2 text-xs text-ink2">{clip.note}</figcaption>
    </figure>
  );
}

export default function MotionDemosPage() {
  return (
    <div className="flex flex-col gap-10">
      <header>
        <h1 className="text-xl font-semibold">Photo motion prototypes</h1>
        <p className="mt-2 text-sm text-ink2">
          AutoReel-style per-photo camera moves (3s each, alternating orbit/zoom) rendered with
          DepthFlow 2.5D parallax on local hardware. Test listing: 3525 Berkeley Park Court, Duluth
          GA (10 photos). Render cost: ~0.3s per clip, no API spend.
        </p>
      </header>

      <section className="flex flex-col gap-6">
        <h2 className="text-base font-semibold">Full listing video — one per depth model</h2>
        {FULL_VIDEOS.map((clip) => (
          <VideoBlock key={clip.src} clip={clip} />
        ))}
      </section>

      <section className="flex flex-col gap-6">
        <h2 className="text-base font-semibold">Depth-slice layering — stretch vs. sliced</h2>
        <p className="text-sm text-ink2">
          Every clip below is left = current single-layer stretch, right = the scene cut into 4
          depth slices at histogram valleys, each slice inpainted so it extends behind the ones in
          front of it. Same photo, same camera move, same depth map (Depth Pro).
        </p>
        {SLICES.map((clip) => (
          <VideoBlock key={clip.src} clip={clip} />
        ))}
      </section>

      <section className="flex flex-col gap-6">
        <h2 className="text-base font-semibold">Research comparisons</h2>
        {COMPARISONS.map((clip) => (
          <VideoBlock key={clip.src} clip={clip} />
        ))}
        <figure className="m-0">
          <h3 className="mb-2 text-sm font-medium">Depth maps side by side</h3>
          <img
            src="/demos/motion/compare-depthmaps.png"
            alt="Depth map comparison: original photo, DA2-Small, DA2-Large and Depth Pro. Depth Pro resolves the mailbox scrollwork that the others blur."
            className="w-full rounded border border-line"
          />
          <figcaption className="mt-2 text-xs text-ink2">
            Note the mailbox scrollwork (bottom right): Depth Pro resolves it fully — this is what
            keeps edges clean during motion.
          </figcaption>
        </figure>
      </section>

      <section className="flex flex-col gap-6">
        <h2 className="text-base font-semibold">Baseline demo (first prototype)</h2>
        <VideoBlock
          clip={{
            src: `${BASE}/percho-depthflow-demo.mp4`,
            title: 'First 4-clip demo — DA2-Small',
            note: 'Exterior orbit, living room zoom-in, kitchen orbit, backyard zoom-out.',
          }}
        />
      </section>
    </div>
  );
}
