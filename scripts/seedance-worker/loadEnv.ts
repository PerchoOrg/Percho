import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Load repo-root .env.local (two dirs up from scripts/seedance-worker/). */
export function loadEnv(): void {
  const repoRoot = path.resolve(__dirname, '..', '..');
  loadDotenv({ path: path.join(repoRoot, '.env.local') });
}
