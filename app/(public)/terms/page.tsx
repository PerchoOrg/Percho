import { LegalLayout } from '@/components/site/LegalLayout';

export const metadata = {
  title: 'Terms of Service — Vicinity',
  description: 'The terms governing your use of Vicinity.',
};

export default function TermsPage() {
  return (
    <LegalLayout eyebrow="Legal" title="Terms of Service" updated="June 20, 2026">
      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of vicinities.cc
        and related services operated by Vicinity, Inc. (&ldquo;Vicinity&rdquo;, &ldquo;we&rdquo;,
        &ldquo;us&rdquo;).
      </p>
      <p>
        <strong>This is a placeholder draft.</strong> A finalized Terms of Service reviewed by
        counsel will replace this text before public launch.
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
        Vicinity is a technology platform. We do not represent buyers or sellers, do not list or
        sell homes, and do not provide legal, tax, or real estate advice. All transactions occur
        off-platform between buyers, sellers, and their licensed representatives.
      </p>

      <h2>4. User content</h2>
      <p>
        Agents retain ownership of content they upload. By uploading, you grant Vicinity a
        worldwide, non-exclusive, royalty-free license to host, display, reformat, and distribute
        that content as part of the Service.
      </p>
      <p>
        You may not upload content that is infringing, deceptive, defamatory, or that violates
        fair-housing laws (see <a href="/fair-housing">Fair Housing</a>).
      </p>

      <h2>5. Prohibited conduct</h2>
      <ul>
        <li>Scraping, reverse-engineering, or automated mass-extraction of listings.</li>
        <li>Impersonating another agent or claiming listings you do not represent.</li>
        <li>Posting discriminatory content (see Fair Housing).</li>
        <li>Using the Service to send spam or phishing.</li>
      </ul>

      <h2>6. Termination</h2>
      <p>
        We may suspend or terminate accounts that violate these Terms. You may close your account at
        any time from your profile settings.
      </p>

      <h2>7. Disclaimers</h2>
      <p>
        The Service is provided &ldquo;as is&rdquo; without warranties. Listing data is provided by
        agents; we do not guarantee accuracy. Verify all material details directly with the listing
        agent before making offers or transacting.
      </p>

      <h2>8. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, Vicinity is not liable for indirect, incidental, or
        consequential damages arising from your use of the Service.
      </p>

      <h2>9. Governing law</h2>
      <p>
        These Terms are governed by the laws of the State of Delaware, without regard to
        conflict-of-laws rules.
      </p>

      <h2>10. Changes</h2>
      <p>
        We may update these Terms. Material changes will be posted on this page; continued use after
        changes constitutes acceptance.
      </p>

      <h2>11. Contact</h2>
      <p>
        Questions: <a href="mailto:legal@vicinities.cc">legal@vicinities.cc</a>.
      </p>
    </LegalLayout>
  );
}
