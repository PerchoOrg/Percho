import { readFileSync } from 'node:fs';
import { contentStreams, rows, textItems } from '../../apps/web/lib/areas/millage-pdf.js';
const t0 = Date.now();
const s = contentStreams(readFileSync('/tmp/dekalb-millage.pdf'));
console.log(`streams: ${s.length} (${Date.now() - t0}ms)`);
const items = textItems(s);
console.log(`items: ${items.length} (${Date.now() - t0}ms)`);
const out = rows(items);
console.log(`rows: ${out.length} (${Date.now() - t0}ms)\n`);
for (const r of out) {
  const line = r.join(' ').replace(/\s+/g, ' ').trim();
  if (/general|hospital|ehost|unincorporated|designated|bond|fire/i.test(line)) console.log(line.slice(0, 150));
}
