// docs/prototypes/v2-components/Pricing.tsx
// 3-tier pricing (Solo / Team / Brokerage). Server Component.
// Static content in draft — wire to Stripe/plan config later.

type Tier = {
  pill: string;
  title: string;
  amount: string;
  amountSmall: string;
  yearly: string;
  bullets: string[];
  cta: { label: string; href: string; variant: "ghost" | "primary" };
  featured?: boolean;
};

const DEFAULT_TIERS: Tier[] = [
  {
    pill: "Solo Agent",
    title: "The GA agent doing it themselves.",
    amount: "$19",
    amountSmall: "/ month",
    yearly: "$179/year — save 22%",
    bullets: [
      "Unlimited listings & reels",
      "Full GA neighborhood library",
      "AI listing import",
      "Multilingual captions (5 languages)",
      "Open house QR + recap reel",
    ],
    cta: { label: "Start 7-day trial", href: "#", variant: "ghost" },
  },
  {
    pill: "Team (Most popular)",
    title: "Boutique GA teams and small brokerages.",
    amount: "$79",
    amountSmall: "/ month · up to 10 seats",
    yearly: "$749/year — save 21%",
    bullets: [
      "Everything in Solo",
      "10 agent seats, one billing code",
      "Team-branded reel intros / outros",
      "Team analytics + coverage map",
      "Priority support (GA-based)",
    ],
    cta: { label: "Start team trial", href: "#", variant: "primary" },
    featured: true,
  },
  {
    pill: "Brokerage",
    title: "Multi-office GA brokerages, 25–50 seats.",
    amount: "$299",
    amountSmall: "/ month · up to 50 seats",
    yearly: "or annual pricing on request",
    bullets: [
      "Everything in Team",
      "Up to 50 agent seats",
      "Custom neighborhood coverage (add counties)",
      "MLS bulk import + white-label domain",
      "Dedicated GA account manager",
    ],
    cta: { label: "Talk to us", href: "#", variant: "ghost" },
  },
];

export function Pricing({ tiers = DEFAULT_TIERS }: { tiers?: Tier[] }) {
  return (
    <section id="pricing" className="border-t border-[var(--border)] py-14 md:py-24">
      <div className="mx-auto max-w-[1220px] px-5 md:px-7">
        <div className="max-w-[680px] mb-8 md:mb-[52px]">
          <span className="text-[11px] tracking-[0.2em] uppercase text-[var(--forest)] font-bold">
            Pricing
          </span>
          <h2 className="font-serif font-semibold tracking-tight leading-[1.05] text-[28px] md:text-[48px] mt-3.5">
            Priced for GA depth,<br />not national breadth.
          </h2>
          <p className="mt-3.5 text-[16px] md:text-[19px] text-[var(--ink-2)]">
            Free forever for buyers. Agents pay for a GA-native growth stack — MLS integration,
            neighborhood library, multilingual reach. Cheaper than a photographer, faster than DIY.
          </p>
        </div>

        <div className="grid gap-3.5 md:gap-5 grid-cols-1 md:grid-cols-3 items-stretch">
          {tiers.map((t) => (
            <PriceCard key={t.pill} tier={t} />
          ))}
        </div>

        <p className="text-center mt-9 text-[14px] text-[var(--ink-3)]">
          Buyers browse free forever · Optional{" "}
          <b className="text-[var(--ink)]">$2.99/mo Pro Alerts</b> for zip-code-level new-listing pings.
        </p>
      </div>
    </section>
  );
}

function PriceCard({ tier }: { tier: Tier }) {
  const featuredCard = tier.featured
    ? "border-2 border-[var(--forest)] bg-[linear-gradient(180deg,var(--forest-soft)_0%,#fff_40%)]"
    : "border border-[var(--border)] bg-[var(--bg-elev)]";
  const featuredPill = tier.featured
    ? "bg-[var(--forest)] text-white"
    : "bg-[var(--cream)] text-[var(--forest)]";
  const btn =
    tier.cta.variant === "primary"
      ? "bg-[var(--ink)] text-white hover:bg-[var(--peach-deep)]"
      : "border-[1.5px] border-[var(--ink)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-white";

  return (
    <div className={`rounded-[18px] p-7 md:p-9 flex flex-col ${featuredCard}`}>
      <span
        className={`self-start inline-block text-[11px] tracking-[0.14em] uppercase rounded-full px-3 py-1.5 mb-3.5 font-bold ${featuredPill}`}
      >
        {tier.pill}
      </span>
      <h3 className="font-serif font-semibold text-[26px]">{tier.title}</h3>
      <div className="font-serif font-semibold text-[42px] md:text-[52px] mt-3.5 md:mt-5 mb-1.5">
        {tier.amount}{" "}
        <small className="font-sans text-[15px] text-[var(--ink-3)] font-medium">
          {tier.amountSmall}
        </small>
      </div>
      <div className="text-[13px] text-[var(--ink-3)]">{tier.yearly}</div>
      <ul className="my-5 flex-1 space-y-1.5">
        {tier.bullets.map((b) => (
          <li
            key={b}
            className="text-[14px] text-[var(--ink-2)] flex gap-2.5 before:content-['◆'] before:text-[var(--peach)] before:text-[10px] before:mt-1.5"
          >
            {b}
          </li>
        ))}
      </ul>
      <a
        href={tier.cta.href}
        className={`mt-auto inline-flex justify-center items-center gap-2.5 rounded-full font-semibold text-[15px] px-6 py-3.5 transition-colors ${btn}`}
      >
        {tier.cta.label}
      </a>
    </div>
  );
}
