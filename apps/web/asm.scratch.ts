import { createClient } from '@supabase/supabase-js';
const RUN = '7d240cc4-20be-478c-83f2-3a2368aae006';
async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: run } = await sb.from('community_tour_runs').select('*').eq('id', RUN).single();
  const { runAssemble } = await import('@/lib/poi/tour-steps/assemble');
  const r: any = await runAssemble(sb as any, run as any, undefined, undefined, true);
  console.log('approved:', r?.approved, '| clips:', (r?.ordered ?? []).length);
}
main().catch((e) => { console.error(e); process.exit(1); });
