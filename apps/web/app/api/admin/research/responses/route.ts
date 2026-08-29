/**
 * GET /api/admin/research/responses?study=…&format=json|csv — export the
 * questionnaire answers for analysis. Admin-gated (`requireAdmin`) because
 * `contact` is the one PII column; reads use the service role since the
 * table has no select policy.
 *
 * CSV flattens `answers` to one column per question id; a multi-choice answer
 * is joined with `|`.
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import { createServiceClient } from '@/lib/supabase/server';
import { RESEARCH_STUDIES } from '@/lib/zod/research-response';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface ResponseRow {
  id: string;
  study: string;
  lang: string;
  answers: Record<string, string | string[] | number>;
  contact: string | null;
  duration_ms: number | null;
  user_agent: string | null;
  created_at: string;
}

function csvCell(v: unknown): string {
  const s = Array.isArray(v) ? v.join('|') : v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const study = url.searchParams.get('study') ?? RESEARCH_STUDIES[0];
  const format = url.searchParams.get('format') === 'csv' ? 'csv' : 'json';

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('research_responses')
    .select('id, study, lang, answers, contact, duration_ms, user_agent, created_at')
    .eq('study', study)
    .order('created_at', { ascending: false })
    .limit(5000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as ResponseRow[];

  if (format === 'json') return NextResponse.json({ study, count: rows.length, rows });

  const keys = [...new Set(rows.flatMap((r) => Object.keys(r.answers)))].sort();
  const header = ['id', 'created_at', 'lang', 'duration_ms', 'contact', ...keys];
  const lines = [
    header.join(','),
    ...rows.map((r) =>
      [r.id, r.created_at, r.lang, r.duration_ms, r.contact, ...keys.map((k) => r.answers[k])]
        .map(csvCell)
        .join(','),
    ),
  ];
  return new NextResponse(`${lines.join('\n')}\n`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${study}.csv"`,
    },
  });
}
