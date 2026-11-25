import { LegalLayout } from '@/app/_components/LegalLayout';

export const metadata = {
  title: 'Terms of Service — Percho',
  description: 'The terms governing your use of Percho.',
};

/*
 * Rewritten 2026-09-04 (phase172) for the store launch: covers the iOS app,
 * buyer accounts, tour requests and resident reviews. NOT yet reviewed by
 * counsel — the entity name and the governing-law clause are the owner's to
 * confirm before public release (see /privacy for the same note).
 */
export default function TermsPage() {
  return (
    <LegalLayout eyebrow="Legal" title="Terms of Service" updated="September 4, 2026">
      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of the Percho iOS
        app, percho.co and related services (together, the &ldquo;Service&rdquo;) operated by Percho
        (&ldquo;Percho&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;).
      </p>

      <h2>1. Acceptance</h2>
      <p>
        By creating an account or using the Service, you agree to these Terms. If you do not agree,
        do not use the Service.
      </p>

      <h2>2. Eligibility</h2>
      <p>
        You must be at least 18 years old. Agents using the Service to list properties represent
        that they hold the necessary real estate licenses and have authority to market the
        properties they upload.
      </p>

      <h2>3. Not a brokerage</h2>
      <p>
        Percho is a technology platform. We do not represent buyers or sellers, do not list or sell
        homes, and do not provide legal, tax, or real estate advice. All transactions occur
        off-platform between buyers, sellers, and their licensed representatives.
      </p>

      <h2>4. User content</h2>
      <p>
        Agents retain ownership of content they upload. By uploading, you grant Percho a worldwide,
        non-exclusive, royalty-free license to host, display, reformat, and distribute that content
        as part of the Service.
      </p>
      <p>
        <strong>Resident reviews.</strong> If you post a review of a neighbourhood you confirm that
        you live or have lived there and that the review reflects your own experience. You keep
        ownership of what you write and grant Percho the same license as above to display it. Every
        review is read by a member of our team before it is shown; we may decline to publish or may
        remove a review at any time, without notice, for any reason. Reviews are displayed without
        your name. To report a review, email <a href="mailto:hello@percho.co">hello@percho.co</a>{' '}
        and we will respond within 24 hours.
      </p>
      <p>
        You may not upload or post content that is infringing, deceptive, defamatory, harassing,
        that identifies a private individual, or that violates fair-housing laws (see{' '}
        <a href="/fair-housing">Fair Housing</a>).
      </p>

      <h2>5. Tour requests</h2>
      <p>
        When you request a tour of a home, we forward your name, contact details and message to the
        agent responsible for that home. Percho is not a party to any conversation or transaction
        that follows, and does not guarantee that an agent will respond.
      </p>

      <h2>6. Prohibited conduct</h2>
      <ul>
        <li>Scraping, reverse-engineering, or automated mass-extraction of listings.</li>
        <li>Impersonating another agent or claiming listings you do not represent.</li>
        <li>Posting discriminatory content (see Fair Housing).</li>
        <li>Using the Service to send spam or phishing.</li>
      </ul>

      <h2>7. Termination</h2>
      <p>
        We may suspend or terminate accounts that violate these Terms. You may delete your account
        at any time from the You tab in the app or from your profile settings on the website.
      </p>

      <h2>8. Disclaimers</h2>
      <p>
        The Service is provided &ldquo;as is&rdquo; without warranties. Listing data is provided by
        agents and data sources; figures such as monthly cost, rent estimates, school proficiency
        and neighbourhood facts are estimates from named public sources and are not advice. Resident
        reviews are the opinions of their authors. Verify all material details directly with the
        listing agent before making offers or transacting.
      </p>

      <h2>9. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, Percho is not liable for indirect, incidental, or
        consequential damages arising from your use of the Service.
      </p>

      <h2>10. Governing law</h2>
      <p>
        These Terms are governed by the laws of the State of Delaware, without regard to
        conflict-of-laws rules.
      </p>

      <h2>11. Changes</h2>
      <p>
        We may update these Terms. Material changes will be posted on this page; continued use after
        changes constitutes acceptance.
      </p>

      <h2>12. Contact</h2>
      <p>
        Questions: <a href="mailto:legal@percho.co">legal@percho.co</a>.
      </p>
    </LegalLayout>
  );
}
