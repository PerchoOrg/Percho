import { LegalLayout } from '@/components/site/LegalLayout';

export const metadata = {
  title: 'Contact — Vicinity',
  description: 'Get in touch with the Vicinity team.',
};

export default function ContactPage() {
  return (
    <LegalLayout eyebrow="Contact" title="Get in touch.">
      <p>
        Vicinity is a small team. We read every message; we may not reply to every one. Use the
        address that fits.
      </p>

      <h2>General</h2>
      <p>
        <a href="mailto:hello@vicinities.cc">hello@vicinities.cc</a> — product questions, feedback,
        partnership ideas.
      </p>

      <h2>For agents</h2>
      <p>
        <a href="mailto:agents@vicinities.cc">agents@vicinities.cc</a> — listing a home, claiming an
        agent profile, payout questions.
      </p>

      <h2>Press</h2>
      <p>
        <a href="mailto:press@vicinities.cc">press@vicinities.cc</a> — media and press inquiries.
      </p>

      <h2>Legal &amp; privacy</h2>
      <p>
        <a href="mailto:legal@vicinities.cc">legal@vicinities.cc</a> — DMCA notices, privacy
        requests, fair-housing concerns.
      </p>

      <h2>Mailing address</h2>
      <p>
        Vicinity, Inc.
        <br />
        (Mailing address available on request.)
      </p>
    </LegalLayout>
  );
}
