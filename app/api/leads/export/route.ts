/**
 * GET /api/leads/export — CSV download of the agent's leads.
 *
 * Phase 18. RLS scopes the result to the calling agent's leads. Exported
 * columns: created_at (ISO), name, email, phone, listing_address, city,
 * state, message, source, email_status (sent/pending), follow_up_status.
 *
 * No pagination — Vivian-scale (single agent's leads) easily fits one
 * response. If we ever multi-tenant, switch to streaming.
 */

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type Row = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  message: string | null;
  source: string | null;
  notified_at: string | null;
  followed_up_at: string | null;
  created_at: string;
  community_id: string | null;
  listings: { address: string | null; city: string | null; state: string | null } | null;
  communities: { name: string | null } | null;
};

function csvEscape(v: string | null | undefined): string {
  if (v == null) return '';
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data } = (await (supabase as any)
    .from('leads')
    .select(
      'id, name, email, phone, message, source, notified_at, followed_up_at, created_at, community_id, listings(address, city, state), communities(name)',
    )
    .order('created_at', { ascending: false })) as { data: Row[] | null };

  const rows = data ?? [];
  const header = [
    'created_at',
    'name',
    'email',
    'phone',
    'kind',
    'listing_address',
    'city',
    'state',
    'community',
    'message',
    'source',
    'email_status',
    'follow_up_status',
    'followed_up_at',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    const kind = r.community_id ? 'community' : 'listing';
    lines.push(
      [
        r.created_at,
        r.name,
        r.email ?? '',
        r.phone ?? '',
        kind,
        r.listings?.address ?? '',
        r.listings?.city ?? '',
        r.listings?.state ?? '',
        r.communities?.name ?? '',
        r.message ?? '',
        r.source ?? '',
        r.notified_at ? 'sent' : 'pending',
        r.followed_up_at ? 'followed_up' : 'open',
        r.followed_up_at ?? '',
      ]
        .map(csvEscape)
        .join(','),
    );
  }
  const csv = `${lines.join('\r\n')}\r\n`;

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="percho-leads-${stamp}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
