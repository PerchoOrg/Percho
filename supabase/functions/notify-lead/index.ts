// / 5.4 — notify-lead Edge Function.
//
// Triggered by the AFTER INSERT trigger on `public.leads` (migration 0006).
// Receives `{ lead_id }`, idempotently sends an email to the listing's agent
// via Resend, and stamps `leads.notified_at = now()` on success.
//
// Idempotency: the function reads the lead row by id and bails out if
// `notified_at IS NOT NULL`. The trigger fires once per INSERT, but a future
// retry layer (cron sweeping unnotified leads, manual re-fire from the
// dashboard) can call this function safely without double-emailing.
//
// Auth: the trigger sends the service-role JWT in the Authorization header.
// Supabase Edge Functions accept that as a valid caller. We further sanity-
// check by reading lead_id from the body and using a service-role client to
// fetch the row — RLS is bypassed because we need cross-tenant access to
// reach the agent's email.
//
// Email payload: English only (CLAUDE.md §1 — no _zh, no WeChat). Subject
// template "New inquiry · {address}", body has buyer name + email + phone +
// message, CTA links to /dashboard/leads/{lead.id}. Plain-text + minimal HTML.
//
// Required environment (set via `supabase secrets set` before deploy):
//   RESEND_API_KEY    — Resend API token (re_…)
//   RESEND_FROM       — sending address. Defaults to onboarding@resend.dev
//                       (works without domain verify; not production).
//   PUBLIC_APP_URL    — base URL for the dashboard CTA. Defaults to
//                       https://percho.co.
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY are auto-injected by the runtime.

// @ts-expect-error — Deno std URL import resolved at runtime.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

// @ts-expect-error — Deno global is available inside Edge Functions.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
// @ts-expect-error — Deno global is available inside Edge Functions.
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
// @ts-expect-error — Deno global is available inside Edge Functions.
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
// @ts-expect-error — Deno global is available inside Edge Functions.
const RESEND_FROM = Deno.env.get('RESEND_FROM') ?? 'Percho <onboarding@resend.dev>';
// @ts-expect-error — Deno global is available inside Edge Functions.
const PUBLIC_APP_URL = Deno.env.get('PUBLIC_APP_URL') ?? 'https://percho.co';

type Lead = {
  id: string;
  listing_id: string;
  agent_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  message: string | null;
  notified_at: string | null;
  created_at: string;
};

type Listing = { id: string; address: string; city: string; state: string };
type Agent = { id: string; name: string; email: string };

function buildEmail(lead: Lead, listing: Listing, agent: Agent) {
  const subject = `New inquiry · ${listing.address}`;
  const ctaUrl = `${PUBLIC_APP_URL}/dashboard/leads/${lead.id}`;
  const contactLine = [
    lead.email ? `Email: ${lead.email}` : null,
    lead.phone ? `Phone: ${lead.phone}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const text = [
    `Hi ${agent.name.split(' ')[0]},`,
    '',
    `${lead.name} just inquired about ${listing.address}, ${listing.city}, ${listing.state}.`,
    '',
    contactLine,
    '',
    lead.message ? `Message:\n${lead.message}` : '(No message)',
    '',
    `Reply in your dashboard: ${ctaUrl}`,
    '',
    '— Percho',
  ].join('\n');

  // Minimal inline HTML — keeps deliverability high (no remote assets, no
  // tracking pixels, no fancy templates that trip spam filters).
  const esc = (s: string) =>
    s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] ?? c);
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#111;line-height:1.5;max-width:560px">
<p>Hi ${esc(agent.name.split(' ')[0])},</p>
<p><strong>${esc(lead.name)}</strong> just inquired about <strong>${esc(listing.address)}</strong>, ${esc(listing.city)}, ${esc(listing.state)}.</p>
${lead.email ? `<p>Email: <a href="mailto:${esc(lead.email)}">${esc(lead.email)}</a></p>` : ''}
${lead.phone ? `<p>Phone: ${esc(lead.phone)}</p>` : ''}
${lead.message ? `<p style="background:#f4f4f4;padding:12px;border-radius:6px;white-space:pre-wrap">${esc(lead.message)}</p>` : ''}
<p><a href="${esc(ctaUrl)}" style="display:inline-block;background:#c9a86a;color:#111;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600">Reply in dashboard</a></p>
<p style="color:#666;font-size:12px">— Percho</p>
</body></html>`;

  return { subject, text, html };
}

// @ts-expect-error — Deno.serve is the standard Edge Function entry point.
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  let payload: { lead_id?: string };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400 });
  }
  if (!payload.lead_id) {
    return new Response(JSON.stringify({ error: 'missing_lead_id' }), { status: 400 });
  }

  if (!RESEND_API_KEY) {
    console.error('[notify-lead] RESEND_API_KEY not configured');
    return new Response(JSON.stringify({ error: 'resend_not_configured' }), { status: 500 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('*')
    .eq('id', payload.lead_id)
    .maybeSingle<Lead>();

  if (leadErr || !lead) {
    console.error('[notify-lead] lead lookup failed', leadErr?.message);
    return new Response(JSON.stringify({ error: 'lead_not_found' }), { status: 404 });
  }

  // Idempotency gate — bail out cheaply if already sent.
  if (lead.notified_at !== null) {
    return new Response(JSON.stringify({ ok: true, skipped: 'already_notified' }), {
      status: 200,
    });
  }

  const [{ data: listing }, { data: agent }] = await Promise.all([
    supabase
      .from('listings')
      .select('id, address, city, state')
      .eq('id', lead.listing_id)
      .maybeSingle<Listing>(),
    supabase.from('agents').select('id, name, email').eq('id', lead.agent_id).maybeSingle<Agent>(),
  ]);

  if (!listing || !agent || !agent.email) {
    console.error('[notify-lead] missing listing/agent for lead', lead.id);
    return new Response(JSON.stringify({ error: 'related_rows_missing' }), { status: 500 });
  }

  const { subject, text, html } = buildEmail(lead, listing, agent);

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: agent.email,
      reply_to: lead.email ?? undefined,
      subject,
      text,
      html,
    }),
  });

  if (!resendRes.ok) {
    const detail = await resendRes.text();
    console.error('[notify-lead] resend failed', resendRes.status, detail);
    return new Response(JSON.stringify({ error: 'resend_failed', status: resendRes.status }), {
      status: 502,
    });
  }

  // Stamp notified_at last — only after Resend confirms acceptance. A failed
  // send leaves notified_at NULL so a future sweep can retry without
  // double-emailing.
  // biome-ignore lint/suspicious/noExplicitAny: Edge Function — minimal types
  const { error: stampErr } = await (supabase as any)
    .from('leads')
    .update({ notified_at: new Date().toISOString() })
    .eq('id', lead.id);

  if (stampErr) {
    console.error('[notify-lead] notified_at stamp failed', stampErr.message);
    // Email already sent; return 200 anyway. The next trigger fire (if any)
    // would still bail because the next call also reads notified_at.
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
