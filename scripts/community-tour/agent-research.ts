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
 *   CLAUDE_CLI_MAX_TURNS (default 20), CODEX_MAX_TURNS (unused — codex CLI
 *   has no max-turns flag; total time is capped by the 15min execFile timeout)
 */

import { execFile } from 'node:child_process';
import { loadEnv } from '../seedance-worker/loadEnv.js';
import { buildResearchPrompt } from '../../apps/web/lib/ai/community-tour-prompt.js';
import { extractJsonObject } from '../../apps/web/lib/utils/extract-json.js';
import { createServiceClient } from '../../apps/web/lib/supabase/server.js';

loadEnv();

const REPO_ROOT = new URL('../../', import.meta.url).pathname;
/** Neutral cwd for claude chat-mode — no repo CLAUDE.md/skills/MCP pickup. */
const CHAT_DIR = process.env.HOME ? `${process.env.HOME}/chat` : '/tmp';

function log(...args: unknown[]) {
  console.log(new Date().toISOString(), ...args);
}

/** Map execFile error codes to a human-readable failure label. */
function errLabel(e: { code?: string | number }): string {
  switch (e.code) {
    case 'ETIMEDOUT':
      return 'timeout';
    case 'ENOENT':
      return 'cli_not_found';
    default:
      return `error_${String(e.code ?? 'unknown')}`;
  }
}

async function runAgent(
  agent: 'claude' | 'codex',
  prompt: string,
): Promise<{
  ok: boolean;
  raw: string;
  error?: string;
  usage?: { input_tokens?: number; output_tokens?: number; total_cost_usd?: number };
}> {
  const maxTurns = Number(process.env.CLAUDE_CLI_MAX_TURNS ?? 20);
  try {
    if (agent === 'claude') {
      // Pro OAuth. Chat-mode research (owner 2026-08-16): cwd=~/chat avoids
      // repo CLAUDE.md/skills/MCP discovery; --disallowedTools physically
      // removes Edit/Write/Bash/NotebookEdit so it can only answer (WebSearch/
      // WebFetch stay — that's the research task). --bare would skip auth
      // (apiKeySource:none), so we don't use it. stream-json --verbose emits
      // a `result` event with usage+cost.
      const { stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
        const child = execFile(
          'claude',
          [
            '-p',
            prompt,
            '--allowedTools',
            'WebSearch,WebFetch',
            '--disallowedTools',
            'Edit,Write,Bash,NotebookEdit',
            '--max-turns',
            maxTurns.toString(),
            '--output-format',
            'stream-json',
            '--verbose',
          ],
          { timeout: 15 * 60_000, maxBuffer: 8 * 1024 * 1024, cwd: CHAT_DIR },
          (err, stdout) => {
            if (err) reject(err);
            else resolve({ stdout });
          },
        );
        child.stdin?.end();
      });
      const usage = extractUsage(stdout, 'claude');
      return { ok: true, raw: stdout, usage };
    }
    // codex: needs a git repo; scratch dir is fine. danger-full-access because
    // the Hermes gateway context breaks bubblewrap (see codex skill).
    // Chat-mode preamble: answer directly, no repo/file/command side effects;
    // web search IS allowed (that's the research task).
    const CHAT_MODE = [
      '进入对话模式。默认直接回答我的问题，不读取项目文件、不运行命令、不修改文件、不创建计划；可以用 web 搜索获取信息。回答自然、简洁，保留上下文；信息不足时先问我一个关键问题。',
    ].join('\n');
    const { stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
      const child = execFile(
        'codex',
        [
          'exec',
          '--json',
          '--skip-git-repo-check',
          '--sandbox',
          'danger-full-access',
          `${CHAT_MODE}\n\nSearch the web and return JSON only. ${prompt}`,
        ],
        { timeout: 15 * 60_000, maxBuffer: 8 * 1024 * 1024, cwd: CHAT_DIR },
        (err, stdout) => {
          if (err) reject(err);
          else resolve({ stdout });
        },
      );
      child.stdin?.end();
    });
    const usage = extractUsage(stdout, 'codex');
    return { ok: true, raw: stdout, usage };
  } catch (err) {
    const e = err as { message?: string; stderr?: string; code?: string | number };
    return {
      ok: false,
      raw: '',
      error: `${errLabel(e)}: ${(e.stderr ?? e.message ?? String(err)).slice(0, 500)}`,
    };
  }
}

/** Pull token/cost numbers out of the CLI's JSONL event stream. */
function extractUsage(
  stdout: string,
  agent: 'claude' | 'codex',
): { input_tokens?: number; output_tokens?: number; total_cost_usd?: number } | undefined {
  let lastUsage: Record<string, unknown> | undefined;
  let lastCost: number | undefined;
  for (const line of stdout.split('\n')) {
    if (!line.trim() || !line.trim().startsWith('{')) continue;
    try {
      const ev = JSON.parse(line);
      if (agent === 'claude' && ev.type === 'result' && ev.usage) {
        lastUsage = ev.usage as Record<string, unknown>;
        lastCost = ev.total_cost_usd;
      }
      if (agent === 'codex' && ev.type === 'turn.completed' && ev.usage) {
        lastUsage = ev.usage as Record<string, unknown>;
      }
    } catch {
      // not JSON — skip
    }
  }
  if (!lastUsage) return undefined;
  return {
    input_tokens: (lastUsage.input_tokens as number | undefined) ?? 0,
    output_tokens: (lastUsage.output_tokens as number | undefined) ?? 0,
    total_cost_usd: lastCost,
  };
}

/**
 * Extract the agent's final answer text from the JSONL event stream, so the
 * stored raw is the actual JSON the prompt asked for, not CLI plumbing.
 */
function extractAnswerText(stdout: string, agent: 'claude' | 'codex'): string {
  const parts: string[] = [];
  for (const line of stdout.split('\n')) {
    if (!line.trim() || !line.trim().startsWith('{')) continue;
    try {
      const ev = JSON.parse(line);
      if (agent === 'claude' && ev.type === 'assistant') {
        for (const c of ev.message?.content ?? []) {
          if (c.type === 'text') parts.push(c.text ?? '');
        }
      }
      if (agent === 'codex' && ev.type === 'item.completed' && ev.item?.type === 'agent_message') {
        parts.push(ev.item.text ?? '');
      }
    } catch {
      // not JSON — skip
    }
  }
  return parts.join('\n');
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
  const reportAgent = (agent: 'claude' | 'codex', ok: boolean, error?: string) => {
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

  let claudeRes: Awaited<ReturnType<typeof runAgent>>;
  let codexRes: Awaited<ReturnType<typeof runAgent>>;
  try {
    [claudeRes, codexRes] = await Promise.all([
      runAgent('claude', prompt).then((r) => {
        reportAgent('claude', r.ok, r.error);
        return r;
      }),
      runAgent('codex', prompt).then((r) => {
        reportAgent('codex', r.ok, r.error);
        return r;
      }),
    ]);
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

  // Both agents failed (e.g. both timed out): persist a failed state so the
  // admin UI stops polling instead of spinning forever on "researching".
  if (!claudeRes.ok && !codexRes.ok) {
    queueProgress({
      research_progress: {
        status: 'failed',
        started_at: startedAt,
        agents_done: [...agentsDone],
        error: `both agents failed — claude: ${claudeRes.error} · codex: ${codexRes.error}`,
      },
    });
    console.error('agent-research: both agents failed — no result persisted');
    process.exit(1);
  }

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
        raw: claudeRes.ok
          ? extractAnswerText(claudeRes.raw, 'claude').slice(0, 20_000)
          : null,
        parsed: parseResearch(extractAnswerText(claudeRes.raw, 'claude')),
        error: claudeRes.error ?? null,
        usage: claudeRes.usage ?? null,
      },
      codex: {
        ok: codexRes.ok,
        raw: codexRes.ok ? extractAnswerText(codexRes.raw, 'codex').slice(0, 20_000) : null,
        parsed: parseResearch(extractAnswerText(codexRes.raw, 'codex')),
        error: codexRes.error ?? null,
        usage: codexRes.usage ?? null,
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
