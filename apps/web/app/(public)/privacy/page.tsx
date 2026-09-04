import { LegalLayout } from '@/app/_components/LegalLayout';

export const metadata = {
  title: 'Privacy Policy — Percho',
  description: 'How Percho collects, uses, and protects your information.',
};

/*
 * Rewritten 2026-09-04 (phase172) to describe what the iOS app and the web
 * site actually do at store launch: Sign in with Apple / email code, saved
 * homes on the account, tour requests forwarded to an agent, resident
 * reviews, and product telemetry keyed by a random install id. It is the
 * URL App Store Connect points at. NOT yet reviewed by counsel — the entity
 * name ("Percho") and the governing-law clause in /terms are the owner's to
 * confirm before public release.
 */
export default function PrivacyPage() {
  return (
    <LegalLayout eyebrow="Legal" title="Privacy Policy" updated="September 4, 2026">
      <p>
        This Privacy Policy describes how Percho (&ldquo;Percho&rdquo;, &ldquo;we&rdquo;,
        &ldquo;us&rdquo;) collects, uses, and shares information when you use the Percho iOS app,
        percho.co, and related services (together, the &ldquo;Service&rdquo;).
      </p>
      <p>
        The short version: you can browse everything without an account. If you sign in, we keep
        your saved homes and neighbourhoods on your account. If you ask for a tour, we pass your
        details to the agent for that home. We do not sell your information and we do not show ads.
      </p>

      <h2>1. Information we collect</h2>
      <ul>
        <li>
          <strong>Account information</strong> — when you sign in with Apple or with a code sent to
          your email, we store the email address (or the private relay address Apple provides) and a
          user id. We do not store a password. Apple may also share your name, which we do not
          currently use.
        </li>
        <li>
          <strong>Saved homes and neighbourhoods</strong> — the listings and communities you save
          are stored on your account so they follow you across devices. Before you sign in, saves
          live only on your phone.
        </li>
        <li>
          <strong>Tour requests</strong> — when you request a tour of a home you give us your name,
          email address, an optional phone number and a message. We forward these to the agent
          responsible for that home and keep a copy so we can follow up.
        </li>
        <li>
          <strong>Resident reviews</strong> — if you review a neighbourhood, we store the rating and
          text with your account. Reviews are shown to other people without your name or email, and
          only after a member of our team has read them.
        </li>
        <li>
          <strong>Usage information</strong> — which homes and neighbourhoods you view, how long you
          watch, what you save, skip or search for, and the filters you set. In the app this is
          keyed to a random install identifier generated on your phone; if you are signed in it is
          also linked to your account. We use it to order the feed and to see which features work.
          We do not collect your precise location, contacts, photos or advertising identifier.
        </li>
        <li>
          <strong>Listing content</strong> — content agents upload: addresses, photos, videos,
          descriptions, prices.
        </li>
        <li>
          <strong>Technical logs</strong> — our hosting providers record standard request logs (IP
          address, device and app version, time) for security and debugging, retained briefly.
        </li>
      </ul>

      <h2>2. How we use information</h2>
      <ul>
        <li>
          To operate the Service: show you homes, keep your saves, route tour requests to agents.
        </li>
        <li>To order what you see by what you have told us you care about.</li>
        <li>To publish resident reviews after moderation.</li>
        <li>To prevent fraud, abuse, and violations of our Terms.</li>
        <li>
          To send transactional email (sign-in codes, confirmation of a tour request). We do not
          send marketing email without asking first, and we do not sell your email.
        </li>
      </ul>

      <h2>3. Sharing</h2>
      <p>
        We share information with: (a) the agent for a home when you request a tour of it; (b)
        service providers that run our infrastructure under data-processing terms — database and
        authentication (Supabase), hosting (Vercel), video delivery (Cloudflare), email (Resend),
        and Sign in with Apple (Apple); (c) law enforcement when required by valid legal process. We
        do not sell personal information, and we do not share it with advertisers or data brokers.
      </p>

      <h2>4. Your choices</h2>
      <ul>
        <li>
          <strong>Delete your account</strong> from the You tab in the app. This permanently removes
          your account, your saves and your reviews.
        </li>
        <li>
          <strong>Edit a review</strong> from the neighbourhood page at any time. To remove one
          entirely, email us or delete your account.
        </li>
        <li>
          Request a copy of your data, or ask us to delete it, by emailing{' '}
          <a href="mailto:legal@percho.co">legal@percho.co</a>.
        </li>
        <li>
          California residents have rights under the CCPA; EU/UK residents under GDPR. Email us to
          exercise them.
        </li>
      </ul>

      <h2>5. Cookies</h2>
      <p>
        On the website we use first-party cookies for authentication and to remember your
        preferences. The app uses no cookies. We use no third-party advertising cookies or trackers.
      </p>

      <h2>6. Retention</h2>
      <p>
        Account data is kept until you delete your account. Tour requests are kept for as long as
        the agent may reasonably need to follow up. Usage information is kept in aggregate; records
        tied to an account are removed when the account is deleted.
      </p>

      <h2>7. Children</h2>
      <p>
        The Service is not directed to children under 13, and we do not knowingly collect
        information from them.
      </p>

      <h2>8. Changes</h2>
      <p>
        We will post material changes to this policy on this page and update the &ldquo;Last
        updated&rdquo; date.
      </p>

      <h2>9. Contact</h2>
      <p>
        Email <a href="mailto:legal@percho.co">legal@percho.co</a> with privacy questions or
        requests.
      </p>
    </LegalLayout>
  );
}
