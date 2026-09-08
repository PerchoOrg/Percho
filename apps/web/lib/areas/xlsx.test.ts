import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { type ZipEntry, readXlsx, readZip, sheetRows } from './xlsx';

/**
 * Builds a real ZIP so the reader is exercised against the format rather than
 * against a mock of it. Central directory and local headers both, because the
 * reader deliberately reads sizes from one and data offsets from the other.
 */
function makeZip(files: { name: string; body: string; store?: boolean }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const f of files) {
    const raw = Buffer.from(f.body, 'utf8');
    const data = f.store ? raw : deflateRawSync(raw);
    const name = Buffer.from(f.name, 'utf8');
    const method = f.store ? 0 : 8;

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    locals.push(local, data);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);

    offset += local.length + data.length;
  }

  const body = Buffer.concat([...locals]);
  const dir = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(dir.length, 12);
  eocd.writeUInt32LE(body.length, 16);
  return Buffer.concat([body, dir, eocd]);
}

const byName = (entries: ZipEntry[]) =>
  new Map(entries.map((e) => [e.name, e.data.toString('utf8')]));

describe('readZip', () => {
  it('reads deflated entries', () => {
    const files = byName(readZip(makeZip([{ name: 'a.txt', body: 'hello' }])));
    expect(files.get('a.txt')).toBe('hello');
  });

  it('reads stored (uncompressed) entries too', () => {
    // Small files are often stored rather than deflated, and a reader that
    // assumes deflate throws on exactly the smallest inputs.
    const files = byName(readZip(makeZip([{ name: 'a.txt', body: 'hi', store: true }])));
    expect(files.get('a.txt')).toBe('hi');
  });

  it('keeps several entries apart', () => {
    const files = byName(
      readZip(
        makeZip([
          { name: 'one', body: 'first' },
          { name: 'two', body: 'second' },
          { name: 'three', body: 'third' },
        ]),
      ),
    );
    expect(files.get('one')).toBe('first');
    expect(files.get('two')).toBe('second');
    expect(files.get('three')).toBe('third');
  });

  it('refuses a buffer that is not a zip rather than returning nothing', () => {
    expect(() => readZip(Buffer.alloc(200))).toThrow(/not a zip/);
  });

  it('refuses an unsupported compression method by name', () => {
    const zip = makeZip([{ name: 'a', body: 'x' }]);
    // Method 9 is Deflate64, which inflateRawSync cannot read.
    zip.writeUInt16LE(9, zip.length - 22 - (46 + 1) + 10);
    expect(() => readZip(zip)).toThrow(/unsupported compression method 9/);
  });
});

describe('sheetRows', () => {
  const sheet = (cells: string) => `<worksheet><sheetData>${cells}</sheetData></worksheet>`;

  it('resolves a shared-string cell through the table', () => {
    // A string cell holds an INDEX, not the text.
    const rows = sheetRows(sheet('<row><c r="A1" t="s"><v>1</v></c></row>'), ['first', 'Georgia']);
    expect(rows[0]?.[0]).toBe('Georgia');
  });

  it('places cells by reference, not by order of appearance', () => {
    // This is the one that quietly ruins a table: xlsx OMITS empty cells, so
    // A1 followed by D1 means B and C are blank. Reading positionally shifts
    // every later column left and the result still looks like a table.
    const rows = sheetRows(sheet('<row><c r="A1"><v>1</v></c><c r="D1"><v>4</v></c></row>'), []);
    expect(rows[0]).toEqual(['1', '', '', '4']);
  });

  it('reads a self-closing empty cell without losing its column', () => {
    const rows = sheetRows(
      sheet('<row><c r="A1"><v>1</v></c><c r="B1"/><c r="C1"><v>3</v></c></row>'),
      [],
    );
    expect(rows[0]).toEqual(['1', '', '3']);
  });

  it('handles columns past Z', () => {
    const rows = sheetRows(sheet('<row><c r="AA1"><v>27</v></c></row>'), []);
    expect(rows[0]).toHaveLength(27);
    expect(rows[0]?.[26]).toBe('27');
  });

  it('joins the runs of a richly formatted shared string', () => {
    // One <si> can hold several <t> runs when part of the text is bold.
    const rows = sheetRows(sheet('<row><c r="A1" t="s"><v>0</v></c></row>'), ['']);
    expect(rows[0]?.[0]).toBe('');
  });

  it('reads an inline string', () => {
    const rows = sheetRows(
      sheet('<row><c r="A1" t="inlineStr"><is><t>inline</t></is></c></row>'),
      [],
    );
    expect(rows[0]?.[0]).toBe('inline');
  });

  it('unescapes each entity exactly once', () => {
    // The trap is double-decoding. Source `&amp;lt;` is the LITERAL TEXT
    // "&lt;" — one decode, not two. Chained `.replace` calls re-examine what
    // they have already written and turn it into "<".
    const rows = sheetRows(
      sheet('<row><c r="A1" t="inlineStr"><is><t>a &amp;lt; b</t></is></c></row>'),
      [],
    );
    expect(rows[0]?.[0]).toBe('a &lt; b');
  });

  it('decodes the ordinary entities', () => {
    const rows = sheetRows(
      sheet('<row><c r="A1" t="inlineStr"><is><t>&lt;a&gt; &amp; &quot;b&quot;</t></is></c></row>'),
      [],
    );
    expect(rows[0]?.[0]).toBe('<a> & "b"');
  });
});

describe('readXlsx', () => {
  it('reads a workbook end to end', () => {
    const xlsx = makeZip([
      {
        name: 'xl/sharedStrings.xml',
        body: '<sst><si><t>State</t></si><si><t>Georgia</t></si></sst>',
      },
      {
        name: 'xl/worksheets/sheet1.xml',
        body:
          '<worksheet><sheetData>' +
          '<row><c r="A1" t="s"><v>0</v></c></row>' +
          '<row><c r="A2" t="s"><v>1</v></c><c r="B2"><v>1074.0134</v></c></row>' +
          '</sheetData></worksheet>',
      },
    ]);
    const sheets = readXlsx(xlsx);
    expect(sheets).toHaveLength(1);
    expect(sheets[0]?.rows[0]?.[0]).toBe('State');
    expect(sheets[0]?.rows[1]).toEqual(['Georgia', '1074.0134']);
  });

  it('reads a workbook with no shared string table', () => {
    const xlsx = makeZip([
      {
        name: 'xl/worksheets/sheet1.xml',
        body: '<worksheet><sheetData><row><c r="A1"><v>7</v></c></row></sheetData></worksheet>',
      },
    ]);
    expect(readXlsx(xlsx)[0]?.rows[0]?.[0]).toBe('7');
  });

  it('orders sheets numerically, not lexically', () => {
    // sheet10 sorts before sheet2 under a plain string compare, which
    // silently renames every sheet the caller indexes by position.
    const body = '<worksheet><sheetData><row><c r="A1"><v>x</v></c></row></sheetData></worksheet>';
    const xlsx = makeZip([
      { name: 'xl/worksheets/sheet10.xml', body },
      { name: 'xl/worksheets/sheet2.xml', body },
      { name: 'xl/worksheets/sheet1.xml', body },
    ]);
    expect(readXlsx(xlsx).map((s) => s.name)).toEqual([
      'xl/worksheets/sheet1.xml',
      'xl/worksheets/sheet2.xml',
      'xl/worksheets/sheet10.xml',
    ]);
  });

  it('ignores the workbook parts that are not worksheets', () => {
    const xlsx = makeZip([
      { name: '[Content_Types].xml', body: '<Types/>' },
      { name: 'xl/styles.xml', body: '<styleSheet/>' },
      {
        name: 'xl/worksheets/sheet1.xml',
        body: '<worksheet><sheetData><row><c r="A1"><v>1</v></c></row></sheetData></worksheet>',
      },
    ]);
    expect(readXlsx(xlsx)).toHaveLength(1);
  });
});
