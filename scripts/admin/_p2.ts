import { readFileSync } from 'node:fs';
import { contentStreams } from '../../apps/web/lib/areas/millage-pdf.js';
const s = contentStreams(readFileSync('/tmp/dekalb-millage.pdf'));
console.log(`streams kept: ${s.length}`);
for (const x of s) {
  let p = 0;
  for (let i = 0; i < x.length; i++) {
    const c = x.charCodeAt(i);
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c <= 126)) p++;
  }
  console.log(`  len=${x.length} printable=${(p / x.length).toFixed(3)} brackets=${(x.match(/\[/g) || []).length} ]TJ=${(x.match(/\]\s*TJ/g) || []).length}`);
}
