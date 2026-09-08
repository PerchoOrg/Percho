/**
 * Regenerate the `/demos/search-lenses` review page from what actually
 * shipped.
 *
 * The demo was built BEFORE the implementation, with invented figures, and it
 * stayed that way while the real thing overtook it. By phase205 it showed four
 * lenses where production has five, DeKalb's property tax as 1.04% where the
 * GA DOR's own millage gives 1.10%, and no sign of the supplier notes or the
 * per-line estimate flags. The owner reviews remotely by opening that URL, so
 * a stale demo is not a stale mockup — it is a wrong answer to "what did you
 * build".
 *
 * So the page is now GENERATED, and from two things it cannot drift from:
 *
 *   the lens code   `@percho/shared/lenses` — the same catalogue, ramps,
 *                   directions, quantile classing and cost breakdown the
 *                   phone runs. Not a copy of them.
 *   the live API    `percho.co/api/mobile/areas` — the same payload the phone
 *                   receives, with whatever is in `area_metrics` right now.
 *
 * Everything is precomputed here rather than fetched in the browser: the lens
 * catalogue's `compute` is a function and does not survive JSON, and the
 * alternative — reimplementing the maths in the demo's own script — is exactly
 * the second source of truth that let the page go stale in the first place.
 *
 * The page stamps the moment it was generated. A demo that cannot say how old
 * it is invites the reader to assume it is current.
 *
 * Usage:
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/build-lens-demo.ts
 *   AREAS_JSON=/tmp/prod.json pnpm ... (to build from a saved payload)
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
  type Area,
  LENSES,
  REFERENCE_HOME_USD,
  classBreaks,
  colorFor,
  costBreakdown,
  legendRange,
  listOf,
  rankedBy,
} from '../../packages/shared/src/lenses.js';

const API = 'https://www.percho.co/api/mobile/areas';

interface Shape {
  key: string;
  name: string;
  centre: [number, number];
  rings: [number, number][][];
}

async function main() {
  const saved = process.env.AREAS_JSON;
  let payload: string;
  if (saved && existsSync(saved)) {
    console.log(`Reading ${saved}`);
    payload = readFileSync(saved, 'utf8');
  } else {
    console.log(`Fetching ${API}`);
    const res = await fetch(API);
    if (!res.ok) {
      console.error(`${API} returned ${res.status}. Nothing written.`);
      process.exit(1);
    }
    payload = await res.text();
  }
  const { shapes, areas } = JSON.parse(payload) as {
    shapes: Shape[];
    areas: Area[];
  };
  console.log(`${shapes.length} shapes, ${areas.length} areas.`);

  // One entry per lens: everything the page needs to paint and rank it.
  const lenses = LENSES.map((lens) => {
    const breaks = classBreaks(lens, areas);
    const ranked = rankedBy(lens, areas);
    const legend = legendRange(lens, areas);
    return {
      id: lens.id,
      label: lens.label,
      unit: lens.unit,
      caption: lens.caption,
      rankTitle: lens.rankTitle,
      ramp: lens.ramp,
      legend,
      estimatedCount: ranked.filter((r) => r.estimated).length,
      rows: ranked.map((hit) => ({
        key: hit.area.key,
        name: hit.area.name,
        text: lens.format(hit.value),
        color: colorFor(lens, hit.value, breaks),
        estimated: hit.estimated,
      })),
    };
  });

  // One entry per county: the cost sheet exactly as the phone renders it.
  const details = areas.map((area) => {
    const lines = costBreakdown(area) ?? [];
    const estimatedLines = lines
      .filter((l) => l.estimated)
      .map((l) => l.label.toLowerCase());
    const asOf = area.metrics
      .filter((m) => !m.estimated)
      .map((m) => m.asOf)
      .sort()
      .at(-1);
    return {
      key: area.key,
      name: area.name,
      total: lines.reduce((n, l) => n + l.monthlyUsd, 0),
      lines,
      footer:
        estimatedLines.length > 0
          ? `Sourced from public records, except ${listOf(estimatedLines)} — those are still our estimate.${asOf ? ` Most recent data ${asOf}.` : ''}`
          : 'Every figure here is from a public record.',
    };
  });

  const out = {
    generatedAt: new Date().toISOString(),
    referenceHomeUsd: REFERENCE_HOME_USD,
    shapes,
    lenses,
    details,
  };
  const path = new URL(
    '../../apps/web/public/demos/search-lenses/data.js',
    import.meta.url,
  );
  writeFileSync(path, `window.__LENSES__=${JSON.stringify(out)};\n`);

  const bytes = Buffer.byteLength(JSON.stringify(out));
  console.log(`\n${lenses.length} lenses:`);
  for (const l of lenses) {
    console.log(
      `  ${l.label.padEnd(18)} ${String(l.rows.length).padStart(2)} counties · ${String(l.estimatedCount).padStart(2)} estimated · ${l.legend?.low} → ${l.legend?.high}`,
    );
  }
  console.log(`\nWrote data.js, ${(bytes / 1024).toFixed(0)} KB.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
