import { LegalLayout } from '@/components/site/LegalLayout';

export const metadata = {
  title: 'About — Vicinity',
  description:
    'Vicinity is a swipe-first home-discovery platform. Real listings, real video, real neighborhoods.',
};

export default function AboutPage() {
  return (
    <LegalLayout eyebrow="About" title="A quieter way to find a home.">
      <p>
        Vicinity is what TikTok would look like if it were built for buying a home. Real listings
        from real agents — shown as video, with real neighborhood context — instead of a spreadsheet
        of beds, baths, and zip codes.
      </p>

      <h2>What we believe</h2>
      <p>
        A home is a place, not a row in a database. The current home-search experience optimizes for
        filtering — price, square feet, lot size — and loses what actually decides whether a home is
        right for you: how the light hits the kitchen at 4pm, how loud the street is, what the walk
        to coffee feels like.
      </p>
      <p>
        We think buyers deserve to feel a place before they tour it, and agents deserve a channel
        where their craft — staging, story, walk-throughs — actually lands.
      </p>

      <h2>How it works</h2>
      <ul>
        <li>
          <strong>Agents upload.</strong> Photos, video, the story of the home. Two minutes.
        </li>
        <li>
          <strong>We enrich.</strong> Schools, commute, neighborhood — verified, with sources you
          can audit.
        </li>
        <li>
          <strong>Buyers swipe.</strong> A vertical, video-first feed. Like to save, share with one
          tap, contact the listing agent directly.
        </li>
      </ul>

      <h2>Who we are</h2>
      <p>
        Vicinity is a small team based in the United States. We are not a brokerage. We do not buy
        or sell homes. We build the platform that lets agents and buyers find each other.
      </p>

      <h2>Get in touch</h2>
      <p>
        Questions, partnership, or press: <a href="/contact">contact us</a>.
      </p>
    </LegalLayout>
  );
}
