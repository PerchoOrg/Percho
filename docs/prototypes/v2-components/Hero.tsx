// docs/prototypes/v2-components/Hero.tsx
// v2 landing → React draft. Markup + tailwind only, no data wiring, no client state.
// Assumes globals.css defines the peach/moss/cream CSS vars listed in README.md.
// Server Component friendly. Video is <video autoplay muted loop playsinline> — safe in RSC.

type HeroProps = {
  videoSrc?: string;      // e.g. "/hero/peachtree-corners-v1.mp4"
  posterSrc?: string;     // e.g. "/hero/peachtree-corners-v1.jpg"
  agentsOnboarded?: number;
  countiesLive?: number;
  neighborhoodStories?: number;
  reelsPublished?: number;
};

export function Hero({
  videoSrc = "/hero/hero.mp4",
  posterSrc = "/hero/hero-poster.jpg",
  agentsOnboarded = 142,
  countiesLive = 18,
  neighborhoodStories = 31,
  reelsPublished = 4200,
}: HeroProps) {
  return (
    <header className="pt-[70px] pb-10 md:pt-[70px] md:pb-10 pt-9 pb-6">
      <div className="mx-auto max-w-[1220px] px-5 md:px-7">
        <div className="grid gap-8 md:gap-[60px] md:grid-cols-[1.1fr_.9fr] items-center">
          {/* left */}
          <div>
            <span className="inline-flex items-center gap-2 bg-[var(--cream)] border border-[var(--border)] rounded-full px-3.5 py-2 text-[13px] text-[var(--forest)] font-semibold">
              <span className="w-2 h-2 rounded-full bg-[var(--forest)]" />
              Made in Georgia · Atlanta ↔ Savannah
            </span>
            <h1 className="font-serif font-semibold tracking-tight leading-[1.05] text-[38px] md:text-[80px] mt-5">
              The Atlanta<br />home tour,<br />
              <span className="text-[var(--peach-deep)] italic">in your pocket.</span>
            </h1>
            <p className="mt-5 md:mt-[22px] text-[16px] md:text-[19px] text-[var(--ink-2)] max-w-[640px]">
              Every listing in Georgia, turned into a 30-second reel. Every neighborhood, told as a
              story. Made for GA agents who know Buckhead is not East Atlanta — and buyers who want
              to feel the block before they book the showing.
            </p>
            <div className="flex flex-wrap gap-2.5 md:gap-3 mt-5 md:mt-7">
              <a
                href="#pricing"
                className="inline-flex items-center gap-2.5 rounded-full bg-[var(--ink)] text-white font-semibold text-[14px] md:text-[15px] px-4 py-3 md:px-6 md:py-3.5 transition-colors hover:bg-[var(--peach-deep)]"
              >
                Try free for 7 days
              </a>
              <a
                href="#feed"
                className="inline-flex items-center gap-2.5 rounded-full border-[1.5px] border-[var(--ink)] text-[var(--ink)] font-semibold text-[14px] md:text-[15px] px-4 py-3 md:px-6 md:py-3.5 transition-colors hover:bg-[var(--ink)] hover:text-white"
              >
                Watch Atlanta reels →
              </a>
            </div>
            <div className="mt-4 md:mt-6 text-[12px] md:text-[13px] text-[var(--ink-3)] flex flex-wrap items-center gap-2.5 md:gap-4">
              <span><b className="text-[var(--ink)] font-semibold">{agentsOnboarded}</b> GA agents onboarded</span>
              <span>·</span>
              <span><b className="text-[var(--ink)] font-semibold">{countiesLive}</b> counties live</span>
              <span>·</span>
              <span>Free for buyers, always</span>
            </div>
          </div>

          {/* right: phone mock */}
          <div className="relative mx-auto w-full max-w-[260px] md:max-w-[360px] aspect-[9/16] rounded-[30px] md:rounded-[38px] bg-[var(--cream)] p-2.5 md:p-3.5 shadow-[0_12px_40px_rgba(38,36,31,0.08)] overflow-hidden">
            <video
              className="w-full h-full object-contain bg-[var(--cream)] rounded-[22px] md:rounded-[26px] block"
              src={videoSrc}
              poster={posterSrc}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-label="Percho reel for a Peachtree Corners home"
            />
            {/* fade */}
            <div
              className="pointer-events-none absolute left-3.5 right-3.5 bottom-3.5 h-[45%] rounded-b-[22px] md:rounded-b-[26px]"
              style={{ background: "linear-gradient(180deg,transparent 0%,rgba(0,0,0,.55) 65%,rgba(0,0,0,.75) 100%)" }}
            />
            <div className="absolute left-3.5 right-3.5 bottom-5 md:bottom-7 text-white z-[2] drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)]">
              <div className="text-[13px] uppercase tracking-[0.14em] opacity-90">
                Peachtree Corners · Gwinnett
              </div>
              <div className="text-[22px] md:text-[28px] font-extrabold mt-0.5">$675,000</div>
              <div className="text-[12px] md:text-[13px] opacity-90">
                4 bd · 3 ba · 2,540 sqft · walk to Town Center
              </div>
            </div>
          </div>
        </div>

        {/* county strip */}
        <div className="mt-14 md:mt-14 py-4 md:py-6 border-t border-b border-dashed border-[var(--border)]">
          <div className="flex flex-wrap justify-between items-center gap-x-8 gap-y-4">
            <Stat num={String(countiesLive)} label="GA counties live" />
            <Stat num={`${reelsPublished.toLocaleString()}+`} label="Reels published" />
            <Stat num={String(agentsOnboarded)} label="Agents onboarded" />
            <Stat num={String(neighborhoodStories)} label="Neighborhood stories" />
            <Stat num="5" label="Languages (EN·ES·ZH·VI·KO)" />
          </div>
        </div>
      </div>
    </header>
  );
}

function Stat({ num, label }: { num: string; label: string }) {
  return (
    <div>
      <div className="font-serif text-[26px] md:text-[34px] font-semibold text-[var(--forest)]">{num}</div>
      <div className="text-[10px] md:text-[12px] uppercase tracking-[0.14em] text-[var(--ink-3)] mt-0.5">
        {label}
      </div>
    </div>
  );
}
