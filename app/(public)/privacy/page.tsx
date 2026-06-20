import { LegalLayout } from '@/components/site/LegalLayout';

export const metadata = {
  title: 'Privacy Policy — Vicinity',
  description: 'How Vicinity collects, uses, and protects your information.',
};

export default function PrivacyPage() {
  return (
    <LegalLayout eyebrow="Legal" title="Privacy Policy" updated="June 20, 2026">
      <p>
        This Privacy Policy describes how Vicinity, Inc. (&ldquo;Vicinity&rdquo;, &ldquo;we&rdquo;,
        &ldquo;us&rdquo;) collects, uses, and shares information when you use vicinities.cc and
        related services (the &ldquo;Service&rdquo;).
      </p>
      <p>
        <strong>This is a placeholder draft.</strong> A finalized policy reviewed by counsel will
        replace this text before public launch.
      </p>

      <h2>1. Information we collect</h2>
      <ul>
        <li>
          <strong>Account information</strong> — email, name, role (buyer or agent), and password
          hash when you sign up.
        </li>
        <li>
          <strong>Listing information</strong> — content agents upload: addresses, photos, videos,
          descriptions, prices.
        </li>
        <li>
          <strong>Usage information</strong> — listings you view, save, like, or share; device and
          browser metadata; approximate IP-derived location.
        </li>
        <li>
          <strong>Communication</strong> — messages you send through the platform or to our support
          addresses.
        </li>
      </ul>

      <h2>2. How we use information</h2>
      <ul>
        <li>
          To operate the Service: show you listings, save your favorites, route leads to agents.
        </li>
        <li>To improve recommendations and search relevance.</li>
        <li>To prevent fraud, abuse, and violations of our Terms.</li>
        <li>
          To send you transactional email (account, listing activity). We do not sell your email.
        </li>
      </ul>

      <h2>3. Sharing</h2>
      <p>
        We share information with: (a) the listing agent when you contact a listing; (b) our
        infrastructure providers under data-processing agreements; (c) law enforcement when required
        by valid legal process. We do not sell personal information to third parties.
      </p>

      <h2>4. Your choices</h2>
      <ul>
        <li>You can delete your account at any time from your profile settings.</li>
        <li>
          You can request a copy of your data by emailing{' '}
          <a href="mailto:legal@vicinities.cc">legal@vicinities.cc</a>.
        </li>
        <li>
          California residents have rights under the CCPA; EU/UK residents under GDPR. Email us to
          exercise them.
        </li>
      </ul>

      <h2>5. Cookies</h2>
      <p>
        We use first-party cookies for authentication and to remember your preferences. We do not
        use third-party advertising cookies.
      </p>

      <h2>6. Children</h2>
      <p>
        The Service is not directed to children under 13, and we do not knowingly collect
        information from them.
      </p>

      <h2>7. Changes</h2>
      <p>
        We will post material changes to this policy on this page and update the &ldquo;Last
        updated&rdquo; date.
      </p>

      <h2>8. Contact</h2>
      <p>
        Email <a href="mailto:legal@vicinities.cc">legal@vicinities.cc</a> with privacy questions or
        requests.
      </p>
    </LegalLayout>
  );
}
