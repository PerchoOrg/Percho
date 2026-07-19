// Render SVGs from real seed rows using the actual production function.
import { readFileSync, writeFileSync } from 'node:fs';
import { buildCommunityLogoSvg } from '../lib/community/logo-cover.ts';

const rows: Array<{ name: string; slug: string; boundary: any }> = JSON.parse(
  readFileSync('/tmp/percho-community-demo/real-seeds.json', 'utf8'),
);

const cards = rows
  .map((r) => {
    const svg = buildCommunityLogoSvg(r.name, r.boundary);
    return `<div style="width:280px">
      <div style="border-radius:14px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,.1)">${svg}</div>
      <div style="text-align:center;padding:8px 0;font-family:system-ui;font-size:13px;color:#334">${r.name}</div>
    </div>`;
  })
  .join('\n');

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>P3 real-data preview</title>
<style>body{background:#fafafa;padding:24px;font-family:system-ui}
h1{color:#333;font-size:18px;margin-bottom:8px}
.sub{color:#777;font-size:13px;margin-bottom:24px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px}</style></head>
<body><h1>P3 Bold Logo cover (real seed data)</h1>
<div class="sub">Rendered by <code>lib/community/logo-cover.ts</code> · ${rows.length} nextdoor seeds</div>
<div class="grid">${cards}</div></body></html>`;

writeFileSync('/tmp/percho-community-demo/real-preview.html', html);
console.log('wrote /tmp/percho-community-demo/real-preview.html');
