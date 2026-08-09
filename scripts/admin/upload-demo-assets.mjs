/**
 * Upload demo assets (videos etc.) to the public `demo-assets` Supabase
 * Storage bucket. Videos are never committed to git (see .gitignore) —
 * this is how they get hosted for percho.co demo pages.
 *
 * Usage: node scripts/admin/upload-demo-assets.mjs <prefix> <file...>
 *   e.g. node scripts/admin/upload-demo-assets.mjs motion /path/to/*.mp4
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL in
 * root .env.local (admin script — service role is allowed here).
 */

import { readFileSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import { createClient } from '../../apps/web/node_modules/@supabase/supabase-js/dist/module/index.js';

const BUCKET = 'demo-assets';
const MIME = { '.mp4': 'video/mp4', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif' };

function loadEnv() {
  const env = {};
  for (const line of readFileSync(resolve(import.meta.dirname, '../../.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return env;
}

const [prefix, ...files] = process.argv.slice(2);
if (!prefix || files.length === 0) {
  console.error('usage: upload-demo-assets.mjs <prefix> <file...>');
  process.exit(1);
}

const env = loadEnv();
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
if (listErr) throw listErr;
if (!buckets.some((b) => b.name === BUCKET)) {
  const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
  if (error) throw error;
  console.log(`created public bucket ${BUCKET}`);
}

for (const file of files) {
  const name = basename(file);
  const path = `${prefix}/${name}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, readFileSync(file), {
    contentType: MIME[extname(name)] ?? 'application/octet-stream',
    upsert: true,
  });
  if (error) throw error;
  console.log(`uploaded ${path}`);
}
console.log(`public base: ${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${prefix}/`);
