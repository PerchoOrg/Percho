/**
 * Run one research prompt through the local Codex CLI.
 *
 * Why Codex and not an API: the owner's call (2026-08-29). The job needs a
 * model that will actually search the web thirty-odd times for one address
 * and cite what it opened; Codex with live web search did that better than
 * the Gemini models on this account, and it bills to the existing
 * subscription rather than per call. The cost of that choice is that this is
 * a local subprocess on the Mac mini — it cannot run on Vercel, and it never
 * needs to: research is an offline job, never a request path.
 *
 * Node-only (child_process). Import from scripts, never from a route.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface CodexRunOptions {
  /** Codex model slug. */
  model?: string;
  /** `model_reasoning_effort` — the research quality knob. */
  reasoning?: 'low' | 'medium' | 'high';
  timeoutMs?: number;
  /** Path to the codex binary. Defaults to `$CODEX_BIN`, then `~/.local/bin/codex`, then `codex`. */
  bin?: string;
}

export interface CodexRunResult {
  /** The agent's final message — the JSON the prompt asked for, possibly fenced. */
  text: string;
  model: string;
  reasoning: string;
  /** Parsed from the CLI's progress output; 0 when the CLI printed none. */
  searches: number;
  tokens: number | null;
  seconds: number;
}

export const DEFAULT_CODEX_MODEL = 'gpt-5.6-sol';
export const DEFAULT_CODEX_REASONING = 'medium';

function codexBin(explicit?: string): string {
  if (explicit) return explicit;
  if (process.env.CODEX_BIN) return process.env.CODEX_BIN;
  return process.env.HOME ? join(process.env.HOME, '.local', 'bin', 'codex') : 'codex';
}

/** Pure: pull the two counters the CLI prints to stderr. */
export function parseCodexStderr(stderr: string): { searches: number; tokens: number | null } {
  const searches = (stderr.match(/^web search:/gm) ?? []).length;
  const m = stderr.match(/tokens used\s*\n\s*([\d,]+)/);
  const tokens = m?.[1] ? Number(m[1].replace(/,/g, '')) : null;
  return { searches, tokens: tokens !== null && Number.isFinite(tokens) ? tokens : null };
}

export async function runCodex(
  prompt: string,
  opts: CodexRunOptions = {},
): Promise<CodexRunResult> {
  const model = opts.model ?? DEFAULT_CODEX_MODEL;
  const reasoning = opts.reasoning ?? DEFAULT_CODEX_REASONING;
  const timeoutMs = opts.timeoutMs ?? 15 * 60 * 1000;
  // Ephemeral + read-only + its own empty cwd: the agent can search but has
  // nothing to read or write on this machine, and leaves no session behind.
  const dir = await mkdtemp(join(tmpdir(), 'percho-insights-'));
  const outFile = join(dir, 'last-message.txt');
  const args = [
    'exec',
    '--skip-git-repo-check',
    '--ephemeral',
    '-s',
    'read-only',
    '-c',
    'web_search="live"',
    '-c',
    `model_reasoning_effort="${reasoning}"`,
    '-m',
    model,
    '-o',
    outFile,
    '-',
  ];
  const started = Date.now();
  try {
    const stderr = await new Promise<string>((resolve, reject) => {
      const child = spawn(codexBin(opts.bin), args, {
        cwd: dir,
        stdio: ['pipe', 'ignore', 'pipe'],
      });
      let err = '';
      child.stderr.on('data', (d: Buffer) => {
        err += d.toString();
      });
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`codex exec timed out after ${Math.round(timeoutMs / 1000)}s`));
      }, timeoutMs);
      child.on('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve(err);
        else reject(new Error(`codex exec exited ${code}: ${err.slice(-800)}`));
      });
      child.stdin.end(prompt);
    });
    const text = (await readFile(outFile, 'utf8')).trim();
    if (!text) throw new Error('codex exec produced no final message');
    const { searches, tokens } = parseCodexStderr(stderr);
    return {
      text,
      model,
      reasoning,
      searches,
      tokens,
      seconds: Math.round((Date.now() - started) / 1000),
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
