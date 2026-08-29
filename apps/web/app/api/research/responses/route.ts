/**
 * POST /api/research/responses — a buyer submits a customer-study questionnaire.
 *
 * Anonymous by design (the study page has no login), so the insert runs with
 * the ANON key and is admitted by `research_responses`'s insert-only policy —
 * no service role on a public route. Input is validated with zod, capped at
 * 32 KB, and a honeypot field rejects the crudest bots. CORS is open because
 * the same page is also served from a claude.ai artifact.
 */

import { createAnonClient } from '@/lib/supabase/server';
import { researchResponseSchema } from '@/lib/zod/research-response';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 32 * 1024;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'too large' }, { status: 413, headers: cors });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400, headers: cors });
  }
  const parsed = researchResponseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid', issues: parsed.error.issues.map((i) => i.path.join('.')) },
      { status: 400, headers: cors },
    );
  }
  const { study, lang, answers, contact, durationMs } = parsed.data;
  const supabase = createAnonClient();
  const { data, error } = await supabase
    .from('research_responses')
    .insert({
      study,
      lang,
      answers,
      contact: contact && contact.length > 0 ? contact : null,
      duration_ms: durationMs ?? null,
      user_agent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
    })
    .select('id')
    .single();
  if (error) {
    return NextResponse.json({ error: 'could not save' }, { status: 500, headers: cors });
  }
  return NextResponse.json({ ok: true, id: data.id }, { status: 201, headers: cors });
}
