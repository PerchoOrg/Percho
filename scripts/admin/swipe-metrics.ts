// Right-swipe rate over the mobile feed — the recommendation work's north-star
// metric (phase303). Read-only.
//
// Usage (from apps/web, env from repo-root .env.local):
//   pnpm exec tsx ../../scripts/admin/swipe-metrics.ts [--days 14]
//
// Prints, per day and in total: swipes, right-swipe rate, split by card type,
// and distinct installs — enough to see whether a ranking change moved the
// number, without pretending to be an experiment framework.
import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// Same hand-rolled loader as delete-non-video-listings.ts — `dotenv` is not
// resolvable from scripts/ in this workspace.
function loadEnv(): { url: string; key: string } {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const envKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (envUrl && envKey) return { url: envUrl, key: envKey };
  for (const p of ['../../.env.local', '.env.local']) {
    if (!existsSync(p)) continue;
    const text = readFileSync(p, 'utf8');
    const get = (name: string) =>
      text
        .match(new RegExp(`^${name}=(.+)$`, 'm'))?.[1]
        ?.trim()
        .replace(/^"|"$/g, '');
    const url = get('NEXT_PUBLIC_SUPABASE_URL');
    const key = get('SUPABASE_SERVICE_ROLE_KEY');
    if (url && key) return { url, key };
  }
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not found in .env.local');
  process.exit(1);
}

const { url, key } = loadEnv();
const sb = createClient(url, key, { auth: { persistSession: false } });

const daysArg = process.argv.indexOf('--days');
const days = daysArg >= 0 ? Number(process.argv[daysArg + 1]) : 14;
if (!Number.isFinite(days) || days <= 0) throw new Error('--days must be a positive number');

interface SwipeRow {
  at: string;
  install_id: string;
  card_type: string | null;
  verdict: string | null;
}

// PostgREST caps every read at 1000 rows regardless of .range() — page
// explicitly or ship a biased sample.
async function fetchSwipes(sinceIso: string): Promise<SwipeRow[]> {
  const out: SwipeRow[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await sb
      .from('mobile_events')
      .select('at, install_id, card_type, verdict')
      .eq('type', 'swipe')
      .gte('at', sinceIso)
      .order('at', { ascending: true })
      .range(from, from + page - 1);
    if (error) throw new Error(`mobile_events read failed: ${error.message}`);
    out.push(...((data ?? []) as SwipeRow[]));
    if (!data || data.length < page) return out;
  }
}

interface Tally {
  swipes: number;
  rights: number;
  byType: Map<string, { swipes: number; rights: number }>;
  installs: Set<string>;
}

const emptyTally = (): Tally => ({
  swipes: 0,
  rights: 0,
  byType: new Map(),
  installs: new Set(),
});

function add(t: Tally, row: SwipeRow): void {
  const type = row.card_type ?? 'unknown';
  const right = row.verdict === 'R';
  t.swipes += 1;
  if (right) t.rights += 1;
  const bt = t.byType.get(type) ?? { swipes: 0, rights: 0 };
  bt.swipes += 1;
  if (right) bt.rights += 1;
  t.byType.set(type, bt);
  t.installs.add(row.install_id);
}

const pct = (rights: number, swipes: number): string =>
  swipes === 0 ? '—' : `${((100 * rights) / swipes).toFixed(1)}%`;

async function main(): Promise<void> {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);
  const rows = await fetchSwipes(since.toISOString());

  const perDay = new Map<string, Tally>();
  const total = emptyTally();
  for (const row of rows) {
    const day = row.at.slice(0, 10);
    const t = perDay.get(day) ?? emptyTally();
    add(t, row);
    perDay.set(day, t);
    add(total, row);
  }

  console.warn(`Swipes over the last ${days} days (${rows.length} rows)\n`);
  for (const day of [...perDay.keys()].sort()) {
    const t = perDay.get(day) as Tally;
    const types = [...t.byType.entries()]
      .sort((a, b) => b[1].swipes - a[1].swipes)
      .map(([k, v]) => `${k} ${pct(v.rights, v.swipes)} (${v.swipes})`)
      .join('  ');
    console.warn(
      `${day}  swipes ${String(t.swipes).padStart(5)}  right ${pct(t.rights, t.swipes).padStart(6)}  installs ${t.installs.size}  ·  ${types}`,
    );
  }
  console.warn(
    `\nTOTAL       swipes ${String(total.swipes).padStart(5)}  right ${pct(total.rights, total.swipes).padStart(6)}  installs ${total.installs.size}`,
  );
  for (const [type, v] of [...total.byType.entries()].sort((a, b) => b[1].swipes - a[1].swipes)) {
    console.warn(
      `  ${type.padEnd(10)} right ${pct(v.rights, v.swipes).padStart(6)}  of ${v.swipes}`,
    );
  }
}

void main();
