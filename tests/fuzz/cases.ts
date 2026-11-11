// Robustness (fuzz) corpus for convert(). Every case is built in memory,
// deterministically, from fixed seeds and the fixtures in tests/fixtures.
// This file is a locked exam: fix the converter in src/, never this file.
import { readFileSync } from "node:fs";
import { crc32 } from "node:zlib";
import { deflateSync, inflateSync } from "fflate";

export type FuzzCase = { id: string; name: string; data: Uint8Array; note: string };

// ---------------------------------------------------------------- helpers

const enc = new TextEncoder();
const utf8 = (s: string): Uint8Array => enc.encode(s);
const latin1 = (s: string): Uint8Array => {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
};
const dec = (b: Uint8Array): string => new TextDecoder().decode(b);

function concat(...parts: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function repeatBytes(unit: Uint8Array, count: number): Uint8Array {
  const out = new Uint8Array(unit.length * count);
  for (let i = 0; i < count; i++) out.set(unit, i * unit.length);
  return out;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomBytes(n: number, seed: number): Uint8Array {
  const r = mulberry32(seed);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.floor(r() * 256);
  return out;
}

/** Copy of data with `count` bytes XORed with a random non-zero value, inside [start, end). */
function flip(data: Uint8Array, count: number, seed: number, start = 0, end = data.length): Uint8Array {
  const out = data.slice();
  const r = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const pos = start + Math.floor(r() * (end - start));
    out[pos] ^= 1 + Math.floor(r() * 255);
  }
  return out;
}

const fixtureCache = new Map<string, Uint8Array>();
function fixture(name: string): Uint8Array {
  let b = fixtureCache.get(name);
  if (!b) {
    b = new Uint8Array(readFileSync(new URL(`../fixtures/${name}`, import.meta.url)));
    fixtureCache.set(name, b);
  }
  return b.slice();
}

const DOCX = "01-protokoll-styrelsemote.docx";
const XLSX = "03-budget-forening.xlsx";
const CSV = "04-export-svensk-excel.csv";
const PPTX = "05-workshop-presentation.pptx";
const PDF = "06-rapport-flera-sidor.pdf";
const PDF_MIXED = "10-pdf-blandad.pdf";
const PDF_SCANNED = "09-pdf-skannad.pdf";

// ---------------------------------------------------------------- zip

type ZipEntry = {
  name: string;
  method: number;
  crc: number;
  csize: number;
  usize: number;
  raw: Uint8Array; // stored bytes as they sit in the archive
};

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

function findEocd(b: Uint8Array): number {
  for (let i = b.length - 22; i >= 0; i--) {
    if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x05 && b[i + 3] === 0x06) return i;
  }
  throw new Error("no EOCD");
}

function readZip(b: Uint8Array): ZipEntry[] {
  const eocd = findEocd(b);
  const count = u16(b, eocd + 10);
  let p = u32(b, eocd + 16);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    const method = u16(b, p + 10);
    const crc = u32(b, p + 16);
    const csize = u32(b, p + 20);
    const usize = u32(b, p + 24);
    const nlen = u16(b, p + 28);
    const xlen = u16(b, p + 30);
    const clen = u16(b, p + 32);
    const local = u32(b, p + 42);
    const name = dec(b.subarray(p + 46, p + 46 + nlen));
    const dataStart = local + 30 + u16(b, local + 26) + u16(b, local + 28);
    entries.push({ name, method, crc, csize, usize, raw: b.slice(dataStart, dataStart + csize) });
    p += 46 + nlen + xlen + clen;
  }
  return entries;
}

function entryBytes(e: ZipEntry): Uint8Array {
  return e.method === 0 ? e.raw : inflateSync(e.raw);
}

function makeEntry(name: string, content: Uint8Array | string, level: 0 | 1 | 6 | 9 = 6): ZipEntry {
  const data = typeof content === "string" ? utf8(content) : content;
  const raw = level === 0 ? data : deflateSync(data, { level });
  return { name, method: level === 0 ? 0 : 8, crc: crc32(data) >>> 0, csize: raw.length, usize: data.length, raw };
}

type ZipOpts = { lieUsize?: Map<string, number>; method?: Map<string, number>; badCrc?: Set<string> };

/** Writes a plain zip. Fixed DOS timestamp so output is byte-for-byte stable. */
function writeZip(entries: ZipEntry[], opts: ZipOpts = {}): Uint8Array {
  const TIME = 0x5000; // 10:00:00
  const DATE = 0x5d66; // 2026-11-06
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = utf8(e.name);
    const method = opts.method?.get(e.name) ?? e.method;
    const usize = opts.lieUsize?.get(e.name) ?? e.usize;
    const crc = opts.badCrc?.has(e.name) ? (e.crc ^ 0xdeadbeef) >>> 0 : e.crc;
    const lh = new Uint8Array(30 + name.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, method, true);
    lv.setUint16(10, TIME, true);
    lv.setUint16(12, DATE, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, e.csize, true);
    lv.setUint32(22, usize, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    lh.set(name, 30);
    const ch = new Uint8Array(46 + name.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, method, true);
    cv.setUint16(12, TIME, true);
    cv.setUint16(14, DATE, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, e.csize, true);
    cv.setUint32(24, usize, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    ch.set(name, 46);
    locals.push(lh, e.raw);
    centrals.push(ch);
    offset += lh.length + e.raw.length;
  }
  const cd = concat(...centrals);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, Math.min(entries.length, 0xffff), true);
  ev.setUint16(10, Math.min(entries.length, 0xffff), true);
  ev.setUint32(12, cd.length, true);
  ev.setUint32(16, offset, true);
  return concat(...locals, cd, eocd);
}

/** Rebuilds a fixture zip with some entries replaced (string/bytes), removed (null) or added. */
function patchZip(base: string, changes: Record<string, string | Uint8Array | null>, extra: ZipEntry[] = []): Uint8Array {
  const out: ZipEntry[] = [];
  const seen = new Set<string>();
  for (const e of readZip(fixture(base))) {
    seen.add(e.name);
    if (!(e.name in changes)) out.push(e);
    else if (changes[e.name] !== null) out.push(makeEntry(e.name, changes[e.name] as string | Uint8Array));
  }
  for (const [name, v] of Object.entries(changes)) if (!seen.has(name) && v !== null) out.push(makeEntry(name, v));
  return writeZip([...out, ...extra]);
}

function zipText(base: string, name: string): string {
  const e = readZip(fixture(base)).find((x) => x.name === name);
  if (!e) throw new Error(`${base}: no ${name}`);
  return dec(entryBytes(e));
}

// ---------------------------------------------------------------- hand-written deflate (zip bombs)

const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];

function rev(code: number, len: number): number {
  let r = 0;
  for (let i = 0; i < len; i++) r = (r << 1) | ((code >> i) & 1);
  return r;
}

const FIXED: { code: number; len: number }[] = Array.from({ length: 288 }, (_, v) => {
  if (v < 144) return { code: rev(0x30 + v, 8), len: 8 };
  if (v < 256) return { code: rev(0x190 + v - 144, 9), len: 9 };
  if (v < 280) return { code: rev(v - 256, 7), len: 7 };
  return { code: rev(0xc0 + v - 280, 8), len: 8 };
});

class BitWriter {
  buf: Uint8Array;
  pos = 0;
  acc = 0;
  n = 0;
  constructor(cap: number) {
    this.buf = new Uint8Array(cap);
  }
  put(bits: number, len: number) {
    this.acc |= bits << this.n;
    this.n += len;
    while (this.n >= 8) {
      this.buf[this.pos++] = this.acc & 0xff;
      this.acc >>>= 8;
      this.n -= 8;
    }
  }
  sym(v: number) {
    const f = FIXED[v];
    this.put(f.code, f.len);
  }
  done(): Uint8Array {
    if (this.n > 0) this.buf[this.pos++] = this.acc & 0xff;
    return this.buf.slice(0, this.pos);
  }
}

type Periodic = { prefix: Uint8Array; unit: Uint8Array; reps: number; suffix: Uint8Array };

/** Raw deflate (one fixed-Huffman block) of prefix + unit*reps + suffix, without materialising it. */
function deflatePeriodic({ prefix, unit, reps, suffix }: Periodic): Uint8Array {
  const d = unit.length;
  const repeated = (reps - 1) * d;
  const matches = Math.ceil(repeated / 258) + 2;
  const w = new BitWriter(Math.ceil(((prefix.length + d + suffix.length + 4) * 9 + matches * 31) / 8) + 16);
  w.put(1, 1); // BFINAL
  w.put(1, 2); // BTYPE = fixed
  for (const b of prefix) w.sym(b);
  for (const b of unit) w.sym(b);
  let dc = 0;
  while (DIST_BASE[dc + 1] !== undefined && DIST_BASE[dc + 1] <= d) dc++;
  let rem = repeated;
  let pos = 0;
  while (rem > 0) {
    if (rem < 3) {
      w.sym(unit[pos % d]);
      pos++;
      rem--;
      continue;
    }
    let l = Math.min(258, rem);
    if (rem - l === 1 || rem - l === 2) l = rem - 3;
    let lc = 0;
    while (LEN_BASE[lc + 1] !== undefined && LEN_BASE[lc + 1] <= l) lc++;
    if (l === 258) lc = 28;
    w.sym(257 + lc);
    if (LEN_EXTRA[lc]) w.put(l - LEN_BASE[lc], LEN_EXTRA[lc]);
    w.put(rev(dc, 5), 5);
    if (DIST_EXTRA[dc]) w.put(d - DIST_BASE[dc], DIST_EXTRA[dc]);
    pos += l;
    rem -= l;
  }
  for (const b of suffix) w.sym(b);
  w.sym(256);
  return w.done();
}

/** Calls fn on the periodic content in ~1 MB chunks (for checksums). */
function walkPeriodic({ prefix, unit, reps, suffix }: Periodic, fn: (chunk: Uint8Array) => void) {
  fn(prefix);
  const per = Math.max(1, Math.floor((1 << 20) / unit.length));
  const chunk = repeatBytes(unit, Math.min(per, reps));
  let left = reps;
  while (left >= per) {
    fn(chunk);
    left -= per;
  }
  if (left > 0) fn(chunk.subarray(0, left * unit.length));
  fn(suffix);
}

function bombEntry(name: string, p: Periodic): ZipEntry {
  let crc = 0;
  walkPeriodic(p, (c) => (crc = crc32(c, crc)));
  const raw = deflatePeriodic(p);
  return { name, method: 8, crc: crc >>> 0, csize: raw.length, usize: p.prefix.length + p.unit.length * p.reps + p.suffix.length, raw };
}

/** zlib stream (for PDF /FlateDecode) with a correct Adler-32, computed without a 500 MB loop. */
function zlibPeriodic(p: Periodic): Uint8Array {
  const MOD = 65521;
  let a = 1;
  let b = 0;
  const memo = new Map<number, { s: number; w: number }>();
  walkPeriodic(p, (c) => {
    let sw = memo.get(c.length);
    if (!sw || c.length < 4096) {
      let s = 0;
      let wsum = 0;
      for (let i = 0; i < c.length; i++) {
        s = (s + c[i]) % MOD;
        wsum = (wsum + (c.length - i) * c[i]) % MOD;
      }
      sw = { s, w: wsum };
      if (c.length >= 4096) memo.set(c.length, sw);
    }
    b = (b + (c.length % MOD) * a + sw.w) % MOD;
    a = (a + sw.s) % MOD;
  });
  const adler = ((b << 16) | a) >>> 0;
  const tail = new Uint8Array([adler >>> 24, (adler >>> 16) & 0xff, (adler >>> 8) & 0xff, adler & 0xff]);
  return concat(new Uint8Array([0x78, 0x01]), deflatePeriodic(p), tail);
}

// ---------------------------------------------------------------- OOXML builders

const W_NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const docXml = (body: string) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W_NS}><w:body>${body}</w:body></w:document>`;
const para = (t: string) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
const docx = (documentXml: string | Uint8Array) => patchZip(DOCX, { "word/document.xml": documentXml });

const SHEET_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
const xlsxSheet1 = (sheetXml: string | Uint8Array, more: Record<string, string | Uint8Array | null> = {}) =>
  patchZip(XLSX, { "xl/worksheets/sheet1.xml": sheetXml, ...more });

const P_NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const GRP_HEAD = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>';
const textShape = (id: number, t: string) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:txBody></p:sp>`;
const slideXml = (tree: string) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld ${P_NS}><p:cSld><p:spTree>${GRP_HEAD}${tree}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
const pptxSlide1 = (xml: string | Uint8Array) => patchZip(PPTX, { "ppt/slides/slide1.xml": xml });

const BILLION_LAUGHS =
  '<!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol1 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">' +
  '<!ENTITY lol2 "&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;"><!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">' +
  '<!ENTITY lol4 "&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;"><!ENTITY lol5 "&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;">' +
  '<!ENTITY lol6 "&lol5;&lol5;&lol5;&lol5;&lol5;&lol5;&lol5;&lol5;&lol5;&lol5;"><!ENTITY lol7 "&lol6;&lol6;&lol6;&lol6;&lol6;&lol6;&lol6;&lol6;&lol6;&lol6;">' +
  '<!ENTITY lol8 "&lol7;&lol7;&lol7;&lol7;&lol7;&lol7;&lol7;&lol7;&lol7;&lol7;"><!ENTITY lol9 "&lol8;&lol8;&lol8;&lol8;&lol8;&lol8;&lol8;&lol8;&lol8;&lol8;">]>';

// ---------------------------------------------------------------- OLE / CFB (encrypted Office)

function oleFile(): Uint8Array {
  const SECTOR = 512;
  const out = new Uint8Array(SECTOR * 19); // header + FAT + directory + 2 x 8 stream sectors
  const v = new DataView(out.buffer);
  out.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 0);
  v.setUint16(24, 0x003e, true);
  v.setUint16(26, 0x0003, true);
  v.setUint16(28, 0xfffe, true);
  v.setUint16(30, 9, true);
  v.setUint16(32, 6, true);
  v.setUint32(44, 1, true); // FAT sectors
  v.setUint32(48, 1, true); // first directory sector
  v.setUint32(56, 4096, true);
  v.setUint32(60, 0xfffffffe, true);
  v.setUint32(68, 0xfffffffe, true);
  v.setUint32(76, 0, true); // DIFAT[0] = FAT in sector 0
  for (let i = 1; i < 109; i++) v.setUint32(76 + i * 4, 0xffffffff, true);
  // FAT (sector 0 at file offset 512)
  const fat = (i: number, val: number) => v.setUint32(SECTOR + i * 4, val, true);
  for (let i = 0; i < 128; i++) fat(i, 0xffffffff);
  fat(0, 0xfffffffd);
  fat(1, 0xfffffffe);
  for (let s = 2; s < 9; s++) fat(s, s + 1);
  fat(9, 0xfffffffe);
  for (let s = 10; s < 17; s++) fat(s, s + 1);
  fat(17, 0xfffffffe);
  // Directory (sector 1)
  const dir = (i: number, name: string, type: number, right: number, child: number, start: number, size: number) => {
    const o = SECTOR * 2 + i * 128;
    for (let c = 0; c < name.length; c++) v.setUint16(o + c * 2, name.charCodeAt(c), true);
    v.setUint16(o + 64, (name.length + 1) * 2, true);
    out[o + 66] = type;
    out[o + 67] = 1;
    v.setUint32(o + 68, 0xffffffff, true);
    v.setUint32(o + 72, right, true);
    v.setUint32(o + 76, child, true);
    v.setUint32(o + 116, start, true);
    v.setUint32(o + 120, size, true);
  };
  dir(0, "Root Entry", 5, 0xffffffff, 1, 0xfffffffe, 0);
  dir(1, "EncryptionInfo", 2, 2, 0xffffffff, 2, 4096);
  dir(2, "EncryptedPackage", 2, 0xffffffff, 0xffffffff, 10, 4096);
  for (let i = 3; i < 4; i++) {
    const o = SECTOR * 2 + i * 128;
    v.setUint32(o + 68, 0xffffffff, true);
    v.setUint32(o + 72, 0xffffffff, true);
    v.setUint32(o + 76, 0xffffffff, true);
  }
  // EncryptionInfo: agile encryption header (version 4.4) followed by XML descriptor
  const info = SECTOR * 4;
  v.setUint16(info, 4, true);
  v.setUint16(info + 2, 4, true);
  v.setUint32(info + 4, 0x40, true);
  out.set(
    utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><encryption xmlns="http://schemas.microsoft.com/office/2006/encryption"><keyData saltSize="16" blockSize="16" keyBits="256" hashSize="64" cipherAlgorithm="AES" cipherChaining="ChainingModeCBC" hashAlgorithm="SHA512" saltValue="AAAAAAAAAAAAAAAAAAAAAA=="/></encryption>'),
    info + 8,
  );
  out.set(randomBytes(4096, 0x0e1e), SECTOR * 11);
  return out;
}

// ---------------------------------------------------------------- PDF builder

type PdfOpts = { header?: string; trailer?: string; xref?: "ok" | "wrong-offsets" | "none"; startxref?: number; tail?: string };

function pdf(objs: (string | Uint8Array)[], opts: PdfOpts = {}): Uint8Array {
  const parts: Uint8Array[] = [latin1(opts.header ?? "%PDF-1.7\n%\xe2\xe3\xcf\xd3\n")];
  let pos = parts[0].length;
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(pos);
    const body = typeof o === "string" ? latin1(o) : o;
    const chunk = concat(latin1(`${i + 1} 0 obj\n`), body, latin1("\nendobj\n"));
    parts.push(chunk);
    pos += chunk.length;
  });
  const xrefPos = pos;
  const mode = opts.xref ?? "ok";
  if (mode !== "none") {
    let x = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) x += `${String(mode === "ok" ? off : off + 37).padStart(10, "0")} 00000 n \n`;
    parts.push(latin1(x));
  }
  parts.push(latin1(`trailer\n<< /Size ${objs.length + 1} /Root 1 0 R ${opts.trailer ?? ""} >>\nstartxref\n${opts.startxref ?? xrefPos}\n${opts.tail ?? "%%EOF\n"}`));
  return concat(...parts);
}

const stream = (dict: string, data: Uint8Array | string): Uint8Array => {
  const d = typeof data === "string" ? latin1(data) : data;
  return concat(latin1(`<< ${dict} /Length ${d.length} >>\nstream\n`), d, latin1("\nendstream"));
};
const PAGE_TEXT = "BT /F1 14 Tf 72 720 Td (Hej fr\\345n Silar) Tj ET";
const FONT = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
/** Catalog, Pages, one Page, its content and a font: objects 1..5. */
const simplePdfObjs = (pages = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", content: Uint8Array | string = stream("", PAGE_TEXT)) => [
  "<< /Type /Catalog /Pages 2 0 R >>",
  pages,
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
  content,
  FONT,
];

// ---------------------------------------------------------------- CSV samples

const CSV_HEADER = "Namn;Ort;Belopp;Datum;Kommentar\n";
const csvRow = (i: number) => `Medlem ${i};Göteborg;${(i * 37) % 10000},${String(i % 100).padStart(2, "0")};2026-${String((i % 12) + 1).padStart(2, "0")}-15;Rad ${i} åäö\n`;
const SAMPLE_CSV = CSV_HEADER + Array.from({ length: 20 }, (_, i) => csvRow(i + 1)).join("");

function utf16le(s: string, bom: boolean): Uint8Array {
  const out = new Uint8Array((bom ? 2 : 0) + s.length * 2);
  let o = 0;
  if (bom) out.set([0xff, 0xfe], (o += 2) - 2);
  for (let i = 0; i < s.length; i++, o += 2) {
    out[o] = s.charCodeAt(i) & 0xff;
    out[o + 1] = s.charCodeAt(i) >> 8;
  }
  return out;
}
function utf16be(s: string): Uint8Array {
  const le = utf16le(s, false);
  const out = new Uint8Array(le.length + 2);
  out.set([0xfe, 0xff]);
  for (let i = 0; i < le.length; i += 2) {
    out[2 + i] = le[i + 1];
    out[3 + i] = le[i];
  }
  return out;
}

// ---------------------------------------------------------------- categories

type Add = (id: string, name: string, data: Uint8Array, note: string) => void;
const FORMATS = ["docx", "xlsx", "pptx", "csv", "pdf"] as const;
const BASES: Record<(typeof FORMATS)[number], string> = { docx: DOCX, xlsx: XLSX, pptx: PPTX, csv: CSV, pdf: PDF };

function emptyFiles(add: Add) {
  for (const ext of FORMATS) add(`empty-${ext}`, `tom.${ext}`, new Uint8Array(0), "0-byte file; should resolve with a warning, not throw");
  const one: Record<string, number> = { docx: 0x50, xlsx: 0x50, pptx: 0x50, csv: 0x00, pdf: 0x25 };
  for (const ext of FORMATS) add(`one-byte-${ext}`, `en-byte.${ext}`, new Uint8Array([one[ext]]), "1-byte file; should return a warning, not throw");
  add("empty-no-extension", "fil", new Uint8Array(0), "0-byte file without extension; should return unsupported_format");
  add("csv-whitespace-only", "blank.csv", utf8("   \t \n\n  \r\n\t\t\n   "), "whitespace-only csv; empty markdown must come with a warning");
}

function truncated(add: Add) {
  for (const ext of FORMATS) {
    const b = fixture(BASES[ext]);
    for (const pct of ext === "csv" ? [50] : [10, 50, 90]) {
      add(`${ext}-truncated-${pct}pct`, `trunkerad.${ext}`, b.slice(0, Math.floor((b.length * pct) / 100)), `${ext} cut at ${pct}%; should return corrupt_file or partial text, not throw`);
    }
  }
  for (const ext of ["docx"] as const) {
    const b = fixture(BASES[ext]);
    add(`${ext}-truncated-local-header`, `bara-huvud.${ext}`, b.slice(0, 30 + u16(b, 26)), `${ext} cut right after the first zip local header; should return corrupt_file`);
  }
  add("pdf-truncated-header-line", "bara-huvud.pdf", fixture(PDF).slice(0, 9), "pdf cut after the %PDF-1.4 line; should return corrupt_file");
  const multibyte = utf8("Namn;Ort\nÅsa;Örebro\nBjörn;Malmö\n");
  add("csv-truncated-mid-utf8", "trunkerad-utf8.csv", multibyte.slice(0, multibyte.length - 3), "utf-8 csv cut inside a multibyte char; should still convert the complete rows");
}

function flips(add: Add) {
  const counts = [5, 50, 500];
  for (const ext of ["docx", "xlsx", "pptx", "pdf"] as const) {
    const b = fixture(BASES[ext]);
    counts.forEach((n, k) => {
      add(`${ext}-flips-${n}`, `skadad.${ext}`, flip(b, n, 1000 + k * 17 + ext.length), `${n} seeded random byte flips in the ${ext} fixture; should resolve, warn if needed`);
    });
  }
  // the csv fixture is only 159 bytes, so one moderate mutation is enough
  add("csv-flips-20", "skadad.csv", flip(fixture(CSV), 20, 1003), "20 seeded random byte flips in the csv fixture; should resolve, warn if needed");
  for (const ext of ["docx", "xlsx", "pptx"] as const) {
    const b = fixture(BASES[ext]);
    const eocd = findEocd(b);
    const cdStart = u32(b, eocd + 16);
    const cdEnd = cdStart + u32(b, eocd + 12);
    add(`${ext}-flips-central-dir-8`, `skadad-katalog.${ext}`, flip(b, 8, 4242 + ext.length, cdStart, cdEnd), `8 flips inside the ${ext} zip central directory; should return corrupt_file or partial text`);
    if (ext === "docx") add(`${ext}-flips-central-dir-64`, `skadad-katalog.${ext}`, flip(b, 64, 4343 + ext.length, cdStart, cdEnd), `64 flips inside the ${ext} zip central directory; should return corrupt_file`);
    if (ext === "docx") add(`${ext}-flips-eocd`, `skadad-eocd.${ext}`, flip(b, 4, 4444 + ext.length, eocd, eocd + 22), `flips in the ${ext} end-of-central-directory record; should return corrupt_file`);
  }
  for (const [i, f] of [PDF, PDF_MIXED].entries()) {
    const b = fixture(f);
    const xref = dec(b).lastIndexOf("xref");
    add(`pdf-flips-xref-trailer-${i + 1}-a`, `skadad-xref-${i + 1}.pdf`, flip(b, 10, 5150 + i, xref, b.length), "10 flips inside the pdf xref table and trailer; should recover or return corrupt_file");
    if (i === 0) add(`pdf-flips-xref-trailer-${i + 1}-b`, `skadad-xref-${i + 1}.pdf`, flip(b, 100, 5250 + i, xref, b.length), "100 flips inside the pdf xref table and trailer; should recover or return corrupt_file");
  }
  add("pdf-scanned-flips-500", "skadad-skannad.pdf", flip(fixture(PDF_SCANNED), 500, 5353), "500 flips in a scanned (image-only) pdf; should resolve with a warning");
}

function zipStructure(add: Add) {
  const d = readZip(fixture(DOCX));
  add("docx-zip-bad-crc", "fel-crc.docx", writeZip(d, { badCrc: new Set(["word/document.xml"]) }), "document.xml has a wrong CRC-32; should convert or return corrupt_file, not throw");
  add("docx-zip-unsupported-method", "lzma.docx", writeZip(d, { method: new Map([["word/document.xml", 14]]) }), "document.xml uses compression method 14 (LZMA); should return corrupt_file");
  add("docx-zip-declared-size-4gb", "jattestor.docx", writeZip(d, { lieUsize: new Map([["word/document.xml", 0xffffffff]]) }), "zip header claims document.xml is 4 GB; must not allocate it, should return corrupt_file or text");
  const doc = d.find((e) => e.name === "word/document.xml") as ZipEntry;
  add("docx-zip-duplicate-entry", "dubbel.docx", writeZip([...d, makeEntry(doc.name, docXml(para("Andra kopian av document.xml")))]), "two entries named word/document.xml; should pick one and convert, not throw");
  add("docx-zip-prepended-junk", "skrap-forst.docx", concat(randomBytes(2048, 77), fixture(DOCX)), "2 KB of random bytes before a valid docx (self-extractor style); should convert or return a warning");
}

function wrongExtension(add: Add) {
  const png = concat(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]), randomBytes(4000, 11));
  const jpeg = concat(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0]), randomBytes(4000, 12), new Uint8Array([0xff, 0xd9]));
  const html = utf8('<!DOCTYPE html><html lang="sv"><head><meta charset="utf-8"><title>Offert</title></head><body><h1>Offert</h1><p>Pris: 12 000 kr</p><script>alert(1)</script></body></html>');
  const plainZip = writeZip([makeEntry("readme.txt", "Det här är en vanlig zip-fil."), makeEntry("data/lista.csv", SAMPLE_CSV)]);
  add("pdf-named-docx", "rapport.docx", fixture(PDF), "pdf bytes named .docx; should detect pdf by content and convert");
  add("docx-named-pdf", "protokoll.pdf", fixture(DOCX), "docx bytes named .pdf; should detect docx by content and convert");
  add("xlsx-named-pptx", "budget.pptx", fixture(XLSX), "xlsx bytes named .pptx; should detect xlsx by content and convert");
  add("xlsx-named-docx", "budget.docx", fixture(XLSX), "xlsx bytes named .docx; should detect xlsx by content and convert");
  add("docx-named-csv", "protokoll.csv", fixture(DOCX), "docx bytes named .csv; must not dump zip bytes as csv");
  add("png-named-pdf", "bild.pdf", png, "png bytes named .pdf; should return unsupported_format");
  add("jpeg-named-pdf", "foto.pdf", jpeg, "jpeg bytes named .pdf; should return unsupported_format");
  add("text-named-xlsx", "anteckning.xlsx", utf8("Det här är bara vanlig text.\nInte ett kalkylark.\n"), "plain text named .xlsx; should return unsupported_format or convert as text, not throw");
  add("html-named-docx", "sida.docx", html, "html named .docx (common 'Word' export from web systems); should return unsupported_format, not throw");
  add("plain-zip-named-docx", "arkiv.docx", plainZip, "ordinary zip without Office parts named .docx; should return unsupported_format");
  add("docx-no-extension", "protokoll", fixture(DOCX), "docx bytes with no file extension; should detect docx by content");
  add("pdf-double-extension-docx", "faktura.pdf.docx", fixture(PDF), "pdf bytes named faktura.pdf.docx; should detect pdf and convert");
}

function missingParts(add: Add) {
  add("docx-missing-document-xml", "utan-dokument.docx", patchZip(DOCX, { "word/document.xml": null }), "docx zip without word/document.xml; should return unsupported_format or corrupt_file");
  add("docx-empty-document-xml", "tomt-dokument.docx", docx(new Uint8Array(0)), "word/document.xml is 0 bytes; should return corrupt_file");
  add("docx-document-without-body", "utan-body.docx", docx(`<?xml version="1.0"?><w:document ${W_NS}/>`), "document.xml with no w:body; empty markdown must come with a warning");
  add("docx-missing-content-types", "utan-typer.docx", patchZip(DOCX, { "[Content_Types].xml": null }), "docx without [Content_Types].xml; should convert or warn, not throw");
  add("xlsx-missing-workbook-xml", "utan-arbetsbok.xlsx", patchZip(XLSX, { "xl/workbook.xml": null }), "xlsx zip without xl/workbook.xml; should return unsupported_format or corrupt_file");
  const wb = zipText(XLSX, "xl/workbook.xml");
  add("xlsx-zero-sheets", "inga-flikar.xlsx", patchZip(XLSX, { "xl/workbook.xml": wb.replace(/<sheets>.*<\/sheets>/, "<sheets/>") }), "workbook.xml lists no sheets; empty markdown must come with a warning");
  add("xlsx-sheet-file-missing", "flik-saknas.xlsx", patchZip(XLSX, { "xl/worksheets/sheet1.xml": null }), "workbook references sheet1.xml which is not in the zip; should convert the rest or warn");
  add("pptx-missing-presentation-xml", "utan-presentation.pptx", patchZip(PPTX, { "ppt/presentation.xml": null }), "pptx zip without ppt/presentation.xml; should return unsupported_format or corrupt_file");
  add(
    "pptx-missing-slides",
    "bilder-saknas.pptx",
    patchZip(PPTX, { "ppt/slides/slide2.xml": null, "ppt/slides/slide3.xml": null, "ppt/slides/slide4.xml": null }),
    "presentation.xml references slides 2-4 that are missing; should convert slide 1 and warn or skip",
  );
  const pres = zipText(PPTX, "ppt/presentation.xml");
  add("pptx-zero-slides", "inga-bilder.pptx", patchZip(PPTX, { "ppt/presentation.xml": pres.replace(/<p:sldIdLst>.*<\/p:sldIdLst>/, "<p:sldIdLst/>") }), "presentation with an empty slide list; empty markdown must come with a warning");
  add(
    "pptx-dangling-rid",
    "fel-rid.pptx",
    patchZip(PPTX, { "ppt/presentation.xml": pres.replace('r:id="rId8"', 'r:id="rId999"') }),
    "slide list points at a relationship id that does not exist; should convert the other slides",
  );
  const rels = zipText(PPTX, "ppt/_rels/presentation.xml.rels");
  add(
    "pptx-rels-path-traversal",
    "konstig-sokvag.pptx",
    patchZip(PPTX, { "ppt/_rels/presentation.xml.rels": rels.replace('Target="slides/slide2.xml"', 'Target="../../../../etc/passwd"').replace('Target="slides/slide3.xml"', 'Target="https://example.invalid/slide.xml" TargetMode="External"') }),
    "slide relationships point outside the package and to a URL; must not fetch anything, should skip those slides",
  );
}

function malformedXml(add: Add) {
  const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
  add("docx-xml-unclosed-tags", "oavslutad.docx", docx(`<?xml version="1.0"?><w:document ${W_NS}><w:body><w:p><w:r><w:t>Hej och välkommen<w:p><w:r><w:t>till mötet`), "document.xml with unclosed tags; should return corrupt_file or best-effort text");
  add(
    "docx-xml-invalid-entities",
    "entiteter.docx",
    docx(docXml(para("Pris &bogus; kr") + para("Noll &#0; tecken") + para("Surrogat &#xD800; här") + para("Utanför &#99999999; Unicode") + para("Rå & och < tecken"))),
    "document.xml with undefined, NUL, surrogate and out-of-range entities plus raw & and <; should not throw",
  );
  add("docx-xml-bom-in-middle", "bom-mitt.docx", docx(concat(bom, bom, utf8(docXml(para("Före"))).slice(0, 200), bom, utf8(docXml(para("Före")).slice(200)))), "document.xml with a doubled BOM and a BOM inside the markup; should not throw");
  add("docx-xml-huge-attribute", "stort-attribut.docx", docx(docXml(`<w:p><w:pPr><w:pStyle w:val="${"A".repeat(5_000_000)}"/></w:pPr><w:r><w:t>Text efter jätteattribut</w:t></w:r></w:p>`)), "5 MB attribute value on a style reference; should convert the text, not hang");
  add("docx-xml-billion-laughs", "skratt.docx", docx(`<?xml version="1.0"?>${BILLION_LAUGHS}<w:document ${W_NS}><w:body>${para("&lol9;")}</w:body></w:document>`), "billion-laughs entity expansion in document.xml; must not expand, should warn or drop the entity");
  add(
    "docx-xml-external-entity",
    "xxe.docx",
    docx(`<?xml version="1.0"?><!DOCTYPE d [<!ENTITY ext SYSTEM "file:///etc/passwd"><!ENTITY web SYSTEM "https://example.invalid/x">]><w:document ${W_NS}><w:body>${para("&ext;&web;")}</w:body></w:document>`),
    "external entities (file and https) in document.xml; must never read or fetch them",
  );
  add("docx-xml-binary-garbage", "brus.docx", docx(randomBytes(20000, 21)), "document.xml is random binary; should return corrupt_file");
  add("xlsx-xml-unclosed-sheet", "oavslutad.xlsx", xlsxSheet1(`${SHEET_HEAD}<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Kategori`), "sheet1.xml ends mid-cell; should return corrupt_file or the other sheets");
  add("xlsx-xml-billion-laughs", "skratt.xlsx", xlsxSheet1(`<?xml version="1.0"?>${BILLION_LAUGHS}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>&lol9;</t></is></c></row></sheetData></worksheet>`), "billion-laughs entity expansion in a sheet; must not expand");
  const wbRels = zipText(XLSX, "xl/_rels/workbook.xml.rels");
  add(
    "xlsx-shared-strings-broken",
    "delade-strangar.xlsx",
    xlsxSheet1(`${SHEET_HEAD}<sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>999999</v></c><c r="C1" t="s"><v>-1</v></c></row></sheetData></worksheet>`, {
      "xl/sharedStrings.xml": '<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="1"><si><t>Första &amp; enda<si><t>',
      "xl/_rels/workbook.xml.rels": wbRels.replace("</Relationships>", '<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml" Id="rId9"/></Relationships>'),
    }),
    "malformed sharedStrings.xml and cells pointing at string 999999 and -1; should not throw",
  );
  add(
    "xlsx-huge-dimension",
    "enorm-yta.xlsx",
    xlsxSheet1(`${SHEET_HEAD}<dimension ref="A1:XFD1048576"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Hörn</t></is></c></row><row r="1048576"><c r="XFD1048576" t="inlineStr"><is><t>Andra hörnet</t></is></c></row></sheetData></worksheet>`),
    "two cells at A1 and XFD1048576 (full-sheet range); must not build a dense 17-billion-cell grid",
  );
  add("xlsx-bad-cell-refs", "fel-referenser.xlsx", xlsxSheet1(`${SHEET_HEAD}<sheetData><row r="-5"><c r="ZZZZZZ1" t="n"><v>abc</v></c><c r="A0" t="d"><v>inte-ett-datum</v></c><c r="B" t="b"><v>7</v></c><c t="e"><v>#REF!</v></c></row></sheetData></worksheet>`), "invalid cell references, non-numeric number and bad date/bool values; should not throw");
  add("pptx-xml-unclosed-slide", "oavslutad.pptx", pptxSlide1(`<?xml version="1.0"?><p:sld ${P_NS}><p:cSld><p:spTree>${GRP_HEAD}<p:sp><p:txBody><a:p><a:r><a:t>Avbruten`), "slide1.xml ends mid-text; should convert the other slides and warn");
  add("pptx-xml-billion-laughs", "skratt.pptx", pptxSlide1(`<?xml version="1.0"?>${BILLION_LAUGHS}<p:sld ${P_NS}><p:cSld><p:spTree>${GRP_HEAD}${textShape(2, "&lol9;")}</p:spTree></p:cSld></p:sld>`), "billion-laughs entity expansion in a slide; must not expand");
  add("pptx-presentation-garbage", "trasig-presentation.pptx", patchZip(PPTX, { "ppt/presentation.xml": "<p:presentation><<<>>>&&&</p:sldIdLst>" }), "presentation.xml is malformed; should return corrupt_file or slides found by name");
}

function encrypted(add: Add) {
  const ole = oleFile();
  for (const ext of ["docx", "xlsx", "pptx"]) add(`ole-encrypted-${ext}`, `losenord.${ext}`, ole, `password-protected Office file (OLE container) named .${ext}; should return unsupported_format with a password hint`);
  for (const ext of ["doc", "xls", "ppt"]) add(`ole-legacy-${ext}`, `gammal.${ext}`, ole, `OLE container named legacy .${ext}; should return unsupported_format`);
  add("ole-signature-only-docx", "bara-signatur.docx", ole.slice(0, 8), "only the 8-byte OLE signature, named .docx; should return unsupported_format, not throw");
  add("ole-named-csv", "losenord.csv", ole, "OLE container named .csv (an old .xls renamed); must not dump binary as csv");
}

function bombs(add: Add) {
  const HALF_GB = 500 * 1024 * 1024;
  const base = readZip(fixture(DOCX)).filter((e) => e.name !== "word/document.xml");
  const pre = utf8(`<?xml version="1.0" encoding="UTF-8"?><w:document ${W_NS}><w:body><w:p><w:r><w:t>`);
  const suf = utf8("</w:t></w:r></w:p></w:body></w:document>");
  add("docx-zipbomb-document", "bomb.docx", writeZip([...base, bombEntry("word/document.xml", { prefix: pre, unit: utf8("A"), reps: HALF_GB, suffix: suf })]), "document.xml inflates to 500 MB of one text run; must not hang or crash, should warn");
  add(
    "docx-zipbomb-unused-entry",
    "bomb-bilaga.docx",
    writeZip([...readZip(fixture(DOCX)), bombEntry("word/media/image1.bin", { prefix: new Uint8Array(0), unit: new Uint8Array([0]), reps: HALF_GB, suffix: new Uint8Array(0) })]),
    "valid docx plus an unreferenced entry inflating to 500 MB of zeros; should convert without inflating it",
  );
  const xlBase = readZip(fixture(XLSX)).filter((e) => e.name !== "xl/worksheets/sheet1.xml");
  const rowUnit = utf8('<row><c t="inlineStr"><is><t>A</t></is></c></row>');
  add(
    "xlsx-zipbomb-sheet",
    "bomb.xlsx",
    writeZip([...xlBase, bombEntry("xl/worksheets/sheet1.xml", { prefix: utf8(`${SHEET_HEAD}<sheetData>`), unit: rowUnit, reps: Math.floor(HALF_GB / rowUnit.length), suffix: utf8("</sheetData></worksheet>") })]),
    "sheet1.xml inflates to 500 MB (about 11 million rows); must not hang or crash, should warn",
  );
  const pBase = readZip(fixture(PPTX)).filter((e) => e.name !== "ppt/slides/slide1.xml");
  const pUnit = utf8("<a:p><a:r><a:t>A</a:t></a:r></a:p>");
  add(
    "pptx-zipbomb-slide",
    "bomb.pptx",
    writeZip([
      ...pBase,
      bombEntry("ppt/slides/slide1.xml", {
        prefix: utf8(`<?xml version="1.0"?><p:sld ${P_NS}><p:cSld><p:spTree>${GRP_HEAD}<p:sp><p:nvSpPr><p:cNvPr id="2" name="T"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/>`),
        unit: pUnit,
        reps: Math.floor(HALF_GB / pUnit.length),
        suffix: utf8("</p:txBody></p:sp></p:spTree></p:cSld></p:sld>"),
      }),
    ]),
    "slide1.xml inflates to 500 MB of paragraphs; must not hang or crash, should warn",
  );
  const many: ZipEntry[] = [];
  for (let i = 0; i < 10000; i++) many.push(makeEntry(`customXml/item${i + 10}.xml`, `<a>${i}</a>`, 0));
  add("docx-10000-entries", "manga-delar.docx", writeZip([...readZip(fixture(DOCX)), ...many]), "valid docx with 10 000 extra tiny zip entries; should convert within the time limit");
  const manyX: ZipEntry[] = [];
  for (let i = 0; i < 10000; i++) manyX.push(makeEntry(`xl/extra/e${i}.bin`, new Uint8Array([i & 255]), 0));
  add("xlsx-10000-entries", "manga-delar.xlsx", writeZip([...readZip(fixture(XLSX)), ...manyX]), "valid xlsx with 10 000 extra tiny zip entries; should convert within the time limit");
  const spaces = zlibPeriodic({ prefix: latin1(`${PAGE_TEXT}\n`), unit: latin1(" "), reps: 200 * 1024 * 1024, suffix: latin1("\n") });
  add("pdf-flate-bomb", "bomb.pdf", pdf(simplePdfObjs(undefined, stream("/Filter /FlateDecode", spaces))), "page content stream inflates to 200 MB of spaces; must not hang or crash");
}

function huge(add: Add) {
  const rows: string[] = [CSV_HEADER];
  for (let i = 1; i <= 200_000; i++) rows.push(csvRow(i));
  add("csv-200k-rows", "stor.csv", utf8(rows.join("")), "valid csv with 200 000 rows (~11 MB); should convert within the time limit");
  const longCell = "lång text ".repeat(500_000);
  add("csv-5mb-single-line", "en-rad.csv", utf8(`Rubrik;Text\nEtt;${longCell}\n`), "csv whose second line is a single 5 MB field; should convert");
  const block = utf8(Array.from({ length: 1000 }, (_, i) => csvRow(i)).join(""));
  const reps = Math.ceil((26 * 1024 * 1024) / block.length);
  add("csv-26mb-large-file", "jattestor.csv", concat(utf8(CSV_HEADER), repeatBytes(block, reps)), "26 MB csv; should add the large_file warning and still convert");
  const xr: string[] = [`${SHEET_HEAD}<dimension ref="A1:D100000"/><sheetData>`];
  for (let r = 1; r <= 100_000; r++) {
    xr.push(`<row r="${r}"><c r="A${r}" t="inlineStr"><is><t>Medlem ${r}</t></is></c><c r="B${r}"><v>${r * 3}</v></c><c r="C${r}" t="inlineStr"><is><t>Göteborg</t></is></c><c r="D${r}"><f>B${r}*2</f><v>${r * 6}</v></c></row>`);
  }
  xr.push("</sheetData></worksheet>");
  add("xlsx-100k-rows", "stor.xlsx", xlsxSheet1(xr.join("")), "valid xlsx with a 100 000-row sheet; should convert within the time limit");
  // pptx with 500 slides, all built from slide1 of the fixture
  const entries = readZip(fixture(PPTX)).filter((e) => !/^ppt\/slides\//.test(e.name) && !/^ppt\/notesSlides\//.test(e.name));
  const layoutRels = zipText(PPTX, "ppt/slides/_rels/slide1.xml.rels");
  const pres = zipText(PPTX, "ppt/presentation.xml");
  const presRels = zipText(PPTX, "ppt/_rels/presentation.xml.rels");
  const ctypes = zipText(PPTX, "[Content_Types].xml");
  const SLIDE_CT = "application/vnd.openxmlformats-officedocument.presentationml.slide+xml";
  const ids: string[] = [];
  const rels: string[] = [];
  const cts: string[] = [];
  const slides: ZipEntry[] = [];
  for (let i = 1; i <= 500; i++) {
    ids.push(`<p:sldId id="${255 + i}" r:id="rIdS${i}"/>`);
    rels.push(`<Relationship Id="rIdS${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i}.xml"/>`);
    cts.push(`<Override PartName="/ppt/slides/slide${i}.xml" ContentType="${SLIDE_CT}"/>`);
    slides.push(makeEntry(`ppt/slides/slide${i}.xml`, slideXml(textShape(2, `Bild ${i}`) + textShape(3, `Punkt ett på bild ${i}`))), makeEntry(`ppt/slides/_rels/slide${i}.xml.rels`, layoutRels));
  }
  const patched = entries.map((e) => {
    if (e.name === "ppt/presentation.xml") return makeEntry(e.name, pres.replace(/<p:sldIdLst>.*<\/p:sldIdLst>/, `<p:sldIdLst>${ids.join("")}</p:sldIdLst>`));
    if (e.name === "ppt/_rels/presentation.xml.rels") return makeEntry(e.name, presRels.replace(/<Relationship [^>]*relationships\/slide" [^>]*\/>/g, "").replace("</Relationships>", `${rels.join("")}</Relationships>`));
    if (e.name === "[Content_Types].xml") return makeEntry(e.name, ctypes.replace(/<Override PartName="\/ppt\/(slides|notesSlides)\/[^>]*\/>/g, "").replace("</Types>", `${cts.join("")}</Types>`));
    return e;
  });
  add("pptx-500-slides", "manga-bilder.pptx", writeZip([...patched, ...slides]), "valid pptx with 500 slides; should convert within the time limit");
  const trs: string[] = [];
  const cell = (t: string) => `<w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/></w:tcPr>${para(t)}</w:tc>`;
  for (let r = 1; r <= 10_000; r++) trs.push(`<w:tr>${cell(`Rad ${r}`)}${cell(`Medlem ${r}`)}${cell(`${r * 10} kr`)}</w:tr>`);
  add("docx-10k-row-table", "stor-tabell.docx", docx(docXml(para("Medlemsförteckning") + `<w:tbl><w:tblPr/><w:tblGrid/>${trs.join("")}</w:tbl>`)), "valid docx with a 10 000-row table; should convert within the time limit");
}

function nesting(add: Add) {
  const N = 2000;
  const open = "<w:tbl><w:tblPr/><w:tr><w:tc>";
  const close = `${para("")}</w:tc></w:tr></w:tbl>`;
  add("docx-2000-nested-tables", "nastlade-tabeller.docx", docx(docXml(open.repeat(N) + para("Innersta cellen") + close.repeat(N))), "2 000 tables nested inside each other; must not overflow the stack");
  const lists: string[] = [];
  for (let i = 0; i < N; i++) lists.push(`<w:p><w:pPr><w:numPr><w:ilvl w:val="${i}"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Nivå ${i}</w:t></w:r></w:p>`);
  add("docx-2000-list-levels", "listnivaer.docx", docx(docXml(lists.join(""))), "list items with ilvl 0..1999 (Word allows 0..8); should clamp, not throw");
  add("docx-50000-nested-runs", "djup-xml.docx", docx(docXml(`<w:p>${"<w:smartTag>".repeat(50_000)}<w:r><w:t>Djupt</w:t></w:r>${"</w:smartTag>".repeat(50_000)}</w:p>`)), "50 000 nested inline wrappers; must not overflow the stack");
  const grp = (inner: string) => `<p:grpSp>${GRP_HEAD}${inner}</p:grpSp>`;
  let tree = textShape(3, "Innersta formen");
  for (let i = 0; i < N; i++) tree = grp(tree);
  add("pptx-2000-nested-groups", "nastlade-grupper.pptx", pptxSlide1(slideXml(textShape(2, "Rubrik") + tree)), "slide with 2 000 nested group shapes; must not overflow the stack");
  add("pdf-nested-arrays-100k", "djupa-listor.pdf", pdf(["<< /Type /Catalog /Pages 2 0 R /Junk " + "[".repeat(100_000) + "]".repeat(100_000) + " >>", ...simplePdfObjs().slice(1)]), "catalog holds 100 000 nested arrays; must not overflow the stack");
}

function pdfSpecific(add: Add) {
  add("pdf-header-then-garbage", "skrap.pdf", concat(latin1("%PDF-1.7\n"), randomBytes(8192, 31)), "%PDF-1.7 header followed by random bytes; should return corrupt_file");
  add("pdf-header-only", "bara-huvud-17.pdf", latin1("%PDF-1.7"), "file is exactly '%PDF-1.7'; should return corrupt_file");
  add("pdf-valid-minimal", "minimal.pdf", pdf(simplePdfObjs()), "control case: hand-built valid one-page pdf; should convert to 'Hej från Silar'");
  add("pdf-broken-xref-offsets", "fel-xref.pdf", pdf(simplePdfObjs(), { xref: "wrong-offsets" }), "every xref offset is wrong; should rebuild and convert or return corrupt_file");
  add("pdf-startxref-out-of-range", "fel-startxref.pdf", pdf(simplePdfObjs(), { startxref: 99_999_999 }), "startxref points beyond the file; should rebuild and convert or return corrupt_file");
  add("pdf-no-xref-no-trailer", "utan-xref.pdf", pdf(simplePdfObjs(), { xref: "none", startxref: 0 }), "objects present but no xref table; should rebuild or return corrupt_file");
  add("pdf-zero-pages", "noll-sidor.pdf", pdf(simplePdfObjs("<< /Type /Pages /Kids [] /Count 0 >>")), "page tree with /Count 0; empty markdown must come with a warning");
  add("pdf-page-count-lies", "fel-antal.pdf", pdf(simplePdfObjs("<< /Type /Pages /Kids [3 0 R] /Count 1000000 >>")), "/Count claims 1 000 000 pages but there is one; must not loop over a million pages");
  add("pdf-circular-page-tree", "cirkel.pdf", pdf(simplePdfObjs("<< /Type /Pages /Kids [2 0 R 3 0 R] /Count 2 >>")), "Pages node lists itself as a kid; must not loop forever");
  add("pdf-self-reference", "sjalvref.pdf", pdf(["<< /Type /Catalog /Pages 2 0 R >>", "2 0 R", "<< /Type /Page >>"]), "the Pages object is just a reference to itself; must not loop forever");
  add(
    "pdf-parent-loop",
    "foraldraloop.pdf",
    pdf(["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Pages /Parent 2 0 R /Kids [2 0 R 4 0 R] /Count 1 >>", "<< /Type /Page /Parent 3 0 R /MediaBox [0 0 595 842] >>"]),
    "two Pages nodes that list each other as kids; must not loop forever",
  );
  add("pdf-content-self-loop", "innehall-loop.pdf", pdf(simplePdfObjs(undefined, "[4 0 R 4 0 R]")), "page /Contents is an array containing itself; must not loop forever");
  const id = "/ID [<00112233445566778899aabbccddeeff><00112233445566778899aabbccddeeff>]";
  const hex = (n: number, seed: number) => Array.from(randomBytes(n, seed), (b) => b.toString(16).padStart(2, "0")).join("");
  add(
    "pdf-encrypted-rc4",
    "losenord-rc4.pdf",
    pdf([...simplePdfObjs(), `<< /Filter /Standard /V 2 /R 3 /Length 128 /P -1340 /O <${hex(32, 41)}> /U <${hex(32, 42)}> >>`], { trailer: `/Encrypt 6 0 R ${id}` }),
    "pdf protected with an open password (RC4 128); should return a Swedish password warning, not throw",
  );
  add(
    "pdf-encrypted-aes256",
    "losenord-aes.pdf",
    pdf([...simplePdfObjs(), `<< /Filter /Standard /V 5 /R 6 /Length 256 /P -1028 /O <${hex(48, 43)}> /U <${hex(48, 44)}> /OE <${hex(32, 45)}> /UE <${hex(32, 46)}> /Perms <${hex(16, 47)}> /CF << /StdCF << /CFM /AESV3 /AuthEvent /DocOpen /Length 32 >> >> /StmF /StdCF /StrF /StdCF >>`], { trailer: `/Encrypt 6 0 R ${id}` }),
    "pdf protected with an open password (AES-256); should return a Swedish password warning, not throw",
  );
  const full = pdf(simplePdfObjs(undefined, stream("", `${PAGE_TEXT}\n${"BT /F1 10 Tf 72 700 Td (Mer text) Tj ET\n".repeat(200)}`)));
  const s = dec(full).indexOf("stream\n");
  add("pdf-ends-mid-stream", "slutar-i-strom.pdf", full.slice(0, s + 7 + 300), "file ends inside a content stream (no endstream, xref or trailer); should return partial text or corrupt_file");
  add("pdf-missing-objects", "saknade-objekt.pdf", pdf(["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R 77 0 R 88 0 R] /Count 3 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 0 0] /Contents 99 0 R /Rotate 45 >>"]), "page tree points at missing objects, zero-size MediaBox and odd rotation; should not throw");
  add("pdf-huge-object-number", "stort-objnr.pdf", concat(latin1("%PDF-1.7\n1 0 obj << /Type /Catalog /Pages 999999999 0 R >> endobj\n999999999 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj\nxref\n0 1\n0000000000 65535 f \ntrailer << /Size 1000000000 /Root 1 0 R >>\nstartxref\n120\n%%EOF\n")), "object number 999 999 999 and /Size 1e9; must not allocate a billion xref slots");
  add("pdf-header-after-junk", "skrap-forst.pdf", concat(randomBytes(900, 51).map((b) => (b === 0x25 ? 0x20 : b)), pdf(simplePdfObjs())), "valid pdf preceded by 900 bytes of junk (allowed by readers); should convert");
}

function csvOddities(add: Add) {
  const withNul = utf8(SAMPLE_CSV).map((b, i) => (i % 13 === 5 ? 0 : b));
  add("csv-nul-bytes", "nul.csv", withNul, "csv with NUL bytes sprinkled through it; should convert or warn, not throw");
  add("csv-only-nul", "bara-nul.csv", new Uint8Array(4096), "csv of 4096 NUL bytes; should return a warning");
  add("csv-utf16le-bom", "utf16le-bom.csv", utf16le(SAMPLE_CSV, true), "UTF-16 LE csv with BOM (Excel 'Unicode text'); should decode correctly");
  add("csv-utf16le-no-bom", "utf16le.csv", utf16le(SAMPLE_CSV, false), "UTF-16 LE csv without BOM; should decode or add encoding_fallback");
  add("csv-utf16be-bom", "utf16be.csv", utf16be(SAMPLE_CSV), "UTF-16 BE csv with BOM; should decode or add encoding_fallback");
  add("csv-mixed-line-endings", "radslut.csv", utf8("Namn;Ort\r\nÅsa;Lerum\nBo;Floda\rCia;Alingsås\r\n\rDan;Partille\n"), "csv mixing CRLF, LF and lone CR; should keep all five rows");
  add("csv-unbalanced-quote", "citat.csv", utf8(`${CSV_HEADER}Anna;"Göteborg;100,00;2026-01-01;öppnat citat\n${Array.from({ length: 5000 }, (_, i) => csvRow(i)).join("")}`), "a quote opens on row 2 and never closes; should not hang and should warn or recover");
  add("csv-5000-columns", "breda.csv", utf8(`${Array.from({ length: 5000 }, (_, i) => `Kol${i}`).join(";")}\n${Array.from({ length: 5000 }, (_, i) => String(i)).join(";")}\n`), "csv with 5 000 columns; should convert without blowing up");
  add("csv-only-delimiters", "semikolon.csv", utf8(";;;;;;;;\n".repeat(1000)), "1000 rows of only delimiters; empty markdown must come with a warning");
  add("csv-bom-only", "bom.csv", new Uint8Array([0xef, 0xbb, 0xbf]), "csv that is only a UTF-8 BOM; should return a warning");
  add("csv-single-quote-char", "citattecken.csv", utf8('"'), "csv that is a single double-quote; should not throw");
  add("csv-invalid-utf8", "trasig-utf8.csv", concat(utf8("Namn;Ort\nÅsa;"), new Uint8Array([0xc3, 0x28, 0xa0, 0xa1, 0xf0, 0x28, 0x8c, 0xbc]), utf8("\nBo;Floda\n")), "utf-8 csv with invalid byte sequences; should convert, possibly with encoding_fallback");
  add("csv-random-binary", "binar.csv", randomBytes(65536, 61), "64 KB of random bytes named .csv; should return a warning, not a giant table of garbage");
  add("csv-ragged-rows", "ojamna.csv", utf8(`a\n${Array.from({ length: 50 }, (_, i) => i).join(",")}\nx,y,z\n\n,,\n`), "rows with 1, 50, 3, 0 and 3 fields; should pad or warn, not throw");
  add("csv-markdown-hostile", "specialtecken.csv", utf8('Namn,Kod\n"pipe | inne",`kod`\n"rad\nbryt","<script>alert(1)</script>"\n=HYPERLINK("x"),**fet**\n'), "cells with pipes, backticks, html, embedded newlines and formulas; should escape and convert");
}

export function fuzzCases(): FuzzCase[] {
  const cases: FuzzCase[] = [];
  const add: Add = (id, name, data, note) => cases.push({ id, name, data, note });
  emptyFiles(add);
  truncated(add);
  flips(add);
  zipStructure(add);
  wrongExtension(add);
  missingParts(add);
  malformedXml(add);
  encrypted(add);
  bombs(add);
  huge(add);
  nesting(add);
  pdfSpecific(add);
  csvOddities(add);
  return cases;
}
