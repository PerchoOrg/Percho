import { readFileSync } from 'node:fs';
import { contentStreams, rows, textItems } from '../../apps/web/lib/areas/millage-pdf.js';
const out = rows(textItems(contentStreams(readFileSync('/tmp/dekalb-millage.pdf'))));
console.log(`${out.length} rows`);
for (const r of out) {
  const line = r.join(' | ').replace(/\s+/g, ' ').trim();
  if (/general|hospital|ehost|unincorporated|fire|designated|special/i.test(line)) console.log(line);
}
