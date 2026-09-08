/**
 * Reading a `.xlsx` without a spreadsheet library.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * The figures behind the electricity lens come from EIA, and EIA publishes
 * spreadsheets. Table 5.A carries Georgia's average residential consumption —
 * the number every county's electric bill is multiplied by — and the EIA-861
 * annual release carries per-utility revenue, sales and customer counts, which
 * is the authoritative version of the rates currently taken from OpenEI. Both
 * are xlsx. Until now that meant taking the numbers on somebody's word, which
 * is exactly the habit phases 210–212 were spent unlearning.
 *
 * ── Why not a library ──────────────────────────────────────────────────────
 *
 * An xlsx is a ZIP of XML, and the part that matters is small: locate the
 * central directory, inflate the entries, read `sharedStrings.xml` and a
 * worksheet. That is the ~120 lines below, against a dependency that would
 * ship a full spreadsheet engine — styles, formulas, charts, dates — to read
 * a table of numbers in a build script.
 *
 * ── What it does NOT do ────────────────────────────────────────────────────
 *
 * No formula evaluation (cached values are read as written), no date
 * conversion (a date arrives as its serial number), no styles, no ZIP64, and
 * no encryption. Every one of those is absent on purpose: a build script
 * reading a published statistical table needs none of them, and each would be
 * a place to be subtly wrong. If a file needs any of it, this throws rather
 * than guesses.
 */

import { inflateRawSync } from 'node:zlib';

/** One file inside the archive. */
export interface ZipEntry {
  name: string;
  data: Buffer;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const STORED = 0;
const DEFLATED = 8;

/**
 * Every entry in a ZIP, read through the central directory.
 *
 * The central directory rather than a scan for local headers: local headers
 * can carry a zero compressed size with the real one in a trailing data
 * descriptor, and a scanner has to guess where an entry ends. The directory
 * states it.
 */
export function readZip(buf: Buffer): ZipEntry[] {
  // The end-of-central-directory record sits at the tail, after a comment of
  // up to 64 KB, so it is found by scanning backwards for its signature.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 0x10000; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a zip: no end-of-central-directory record');

  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  if (offset === 0xffffffff) throw new Error('zip64 archives are not supported');

  const out: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(offset) !== CENTRAL_SIGNATURE) {
      throw new Error(`corrupt central directory at entry ${i}`);
    }
    const method = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.toString('utf8', offset + 46, offset + 46 + nameLen);

    // The local header's own name and extra lengths can differ from the
    // directory's, so the data offset has to come from the local header.
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLen + localExtraLen;
    const raw = buf.subarray(start, start + compressedSize);

    let data: Buffer;
    if (method === STORED) data = Buffer.from(raw);
    else if (method === DEFLATED) data = inflateRawSync(raw);
    else throw new Error(`unsupported compression method ${method} for ${name}`);

    out.push({ name, data });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** `<t>` runs in document order. Entities are the five XML predefined ones. */
/**
 * XML's five predefined entities, in ONE pass.
 *
 * Sequential `.replace` calls double-decode: `&amp;lt;` should come out as the
 * literal text `&lt;`, but replacing `&amp;` last still leaves the `&lt;` that
 * an earlier pass already produced from the original `&lt;`... and replacing
 * it first turns `&amp;lt;` into `&lt;` which the next pass turns into `<`.
 * Either order is wrong. A single pass over one alternation cannot re-examine
 * what it has already written.
 */
const XML_ENTITIES: Record<string, string> = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&amp;': '&',
};

function unescapeXml(s: string): string {
  return s.replace(/&(?:lt|gt|quot|apos|amp);/g, (m) => XML_ENTITIES[m] ?? m);
}

/**
 * The shared string table.
 *
 * A string cell holds an INDEX into this, not the text — xlsx deduplicates
 * every repeated string in the workbook. One `<si>` can contain several `<t>`
 * runs when the text is richly formatted, and they concatenate.
 */
function sharedStrings(xml: string): string[] {
  const out: string[] = [];
  for (const si of xml.split('<si>').slice(1)) {
    const body = si.split('</si>')[0] ?? '';
    const runs = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1] ?? '');
    out.push(unescapeXml(runs.join('')));
  }
  return out;
}

/** `B7` → column index 1. */
function columnOf(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref)?.[1] ?? '';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * A worksheet as rows of cell strings, empty cells included.
 *
 * Cells are placed by their `r` reference rather than by order of appearance:
 * xlsx omits empty cells entirely, so `<c r="A1">` followed by `<c r="D1">`
 * means B and C are blank, and reading positionally shifts every later column
 * left. That shift is silent and produces a table that looks right.
 */
export function sheetRows(xml: string, strings: readonly string[]): string[][] {
  const rows: string[][] = [];
  for (const chunk of xml.split(/<row[\s>]/).slice(1)) {
    const body = chunk.split('</row>')[0] ?? '';
    const row: string[] = [];
    // The self-closing form must be tried FIRST. With `<c ...>…</c>` first,
    // the `[^>]*` of the open tag happily consumes a self-closing cell's `/`
    // and then runs on to the NEXT cell's `</c>`, swallowing the empty cell
    // and everything up to it — which drops a column and shifts every later
    // one left, silently, in a table that still looks like a table.
    for (const m of body.matchAll(/<c\s([^>]*?)\/>|<c\s([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = m[1] ?? m[2] ?? '';
      const inner = m[3] ?? '';
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1] ?? '';
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? 'n';
      const rawValue = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '';

      let value: string;
      if (type === 's') value = strings[Number(rawValue)] ?? '';
      else if (type === 'inlineStr') {
        value = unescapeXml(
          [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1] ?? '').join(''),
        );
      } else value = unescapeXml(rawValue);

      const at = ref ? columnOf(ref) : row.length;
      while (row.length < at) row.push('');
      row[at] = value;
    }
    rows.push(row);
  }
  return rows;
}

/** Every worksheet in the workbook, in archive order, as rows of strings. */
export function readXlsx(buf: Buffer): { name: string; rows: string[][] }[] {
  const entries = readZip(buf);
  const byName = new Map(entries.map((e) => [e.name, e.data]));
  const sst = byName.get('xl/sharedStrings.xml');
  const strings = sst ? sharedStrings(sst.toString('utf8')) : [];
  return entries
    .filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    .map((e) => ({ name: e.name, rows: sheetRows(e.data.toString('utf8'), strings) }));
}
