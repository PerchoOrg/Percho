import { LegalLayout } from '@/components/site/LegalLayout';

export const metadata = {
  title: 'Contact — Percho',
  description: 'Get in touch with the Percho team.',
};

export default function ContactPage() {
  return (
    <LegalLayout eyebrow="Contact" title="Get in touch.">
      <p>
        Percho is a small team. We read every message; we may not reply to every one. Use the
        address that fits.
      </p>

      <h2>General</h2>
      <p>
        <a href="mailto:hello@percho.co">hello@percho.co</a> — product questions, feedback,
        partnership ideas.
      </p>

      <h2>For agents</h2>
      <p>
        <a href="mailto:agents@percho.co">agents@percho.co</a> — listing a home, claiming an agent
        profile, payout questions.
      </p>

      <h2>Press</h2>
      <p>
        <a href="mailto:press@percho.co">press@percho.co</a> — media and press inquiries.
      </p>

      <h2>Legal &amp; privacy</h2>
      <p>
        <a href="mailto:legal@percho.co">legal@percho.co</a> — DMCA notices, privacy requests,
        fair-housing concerns.
      </p>

      <h2>Mailing address</h2>
      <p>
        Percho, Inc.
        <br />
        (Mailing address available on request.)
      </p>
    </LegalLayout>
  );
}
