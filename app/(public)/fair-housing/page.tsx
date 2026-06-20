import { LegalLayout } from '@/components/site/LegalLayout';

export const metadata = {
  title: 'Fair Housing — Vicinity',
  description:
    'Vicinity is committed to equal housing opportunity. Learn about your rights and our policies.',
};

export default function FairHousingPage() {
  return (
    <LegalLayout
      eyebrow="Legal"
      title="Fair Housing &amp; Equal Opportunity"
      updated="June 20, 2026"
    >
      <p>
        Vicinity supports equal housing opportunity and complies with the federal Fair Housing Act
        and applicable state and local laws.
      </p>

      <h2>Protected classes</h2>
      <p>
        It is illegal to discriminate in the sale, rental, or advertising of housing on the basis
        of:
      </p>
      <ul>
        <li>Race or color</li>
        <li>Religion</li>
        <li>National origin</li>
        <li>Sex (including gender identity and sexual orientation)</li>
        <li>Familial status (families with children)</li>
        <li>Disability</li>
        <li>
          Additional classes protected by state or local law (e.g., age, source of income, marital
          status)
        </li>
      </ul>

      <h2>What this means on Vicinity</h2>
      <ul>
        <li>
          Listing copy, video voice-over, and agent profiles must not state preferences or
          limitations based on protected classes (e.g. &ldquo;perfect for a young couple&rdquo;,
          &ldquo;adults only&rdquo;).
        </li>
        <li>
          Agents must not refuse to show or rent a property to a buyer based on a protected class.
        </li>
        <li>
          Lead routing and inbox tools must not be used to filter buyers by protected
          characteristics.
        </li>
      </ul>

      <h2>Reporting a violation</h2>
      <p>If you believe a listing, agent, or buyer on Vicinity has violated fair-housing law:</p>
      <ul>
        <li>
          Email us at <a href="mailto:legal@vicinities.cc">legal@vicinities.cc</a> with the listing
          URL or agent profile and a brief description.
        </li>
        <li>
          File a complaint with the U.S. Department of Housing and Urban Development at{' '}
          <a href="https://www.hud.gov/fairhousing" rel="noopener" target="_blank">
            hud.gov/fairhousing
          </a>
          .
        </li>
      </ul>

      <h2>Our role</h2>
      <p>
        Vicinity is a technology platform, not a real estate broker. We moderate listings and agent
        profiles for compliance and remove content that violates these policies. We do not arbitrate
        transactions between buyers and agents.
      </p>
    </LegalLayout>
  );
}
