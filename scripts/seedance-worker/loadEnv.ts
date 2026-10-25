import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Load repo-root .env.local (two dirs up from scripts/seedance-worker/).
 *
 * Node's built-in loader, not `dotenv`: dotenv was never a dependency of this
 * repo, only a transitive one of Expo, and the SDK 57 upgrade (phase161) took
 * it out of the lockfile — every importer then died at startup. Same semantics
 * as dotenv: variables already in the environment win, and a missing file is
 * not an error.
 */
export function loadEnv(): void {
  const repoRoot = path.resolve(__dirname, '..', '..');
  try {
    process.loadEnvFile(path.join(repoRoot, '.env.local'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}
