// docs/prototypes/v2-components/NeighborhoodCards.tsx
// "Communities, not families" neighborhood spotlight. Server Component.
// Images are external URLs in the draft; in app/ swap to next/image + Supabase storage URLs.

import Image from "next/image";

type Neighborhood = {
  slug: string;
  county: string;
  name: string;
  blurb: string;
  tags: string[];
  listingsLive: number;
  medianPrice: string;
  thumbUrl: string;
  thumbAlt: string;
};

const DEFAULT_NEIGHBORHOODS: Neighborhood[] = [
  {
    slug: "peachtree-corners",
    county: "Gwinnett",
    name: "Peachtree Corners",
    blurb: "Tech-forward suburb with walkable Town Green, Level Creek trails, top-3 GA schools.",
    tags: ["walkable", "family", "nature"],
    listingsLive: 42,
    medianPrice: "Median $675K",
    thumbUrl: "https://images.unsplash.com/photo-1449844908441-8829872d2607?w=800&auto=format",
    thumbAlt: "Peachtree Corners neighborhood",
  },
  {
    slug: "decatur-square",
    county: "DeKalb",
    name: "Decatur Square",
    blurb: "City-block density with an indie bookstore, Saturday market, and Decatur schools that families uproot for.",
    tags: ["walkable", "nightlife", "culture"],
    listingsLive: 28,
    medianPrice: "Median $795K",
    thumbUrl: "https://images.unsplash.com/photo-1596644462291-3d3ef5216d7e?w=800&auto=format",
    thumbAlt: "Decatur Square walkable downtown",
  },
  {
    slug: "alpharetta-avalon",
    county: "Fulton",
    name: "Alpharetta Avalon",
    blurb: "Mixed-use luxury pocket — walk to Avalon shops, backup GA-400 access, corporate-family favorite.",
    tags: ["walkable", "family", "luxury"],
    listingsLive: 19,
    medianPrice: "Median $1.1M",
    thumbUrl: "https://images.unsplash.com/photo-1502005229762-cf1b2da7c5d6?w=800&auto=format",
    thumbAlt: "Alpharetta Avalon neighborhood",
  },
];

export function NeighborhoodCards({
  neighborhoods = DEFAULT_NEIGHBORHOODS,
}: {
  neighborhoods?: Neighborhood[];
}) {
  return (
    <section
      id="neighborhoods"
      className="border-t border-[var(--border)] py-14 md:py-24 bg-[var(--cream)]"
    >
      <div className="mx-auto max-w-[1220px] px-5 md:px-7">
        <div className="max-w-[680px] mb-8 md:mb-[52px]">
          <span className="text-[11px] tracking-[0.2em] uppercase text-[var(--forest)] font-bold">
            Neighborhoods
          </span>
          <h2 className="font-serif font-semibold tracking-tight leading-[1.05] text-[28px] md:text-[48px] mt-3.5">
            Communities, not families.
          </h2>
          <p className="mt-3.5 text-[16px] md:text-[19px] text-[var(--ink-2)]">
            Percho &ldquo;community&rdquo; means the block, the coffee shop, the park, the school
            pickup line — the vibe you actually move into. Not a private chat with your in-laws.
            Buyers scroll neighborhoods the way they scroll TikTok.
          </p>
        </div>

        <div className="grid gap-3.5 md:gap-5 grid-cols-1 md:grid-cols-3">
          {neighborhoods.map((n) => (
            <NeighborhoodCard key={n.slug} n={n} />
          ))}
        </div>
      </div>
    </section>
  );
}

function NeighborhoodCard({ n }: { n: Neighborhood }) {
  return (
    <article className="bg-[var(--bg-elev)] border border-[var(--border)] rounded-[18px] overflow-hidden transition-all hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(38,36,31,0.08)]">
      <div className="relative aspect-[4/3] bg-[var(--cream)] overflow-hidden">
        {/* next/image with object-contain per persona rule; unoptimized draft-only fallback in prototype */}
        <Image
          src={n.thumbUrl}
          alt={n.thumbAlt}
          fill
          sizes="(max-width: 767px) 100vw, 400px"
          className="object-contain bg-[var(--cream)]"
          unoptimized
        />
      </div>
      <div className="p-5 md:p-6">
        <span className="text-[11px] tracking-[0.2em] uppercase text-[var(--peach-deep)] font-bold">
          {n.county}
        </span>
        <h3 className="font-serif font-semibold text-[22px] mt-1 mb-1">{n.name}</h3>
        <p className="text-[14px] text-[var(--ink-2)]">{n.blurb}</p>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {n.tags.map((t) => (
            <span
              key={t}
              className="text-[11px] px-2.5 py-1 bg-[var(--cream)] rounded-full text-[var(--forest)] font-semibold tracking-[0.04em]"
            >
              {t}
            </span>
          ))}
        </div>
        <div className="mt-3.5 text-[13px] text-[var(--ink-3)] flex justify-between">
          <span>{n.listingsLive} listings live</span>
          <span>{n.medianPrice}</span>
        </div>
      </div>
    </article>
  );
}
