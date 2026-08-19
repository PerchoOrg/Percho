/**
 * `research` step — dual Gemini grounding calls (gemini_a / gemini_b).
 *
 * Runs INLINE on Vercel: plain HTTP to Gemini, no local CLI. ~5-10s total,
 * comfortably under the platform function timeout.
 */
import { buildResearchPrompt } from '@/lib/ai/community-tour-prompt';
import type { Json } from '@/lib/supabase/database.types';
import { extractJsonObject } from '@/lib/utils/extract-json';
import { type RunRow, type TourDb, asJson, bestEffortWrite, mustWrite } from './shared';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

async function geminiResearch(opts: {
  community: {
    name: string;
    city: string | null;
    state: string | null;
    zip: string | null;
    lat: number | null;
    lng: number | null;
  };
  runId: string;
  sb: TourDb;
}): Promise<{
  ok: boolean;
  text: string;
  error?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}> {
  const model = process.env.GEMINI_MODEL ?? 'gemini-3.5-flash-lite';
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, text: '', error: 'GEMINI_API_KEY not set' };
  const prompt = buildResearchPrompt(opts.community);
  const url = `${GEMINI_API_BASE}/${model}:generateContent`;
  const startedAt = new Date().toISOString();
  const patchProgress = async (patch: Record<string, unknown>) => {
    const { data: run } = await opts.sb
      .from('community_tour_runs')
      .select('step_results')
      .eq('id', opts.runId)
      .maybeSingle();
    if (!run) return;
    // JSONB column — the schema types it as `Json`, which admits primitives
    // and null, so narrow before spreading.
    const existing = (run.step_results ?? {}) as Record<string, Json>;
    await bestEffortWrite(
      'research progress',
      opts.sb
        .from('community_tour_runs')
        .update({
          step_results: asJson({ ...existing, ...patch }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', opts.runId),
    );
  };
  await patchProgress({
    research_progress: { status: 'running', started_at: startedAt, agents_done: [] },
  });

  const AGENTS = [
    { name: 'gemini_a', temperature: 0.4 },
    { name: 'gemini_b', temperature: 0.9 },
  ];
  const results: Record<string, unknown> = {};
  const agentsDone: string[] = [];
  for (const { name, temperature } of AGENTS) {
    let ok = false;
    let text = '';
    let error: string | undefined;
    let usage: { input_tokens?: number; output_tokens?: number } | undefined;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: { temperature, maxOutputTokens: 8000 },
        }),
      });
      if (!res.ok) {
        error = `Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`;
      } else {
        const data = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: { text?: string }[] } }>;
          usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
        };
        text = data.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text ?? '';
        if (!text) error = 'Gemini returned no text content';
        else {
          ok = true;
          usage = {
            input_tokens: data.usageMetadata?.promptTokenCount ?? 0,
            output_tokens: data.usageMetadata?.candidatesTokenCount ?? 0,
          };
        }
      }
    } catch (err) {
      error = (err as Error).message.slice(0, 500);
    }
    agentsDone.push(name);
    await patchProgress({
      research_progress: {
        status: ok ? 'running' : 'failed',
        started_at: startedAt,
        agents_done: [...agentsDone],
        [`${name}_ok`]: ok,
        error,
      },
    });
    results[name] = {
      ok,
      raw: ok ? text.slice(0, 20_000) : null,
      parsed: ok ? parseResearchJson(text) : null,
      error: error ?? null,
      usage: usage ?? null,
    };
  }
  return {
    ok: true,
    text: JSON.stringify(results),
    error: undefined,
  };
}

function parseResearchJson(raw: string): { narrative_angle?: string; pois?: unknown[] } | null {
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

export async function runResearch(
  sb: TourDb,
  run: RunRow,
): Promise<{ ok: boolean; started: boolean; error?: string }> {
  // If a previous run already produced research, reuse it — agents cost money
  // and the admin can re-run explicitly by clearing the step.
  if (run.step_results.agent_research) {
    return { ok: true, started: false };
  }

  const { data: community } = await sb
    .from('communities')
    .select('id, name, city, state, zip, lat, lng')
    .eq('id', run.community_id)
    .maybeSingle();
  if (!community) {
    return { ok: false, started: false, error: 'community not found' };
  }

  const result = await geminiResearch({
    community,
    runId: run.id,
    sb,
  });
  if (!result.ok) {
    return { ok: false, started: false, error: result.error ?? 'research failed' };
  }

  const parsed = JSON.parse(result.text) as Record<string, unknown>;
  const research = {
    community: {
      name: community.name,
      city: community.city,
      state: community.state,
      zip: community.zip,
      lat: community.lat,
      lng: community.lng,
    },
    prompt: buildResearchPrompt(community),
    agents: parsed,
    // Same reason as saveStep's stamp: the panel cannot otherwise tell a fresh
    // result from one produced by an older prompt.
    ran_at: new Date().toISOString(),
  };
  await mustWrite(
    'save agent_research',
    sb
      .from('community_tour_runs')
      .update({
        step_results: asJson({ ...run.step_results, agent_research: research }),
        updated_at: new Date().toISOString(),
      })
      .eq('id', run.id),
  );
  return { ok: true, started: true };
}
