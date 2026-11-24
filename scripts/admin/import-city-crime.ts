/**
 * Reads each city's violent-crime rate for the last full year from the FBI's
 * Crime Data Explorer and writes `apps/web/lib/cities/city-crime.json` for the
 * city page's Safety tile (phase385).
 *
 * The owner's ruling, 2026-11-24, after two earlier ones that kept crime off
 * the page: "只看暴力犯罪 只定性 上链接 不显示具体数量" — violent crime only,
 * said in words against Georgia's rate, with a link to the source, and no
 * count on the page. The rates are kept in the file so the wording can be
 * checked; `apps/web/lib/cities/links.ts` sends the app the words only.
 *
 * One figure per city, from the city's own police department. A city without
 * one (Buford and Sugar Hill are policed by their county) or whose department
 * does not report in this format (Cumming) gets no entry, and its page no
 * crime row — a county's figure is not the city's. Never per community.
 *
 *   pnpm --filter @percho/web city:crime
 *
 * Free. `DATA_GOV_API_KEY` (api.data.gov) is optional: without it the public
 * DEMO_KEY is used, which allows about ten requests an hour — enough for the
 * cities below, once.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const FILE = join(here, '../../apps/web/lib/cities/city-crime.json');
const API = 'https://api.usa.gov/crime/fbi/cde/summarized/agency';
const STATE = 'Georgia';

/** Each city's own police department, by its FBI identifier (ORI). */
const AGENCIES: Record<string, string> = {
  'alpharetta-ga': 'GA0600400',
  'duluth-ga': 'GA0670500',
  'johns-creek-ga': 'GA0605800',
  'suwanee-ga': 'GA0670900',
};

type Monthly = Record<string, number | null>;

async function main() {
  const envPath = new URL('../../.env.local', import.meta.url);
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m?.[1] && m[2] !== undefined && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  }
  const key = process.env.DATA_GOV_API_KEY ?? 'DEMO_KEY';
  const year = Number(process.argv[2]) || new Date().getUTCFullYear() - 1;
  const cities: Record<
    string,
    { agency: string; year: number; violentPer100k: number; statePer100k: number }
  > = {};
  for (const [slug, ori] of Object.entries(AGENCIES).sort(([a], [b]) => a.localeCompare(b))) {
    const res = await fetch(
      `${API}/${ori}/violent-crime?from=01-${year}&to=12-${year}&API_KEY=${key}`,
    );
    if (!res.ok) throw new Error(`FBI ${res.status} for ${slug}`);
    const body = (await res.json()) as { offenses?: { rates?: Record<string, Monthly> } };
    const rates = body.offenses?.rates ?? {};
    const yearOf = (name: string | undefined) => {
      const months = Object.values((name && rates[name]) || {});
      // A year with a month missing is not a year's rate.
      return months.length === 12 && months.every((v) => typeof v === 'number')
        ? Math.round(months.reduce<number>((sum, v) => sum + (v ?? 0), 0))
        : null;
    };
    const own = Object.keys(rates).find(
      (k) => k.endsWith(' Offenses') && !k.startsWith(STATE) && !k.startsWith('United States'),
    );
    const city = yearOf(own);
    const state = yearOf(`${STATE} Offenses`);
    if (!own || city === null || state === null) {
      console.warn(`  ${slug}: no full year of figures — left out`);
      continue;
    }
    cities[slug] = {
      agency: own.replace(/ Offenses$/, ''),
      year,
      violentPer100k: city,
      statePer100k: state,
    };
    console.log(`  ${slug}: ${city} per 100k (${STATE} ${state}) — ${cities[slug]?.agency}`);
  }
  writeFileSync(
    FILE,
    `${JSON.stringify({ asOf: new Date().toISOString().slice(0, 10), against: STATE, cities }, null, 2)}\n`,
  );
  console.log(`Wrote ${Object.keys(cities).length} cities to ${FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
