import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Internal — Photo motion prototypes',
  robots: { index: false, follow: false },
};

// Videos live in the public `demo-assets` Storage bucket (never in git —
// see .gitignore). Uploaded via scripts/admin/upload-demo-assets.mjs.
const BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/demo-assets`;
const MOTION = `${BASE}/motion`;

type Clip = { src: string; title: string; note: string; sound?: boolean };

const CATALOG: Clip[] = [
  {
    src: `${BASE}/catalog/catalog-kenburns-exterior.mp4`,
    title: 'Ken Burns — all 10 modes (exterior)',
    note: 'push_in, push_in_slow, pull_back, pan_lr, pan_rl, push_pan_lr, push_pan_rl, tilt_td, pan_to_subject, static. Every mode kenburns_filter_v2 implements, rendered through the production path. 3s each, labelled.',
  },
  {
    src: `${BASE}/catalog/catalog-depthflow-exterior.mp4`,
    title: 'DepthFlow — all 9 moves (exterior)',
    note: 'The four from the original prototype, plus five built from DepthState knobs it never used: tilt_parallax, orbit_to_subject, dolly_in, parallax_bloom, rack_focus. Same photo, same canvas.',
  },
  {
    src: `${BASE}/catalog/catalog-kenburns-kitchen.mp4`,
    title: 'Ken Burns — all 10 modes (kitchen)',
    note: 'The same catalogue on an interior photo, where depth is shallower and parallax has less to work with.',
  },
  {
    src: `${BASE}/catalog/catalog-depthflow-kitchen.mp4`,
    title: 'DepthFlow — all 9 moves (kitchen)',
    note: 'Interior counterpart. Watch the faucet and the countertop edge against the Ken Burns version.',
  },
];

const CHOSEN: Clip[] = [
  {
    src: `${BASE}/kenburns/berkeley-park-depthflow.mp4`,
    title: 'DepthFlow parallax in the production format — with music',
    note: '3525 Berkeley Park Court, all 10 photos. Vertical 1080x1920, blur-letterbox composition, crossfades and BGM all identical to the Ken Burns pipeline — the only thing swapped is the per-photo motion. Depth Anything V2 Small, 1.4s render per clip.',
    sound: true,
  },
  {
    src: `${BASE}/kenburns/vicinity-slideshow-demo.mp4`,
    title: 'Ken Burns slideshow — what ships today',
    note: 'Same pipeline, ffmpeg pan/zoom instead of parallax, plus an ending card. Different listing, so compare the motion rather than the property.',
    sound: true,
  },
  {
    src: `${MOTION}/berkeley-park-da2-small.mp4`,
    title: 'The same parallax, landscape and unscored',
    note: 'Earlier render of the same 10 photos at 800x600 with no canvas, music or transitions. Easier to see the raw camera moves.',
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
      <h3 className="mb-2 text-sm font-medium">
        {clip.title}
        {clip.sound ? (
          <span className="ml-2 text-xs text-ink2">🔊 press play for sound</span>
        ) : null}
      </h3>
      {/* Silent clips autoplay muted, otherwise they sit on frame 1 and read as
          stills. Scored clips must not: browsers only allow autoplay when
          muted, which would defeat the point of showing them with music. */}
      <video
        src={clip.src}
        controls
        autoPlay={!clip.sound}
        loop
        muted={!clip.sound}
        playsInline
        preload="metadata"
        className={`w-full rounded border border-line bg-black${clip.sound ? ' max-w-sm' : ''}`}
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
        <h2 className="text-base font-semibold">Every effect both engines can do</h2>
        <p className="text-sm text-ink2">
          Same photo, same canvas, every mode labelled and held for 3s. Ken Burns has 10 modes and
          DepthFlow has 9 — but the overlap is not the whole story: two DepthFlow moves
          (parallax_bloom, rack_focus) have no Ken Burns equivalent, and Ken Burns has no move that
          DepthFlow cannot reproduce.
        </p>
        {CATALOG.map((clip) => (
          <VideoBlock key={clip.src} clip={clip} />
        ))}
      </section>

      <section className="flex flex-col gap-6">
        <h2 className="text-base font-semibold">Parallax vs. Ken Burns</h2>
        <p className="text-sm text-ink2">
          These two have sound. The first is the candidate: DepthFlow parallax dropped into the
          existing render pipeline unchanged.
        </p>
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
