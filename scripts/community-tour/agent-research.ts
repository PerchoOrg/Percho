/**
 * Dual-agent community research via Gemini Grounding with Google Search.
 *
 * Runs the same research prompt through two Gemini calls (gemini_a / gemini_b,
 * slightly different tempering so they diverge), each with Google Search
 * grounding so every POI is backed by a real source. Writes both JSON results
 * to a single `step_results.agent_research` blob for the admin UI to render
 * and the resolve step to consume.
 *
 * Replaces the claude/codex CLI path (owner 2026-08-16): the CLIs' OAuth
 * sessions/tool permissions were flaky and they cost real money; Gemini
 * grounding is a plain HTTP call with per-call usage metadata.
 *
 * Usage:
 *   pnpm --filter @percho/web community-tour-agent <communityId> <runId>
 *
 * Env (repo-root .env.local, loaded like the seedance worker):
 *   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  (worker uses NEXT_PUBLIC_…)
 *   GEMINI_API_KEY / GEMINI_MODEL             (default gemini-3.1-flash-lite)
 */

import { loadEnv } from '../seedance-worker/loadEnv.js';
import { buildResearchPrompt } from '../../apps/web/lib/ai/community-tour-prompt.js';
import { extractJsonObject } from '../../apps/web/lib/utils/extract-json.js';
import { createServiceClient } from '../../apps/web/lib/supabase/server.js';

loadEnv();

function log(...args: unknown[]) {
  console.log(new Date().toISOString(), ...args);
}

const GEMINI_API_BASE =
  'https://generativelanguage.googleapis.com/v1beta/models';

function geminiModel(): string {
  return process.env.GEMINI_MODEL ?? 'gemini-3.1-flash-lite';
}

function geminiApiKey(): string {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error('GEMINI_API_KEY not set');
  return k;
}

async function callGemini(opts: {
  prompt: string;
  temperature: number;
  maxOutputTokens: number;
}): Promise<{
  ok: boolean;
  text: string;
  error?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  sources?: string[];
}> {
  try {
    const url = `${GEMINI_API_BASE}/${geminiModel()}:generateContent`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'x-goog-api-key': geminiApiKey(),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: {
          temperature: opts.temperature,
          maxOutputTokens: opts.maxOutputTokens,
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, text: '', error: `Gemini HTTP ${res.status}: ${body.slice(0, 400)}` };
    }
    const data = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: { text?: string }[] };
        groundingMetadata?: {
          groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
        };
      }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const cand = data.candidates?.[0];
    const text = cand?.content?.parts?.find((p) => p.text)?.text ?? '';
    if (!text) {
      return { ok: false, text: '', error: 'Gemini returned no text content' };
    }
    const sources = (cand?.groundingMetadata?.groundingChunks ?? [])
      .map((c) => c.web?.uri)
      .filter((u): u is string => !!u)
      .slice(0, 20);
    return {
      ok: true,
      text,
      usage: {
        input_tokens: data.usageMetadata?.promptTokenCount ?? 0,
        output_tokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      },
      sources,
    };
  } catch (err) {
    return {
      ok: false,
      text: '',
      error: (err as Error).message.slice(0, 500),
    };
  }
}

function parseResearch(raw: string): { narrative_angle?: string; pois?: unknown[] } | null {
  const extracted = extractJsonObject(raw);
  if (!extracted) return null;
  try {
    const parsed = JSON.parse(extracted);
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.pois)) {
      return parsed as { narrative_angle?: string; pois?: unknown[] };
    }
    return null;
  } catch {
    return null;
  }
}

async function main() {
  const [communityId, runId] = process.argv.slice(2);
  if (!communityId || !runId) {
    console.error('usage: community-tour-agent <communityId> <runId>');
    process.exit(1);
  }

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const sb: any = createServiceClient();

  const { data: community } = await sb
    .from('communities')
    .select('id, name, city, state, zip, lat, lng')
    .eq('id', communityId)
    .maybeSingle();

  if (!community) {
    console.error('community not found');
    process.exit(1);
  }

  const prompt = buildResearchPrompt(community);
  log('prompt built', community.name);

  // Live progress: write step_results.research_progress as agents run so the
  // admin page can render a "researching" state (the UI polls runs; the
  // final agent_research landing is the done signal). Writes are serialized
  // through a promise chain so the read-modify-write on step_results can't
  // clobber itself.
  const startedAt = new Date().toISOString();
  const agentsDone: string[] = [];
  let progressChain: Promise<unknown> = Promise.resolve();
  const queueProgress = (patch: Record<string, unknown>) => {
    progressChain = progressChain
      .then(async () => {
        const { data: run } = await sb
          .from('community_tour_runs')
          .select('step_results')
          .eq('id', runId)
          .maybeSingle();
        if (!run) return;
        await sb
          .from('community_tour_runs')
          .update({
            step_results: { ...run.step_results, ...patch },
            updated_at: new Date().toISOString(),
          })
          .eq('id', runId);
      })
      .catch((err: Error) => log('progress write failed (non-fatal):', err.message));
    return progressChain;
  };
  const reportAgent = (agent: 'gemini_a' | 'gemini_b', ok: boolean, error?: string) => {
    agentsDone.push(agent);
    queueProgress({
      research_progress: {
        status: ok ? 'running' : 'failed',
        started_at: startedAt,
        agents_done: [...agentsDone],
        [`${agent}_ok`]: ok,
        error,
      },
    });
  };

  queueProgress({
    research_progress: { status: 'running', started_at: startedAt, agents_done: [] },
  });

  const AGENTS: Array<{
    name: 'gemini_a' | 'gemini_b';
    temperature: number;
  }> = [
    { name: 'gemini_a', temperature: 0.4 },
    { name: 'gemini_b', temperature: 0.9 },
  ];

  let aRes: Awaited<ReturnType<typeof callGemini>>;
  let bRes: Awaited<ReturnType<typeof callGemini>>;
  try {
    [aRes, bRes] = await Promise.all(
      AGENTS.map(({ name, temperature }) =>
        callGemini({
          prompt,
          temperature,
          maxOutputTokens: 8000,
        }).then((r) => {
          reportAgent(name, r.ok, r.error);
          return r;
        }),
      ),
    );
  } catch (err) {
    queueProgress({
      research_progress: {
        status: 'failed',
        started_at: startedAt,
        error: (err as Error).message,
      },
    });
    throw err;
  }

  // Both agents failed: persist a failed state so the admin UI stops polling
  // instead of spinning forever on "researching".
  if (!aRes.ok && !bRes.ok) {
    queueProgress({
      research_progress: {
        status: 'failed',
        started_at: startedAt,
        agents_done: [...agentsDone],
        error: `both agents failed — gemini_a: ${aRes.error} · gemini_b: ${bRes.error}`,
      },
    });
    console.error('agent-research: both agents failed — no result persisted');
    process.exit(1);
  }

  const agents = {
    gemini_a: {
      ok: aRes.ok,
      raw: aRes.ok ? aRes.text.slice(0, 20_000) : null,
      parsed: aRes.ok ? parseResearch(aRes.text) : null,
      error: aRes.error ?? null,
      usage: aRes.usage ?? null,
      sources: aRes.sources ?? [],
    },
    gemini_b: {
      ok: bRes.ok,
      raw: bRes.ok ? bRes.text.slice(0, 20_000) : null,
      parsed: bRes.ok ? parseResearch(bRes.text) : null,
      error: bRes.error ?? null,
      usage: bRes.usage ?? null,
      sources: bRes.sources ?? [],
    },
  };

  const result = {
    community: {
      name: community.name,
      city: community.city,
      state: community.state,
      zip: community.zip,
      lat: community.lat,
      lng: community.lng,
    },
    prompt,
    agents,
  };

  // Persist into the run's step_results so the admin page renders it and the
  // resolve step can consume it without re-running agents.
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: run } = await sb
    .from('community_tour_runs')
    .select('id, step_results')
    .eq('id', runId)
    .maybeSingle();

  if (!run) {
    console.error('run not found', runId);
    process.exit(1);
  }

  const stepResults = { ...run.step_results, agent_research: result };
  await sb
    .from('community_tour_runs')
    .update({ step_results: stepResults, updated_at: new Date().toISOString() })
    .eq('id', runId);

  log('agent research persisted', runId, {
    gemini_a: aRes.ok ? 'ok' : 'fail',
    gemini_b: bRes.ok ? 'ok' : 'fail',
  });
}

main().catch((err) => {
  console.error('agent-research failed:', err);
  process.exit(1);
});
