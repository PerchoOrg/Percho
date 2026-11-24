import { LegalLayout } from '@/app/_components/LegalLayout';

export const metadata = {
  title: 'Credits — Percho',
  description: 'Music and photo credits for the films in Percho.',
};

/**
 * The CC BY 4.0 attribution for the film soundtrack. The iOS You tab links
 * here instead of printing the credit (owner, 2026-11-24) — 4.0 §3(a)(2)
 * allows the attribution to be a link to a page that carries it.
 *
 * The titles are every `KML_TRACKS` entry in
 * `scripts/render-worker/bgm/fetch.sh`; add one when a MacLeod track is added.
 */
const TRACKS = [
  'Carefree',
  'Cheery Monday',
  'Wallpaper',
  'Amazing Plan',
  'Wholesome',
  'Daily Beetle',
  'Happy Alley',
  'Balloon Game',
  'Take a Chance',
  'Pookatori and Friends',
] as const;

export default function CreditsPage() {
  return (
    <LegalLayout eyebrow="Credits" title="Music and photos.">
      <h2>Music</h2>
      <p>
        {TRACKS.map((t) => `"${t}"`).join(', ')} by Kevin MacLeod (
        <a href="https://incompetech.com">incompetech.com</a>). Licensed under Creative Commons: By
        Attribution 4.0 License —{' '}
        <a href="https://creativecommons.org/licenses/by/4.0/">
          creativecommons.org/licenses/by/4.0
        </a>
        .
      </p>

      <h2>Photos</h2>
      <p>The photos in each film are credited on that neighbourhood&apos;s page.</p>
    </LegalLayout>
  );
}
