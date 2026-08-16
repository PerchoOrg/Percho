/**
 * Dual-agent community research — LOCAL DEV ONLY.
 *
 * Runs the same generic prompt through claude code and codex CLIs
 * independently (they must not see each other's output), then writes both
 * JSON results to a single `step_results.agent_research` blob for the admin
 * UI to render and the resolve step to consume.
 *
 * Why local: both CLIs run on this host (claude Pro OAuth + codex OAuth),
 * not on Vercel. The API route that triggers this step is expected to run
 * under `pnpm web:dev` on the Mac; on Vercel it returns a clear error.
 *
 * Usage:
 *   pnpm --filter @percho/web community-tour-agent <communityId> <runId>
 *
 * Env (repo-root .env.local, loaded like the seedance worker):
 *   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  (worker uses NEXT_PUBLIC_…)
 *   CLAUDE_CLI_MAX_TURNS (default 8), CODEX_MAX_TURNS (default 8)
 */

import { execFile } from 'node:child_process';
import { loadEnv } from '../seedance-worker/loadEnv.js';
import { buildResearchPrompt } from '../../apps/web/lib/ai/community-tour-prompt.js';
import { extractJsonObject } from '../../apps/web/lib/utils/extract-json.js';
import { createServiceClient } from '../../apps/web/lib/supabase/server.js';

loadEnv();

const REPO_ROOT = new URL('../../', import.meta.url).pathname;

function log(...args: unknown[]) {
  console.log(new Date().toISOString(), ...args);
}

async function runAgent(
  agent: 'claude' | 'codex',
  prompt: string,
): Promise<{ ok: boolean; raw: string; error?: string }> {
  const maxTurns = Number(process.env[`${agent.toUpperCase()}_MAX_TURNS`] ?? 4);
  try {
    if (agent === 'claude') {
      // Pro OAuth; print mode skips dialogs. NO web tools — claude must
      // answer from its own knowledge in ~30-60s. codex does the deep web
      // research; claude provides a fast second perspective. max-turns 1 so
      // it can't loop.
      const { stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
        const child = execFile(
          'claude',
          ['-p', prompt, '--max-turns', '1'],
          { timeout: 60_000, maxBuffer: 8 * 1024 * 1024, cwd: REPO_ROOT },
          (err, stdout) => {
            if (err) reject(err);
            else resolve({ stdout });
          },
        );
        child.stdin?.end();
      });
      return { ok: true, raw: stdout };
    }
    // codex: needs a git repo; scratch dir is fine. danger-full-access because
    // the Hermes gateway context breaks bubblewrap (see codex skill).
    const { stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
      const child = execFile(
        'codex',
        [
          'exec',
          '--sandbox',
          'danger-full-access',
          `Search the web and return JSON only. ${prompt}`,
        ],
        { timeout: 5 * 60_000, maxBuffer: 8 * 1024 * 1024, cwd: REPO_ROOT },
        (err, stdout) => {
          if (err) reject(err);
          else resolve({ stdout });
        },
      );
      child.stdin?.end();
    });
    return { ok: true, raw: stdout };
  } catch (err) {
    const e = err as { message?: string; stderr?: string };
    return { ok: false, raw: '', error: (e.stderr ?? e.message ?? String(err)).slice(0, 500) };
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

  const [claudeRes, codexRes] = await Promise.all([
    runAgent('claude', prompt),
    runAgent('codex', prompt),
  ]);

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
    agents: {
      claude: {
        ok: claudeRes.ok,
        raw: claudeRes.ok ? claudeRes.raw.slice(0, 20_000) : null,
        parsed: parseResearch(claudeRes.raw),
        error: claudeRes.error ?? null,
      },
      codex: {
        ok: codexRes.ok,
        raw: codexRes.ok ? codexRes.raw.slice(0, 20_000) : null,
        parsed: parseResearch(codexRes.raw),
        error: codexRes.error ?? null,
      },
    },
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
    claude: claudeRes.ok ? 'ok' : 'fail',
    codex: codexRes.ok ? 'ok' : 'fail',
  });
}

main().catch((err) => {
  console.error('agent-research failed:', err);
  process.exit(1);
});
