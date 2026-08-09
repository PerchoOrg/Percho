import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Internal — Photo motion prototypes',
  robots: { index: false, follow: false },
};

// Videos live in the public `demo-assets` Storage bucket (never in git —
// see .gitignore). Uploaded via scripts/admin/upload-demo-assets.mjs.
const BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/demo-assets`;
const MOTION = `${BASE}/motion`;

type Clip = { src: string; title: string; note: string };

const CHOSEN: Clip[] = [
  {
    src: `${BASE}/kenburns/vicinity-slideshow-demo.mp4`,
    title: 'Ken Burns slideshow — the shipping path',
    note: 'Vertical 1080x1920, pan/zoom alternating, crossfades, BGM, ending card. Pure ffmpeg, no model inference. This is what the render worker produces today.',
  },
  {
    src: `${MOTION}/percho-depthflow-demo.mp4`,
    title: 'DepthFlow 2.5D parallax — Depth Anything V2 Small',
    note: 'Four clips: exterior orbit, living room zoom-in, kitchen orbit, backyard zoom-out. The parallax option we are keeping, if we add one.',
  },
  {
    src: `${MOTION}/berkeley-park-da2-small.mp4`,
    title: 'DepthFlow, DA2-Small — full 10-photo listing',
    note: '3525 Berkeley Park Court, Duluth GA. 3s per photo, orbit and zoom alternating.',
  },
];

// Kept for the record. Depth Pro and the layered/inpainting route were tested
// and dropped on 2026-08-09 — sharper on paper, too soft in motion.
const REJECTED: Clip[] = [
  {
    src: `${MOTION}/berkeley-park-pro.mp4`,
    title: 'Apple Depth Pro — full listing',
    note: 'Sharpest depth maps of the three models, 2GB weights, ~3.6s per photo. Not pursued.',
  },
  {
    src: `${MOTION}/berkeley-park-da2-large.mp4`,
    title: 'Depth Anything V2 Large — full listing',
    note: '335M params. Marginally cleaner edges than Small for 13x the model size. Not pursued.',
  },
  {
    src: `${MOTION}/compare-depth__small_large_pro.mp4`,
    title: 'Depth model triptych',
    note: 'Left to right: DA2-Small, DA2-Large, Depth Pro. Same photo, same camera move.',
  },
  {
    src: `${MOTION}/listing-sliced.mp4`,
    title: 'Layered depth slices + LaMa inpainting',
    note: 'Scene cut into 4 depth slices, each inpainted to extend behind the ones in front, so disocclusions reveal generated pixels instead of stretched edges. Dropped: too soft in motion.',
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
          Where listing video stands. Ken Burns is in production. DepthFlow with Depth Anything V2
          Small is the parallax option we kept; everything under &ldquo;explored, not pursued&rdquo;
          was tested and dropped. Test listing throughout: 3525 Berkeley Park Court, Duluth GA.
        </p>
      </header>

      <section className="flex flex-col gap-6">
        <h2 className="text-base font-semibold">What we are building on</h2>
        {CHOSEN.map((clip) => (
          <VideoBlock key={clip.src} clip={clip} />
        ))}
      </section>

      <section className="flex flex-col gap-6">
        <h2 className="text-base font-semibold">Explored, not pursued</h2>
        <p className="text-sm text-ink2">
          Kept so we do not re-run these experiments. All of it renders locally at no API cost; the
          reason to drop it is output quality in motion, not price.
        </p>
        {REJECTED.map((clip) => (
          <VideoBlock key={clip.src} clip={clip} />
        ))}
        <figure className="m-0">
          <h3 className="mb-2 text-sm font-medium">Depth maps side by side</h3>
          <img
            src="/demos/motion/compare-depthmaps.png"
            alt="Depth map comparison: original photo, DA2-Small, DA2-Large and Depth Pro."
            className="w-full rounded border border-line"
          />
          <figcaption className="mt-2 text-xs text-ink2">
            Original, DA2-Small, DA2-Large, Depth Pro. Depth Pro resolves the mailbox scrollwork the
            others blur — which did not translate into a better video.
          </figcaption>
        </figure>
      </section>
    </div>
  );
}
