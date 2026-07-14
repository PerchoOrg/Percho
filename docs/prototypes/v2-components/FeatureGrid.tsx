// docs/prototypes/v2-components/FeatureGrid.tsx
// 6-card feature grid ("Why Percho for GA agents"). Server Component.
// Uses .card / .feature-hero styling adapted to tailwind. Icon is emoji or short glyph string.

type Feature = { icon: string; title: string; body: string; hero?: boolean };

const DEFAULT_FEATURES: Feature[] = [
  {
    icon: "🏘️",
    title: "Neighborhood-first browsing",
    body: "Every listing lives inside its neighborhood — Buckhead, Decatur, Peachtree Corners, Alpharetta. Buyers scroll by vibe (walkable, quiet-suburban, family, nightlife), not just zip code. This is what Zillow can't do.",
    hero: true,
  },
  { icon: "📸", title: "Photos → reels, automatically", body: "Upload MLS photos. We compose a 30-second reel with neighborhood B-roll, subtitles, and light music. No filming required." },
  { icon: "✧", title: "AI listing import", body: "Paste an MLS PDF. Gemini parses price, beds, baths, sqft, and address — you review and publish in 90 seconds." },
  { icon: "◈", title: "Brokerage seats", body: "One code, whole office. GA brokerages get shared analytics + team-branded reels + neighborhood coverage maps." },
  { icon: "🌐", title: "Multilingual reach", body: "Auto-generate captions in Spanish, Chinese, Vietnamese, Korean. Share to Rednote / WeChat Moments. Reach GA's real buyer pool." },
  { icon: "📊", title: "Weekend tour reels", body: "QR-scan open house check-ins turn into a Monday recap reel automatically. Show the seller what happened." },
  { icon: "📥", title: "MLS photos, direct pipe", body: "Photos flow straight from FMLS/GAMLS into your reels — no shooting, no re-uploading, no gimbal. Agent's phone stays in their pocket while the pipeline works." },
];

export function FeatureGrid({ features = DEFAULT_FEATURES }: { features?: Feature[] }) {
  return (
    <section id="agents" className="border-t border-[var(--border)] py-14 md:py-24">
      <div className="mx-auto max-w-[1220px] px-5 md:px-7">
        <div className="max-w-[680px] mb-8 md:mb-[52px]">
          <span className="text-[11px] tracking-[0.2em] uppercase text-[var(--forest)] font-bold">
            Why Percho for GA agents
          </span>
          <h2 className="font-serif font-semibold tracking-tight leading-[1.05] text-[28px] md:text-[48px] mt-3.5">
            Built for one state.<br />That&apos;s how we win.
          </h2>
          <p className="mt-3.5 text-[16px] md:text-[19px] text-[var(--ink-2)]">
            Zillow is a directory. Instagram is a hobby. Percho is a Georgia-specialist growth
            stack — GA MLS integration, GA county-level neighborhood pages, GA-fluent AI copy,
            and the buyer pool that already lives in Atlanta.
          </p>
        </div>

        <div className="grid gap-3.5 md:gap-5 grid-cols-1 md:grid-cols-3">
          {features.map((f) => (
            <FeatureCard key={f.title} feature={f} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ feature }: { feature: Feature }) {
  const heroCls = feature.hero
    ? "md:col-span-2 bg-[linear-gradient(135deg,var(--forest-soft)_0%,var(--cream)_100%)] border-[var(--forest-soft)]"
    : "bg-[var(--bg-elev)]";
  return (
    <div
      className={`relative rounded-[18px] border border-[var(--border)] p-6 md:p-8 transition-all hover:-translate-y-[3px] hover:shadow-[0_12px_40px_rgba(38,36,31,0.08)] hover:border-[var(--forest-soft)] ${heroCls}`}
    >
      <div
        className={`w-11 h-11 md:w-12 md:h-12 rounded-[14px] grid place-items-center text-[19px] md:text-[22px] mb-3.5 md:mb-[18px] ${
          feature.hero ? "bg-[var(--bg-elev)]" : "bg-[var(--cream)]"
        }`}
      >
        {feature.icon}
      </div>
      <h3 className="font-bold text-[19px] md:text-[22px] tracking-tight mb-2">{feature.title}</h3>
      <p className="text-[15px] text-[var(--ink-2)]">{feature.body}</p>
    </div>
  );
}
